// cspell:ignore nosniff
import {
  canSend,
  challenge,
  decodeFrame,
  equalBytes,
  exactHostname,
  IDLE_MS,
  LIFETIME_MS,
  parseControl,
  SUBPROTOCOL,
  validateToken,
} from "../protocol/mod.ts";

export interface GatewayConfig {
  hostname: string;
  connectorToken: string;
  viewerToken: string;
}

export interface Platform {
  upgrade(request: Request): { socket: WebSocket; response: Response };
  waitUntil(work: Promise<unknown>): void;
  allowLoopbackHttp?: boolean;
  probeTimeoutMs?: number;
  idleMs?: number;
  lifetimeMs?: number;
}

interface Pending {
  frame: Uint8Array;
  finish(status: number, reason: string): void;
}

interface Session {
  id: string;
  socket: WebSocket;
  pending: Map<string, Pending>;
  lastSeen: number;
  end(code: number, reason: string): void;
}

export function readConfig(
  get: (name: string) => string | undefined,
): GatewayConfig {
  return {
    hostname: get("TUNNEL_PROBE_HOSTNAME") ?? "",
    connectorToken: get("TUNNEL_PROBE_CONNECTOR_TOKEN") ?? "",
    viewerToken: get("TUNNEL_PROBE_VIEWER_TOKEN") ?? "",
  };
}

function boundedMs(value: number, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error("Invalid probe timer.");
  }
  return value;
}

export function createProbeGateway(config: GatewayConfig, platform: Platform) {
  const hostname = exactHostname(config.hostname);
  const connectorToken = validateToken(config.connectorToken);
  const viewerToken = validateToken(config.viewerToken);
  if (connectorToken === viewerToken) {
    throw new Error("Use independent tokens.");
  }
  const encoder = new TextEncoder();
  // Hash credentials once; comparisons always operate on equal-length digests.
  const hash = (value: string) =>
    crypto.subtle.digest("SHA-256", encoder.encode(value));
  const connectorDigest = hash(`Bearer ${connectorToken}`);
  const viewerDigest = hash(`Bearer ${viewerToken}`);
  const timeoutMs = boundedMs(platform.probeTimeoutMs ?? 3000, 5000);
  const idleMs = boundedMs(platform.idleMs ?? IDLE_MS, IDLE_MS);
  const lifetimeMs = boundedMs(platform.lifetimeMs ?? LIFETIME_MS, LIFETIME_MS);
  const isolateId = crypto.randomUUID();
  // This closure models one isolate only. There is deliberately no global registry.
  let active: Session | undefined;
  let disposed = false;

  function response(
    status: number,
    reason: string,
    requestId: string,
    sessionId?: string,
  ) {
    return new Response(status === 200 ? null : reason, {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-probe-isolate-id": isolateId,
        "x-probe-request-id": requestId,
        ...(sessionId ? { "x-probe-session-id": sessionId } : {}),
      },
    });
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const local = platform.allowLoopbackHttp && url.protocol === "http:" &&
      url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !local) {
      return response(400, "HTTPS required", requestId);
    }
    if (url.hostname !== hostname && !local) {
      return response(421, "Wrong hostname", requestId);
    }
    const connect = url.pathname === "/__probe/connect";
    if (!connect && url.pathname !== "/__probe") {
      return response(404, "Not found", requestId);
    }
    if (url.search) {
      return response(400, "Query parameters forbidden", requestId);
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization.length > 512) {
      return response(401, "Unauthorized", requestId);
    }
    const supplied = new Uint8Array(await hash(authorization));
    const expected = new Uint8Array(
      await (connect ? connectorDigest : viewerDigest),
    );
    if (!equalBytes(supplied, expected)) {
      return response(401, "Unauthorized", requestId);
    }
    if (request.method !== "GET" || request.body !== null) {
      return response(405, "Body-free GET required", requestId);
    }
    if (disposed) return response(503, "Probe stopped", requestId);
    if (connect) {
      if (
        request.headers.has("origin") ||
        request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
        request.headers.get("sec-websocket-protocol") !== SUBPROTOCOL
      ) return response(400, "Connector protocol required", requestId);
      let upgraded: { socket: WebSocket; response: Response };
      try {
        upgraded = platform.upgrade(request);
      } catch {
        return response(400, "Upgrade rejected", requestId);
      }
      active?.end(4001, "Session replaced");
      const { socket } = upgraded;
      socket.binaryType = "arraybuffer";
      let resolveClosed!: () => void;
      let ended = false;
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });
      const session: Session = {
        id: crypto.randomUUID(),
        socket,
        pending: new Map(),
        lastSeen: Date.now(),
        end(code, reason) {
          if (ended) return;
          ended = true;
          clearInterval(idleTimer);
          clearTimeout(lifetimeTimer);
          if (active === session) active = undefined;
          for (const pending of [...session.pending.values()]) {
            pending.finish(503, reason);
          }
          if (socket.readyState < WebSocket.CLOSING) socket.close(code, reason);
          if (socket.readyState === WebSocket.CLOSED) resolveClosed();
        },
      };
      const idleTimer = setInterval(() => {
        if (Date.now() - session.lastSeen >= idleMs) {
          session.end(4002, "Heartbeat expired");
        }
      }, Math.min(1000, idleMs));
      const lifetimeTimer = setTimeout(
        () => session.end(4003, "Session rotation"),
        lifetimeMs,
      );
      active = session;
      socket.addEventListener("open", () => {
        if (ended) return;
        socket.send(
          JSON.stringify({
            type: "registered",
            version: 1,
            isolateId,
            sessionId: session.id,
            hostname,
          }),
        );
      });
      socket.addEventListener("message", (event) => {
        if (ended) return;
        try {
          if (typeof event.data === "string") {
            const control = parseControl(event.data);
            if (
              control.type !== "heartbeat" ||
              Object.keys(control).length !== 1 || !canSend(socket)
            ) {
              throw new Error("Invalid heartbeat");
            }
            session.lastSeen = Date.now();
            socket.send('{"type":"heartbeat-ack"}');
          } else {
            const frame = decodeFrame(event.data);
            const pending = session.pending.get(frame.id);
            // A timed-out or cancelled request may have a valid late echo.
            if (!pending) return;
            if (!equalBytes(pending.frame, frame.bytes)) {
              throw new Error("Incorrect echo");
            }
            session.lastSeen = Date.now();
            pending.finish(200, "");
          }
        } catch {
          session.end(1008, "Invalid protocol message");
        }
      });
      socket.addEventListener(
        "close",
        () => {
          session.end(4000, "Connector disconnected");
          resolveClosed();
        },
      );
      socket.addEventListener(
        "error",
        () => session.end(4000, "Connector failed"),
      );
      platform.waitUntil(closed);
      return upgraded.response;
    }

    const session = active;
    if (!session || session.socket.readyState !== WebSocket.OPEN) {
      return response(503, "No connector in this isolate", requestId);
    }
    if (session.pending.size >= 8 || !canSend(session.socket)) {
      return response(429, "Probe capacity reached", requestId, session.id);
    }
    const frame = challenge(requestId);
    return await new Promise<Response>((resolve) => {
      let settled = false;
      const finish = (status: number, reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
        session.pending.delete(requestId);
        const result = response(status, reason, requestId, session.id);
        if (status === 200) {
          result.headers.set("content-type", "application/octet-stream");
          resolve(new Response(frame.slice(36), { headers: result.headers }));
        } else resolve(result);
      };
      const abort = () => finish(499, "Viewer cancelled");
      const timer = setTimeout(() => finish(504, "Probe timed out"), timeoutMs);
      session.pending.set(requestId, { frame, finish });
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) {
        abort();
        return;
      }
      try {
        session.socket.send(frame);
      } catch {
        session.end(4000, "Connector send failed");
      }
    });
  }

  return {
    handle,
    isolateId,
    dispose() {
      disposed = true;
      active?.end(4000, "Probe stopped");
    },
  };
}
