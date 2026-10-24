import {
  canSend,
  decodeFrame,
  HEARTBEAT_MS,
  IDLE_MS,
  parseControl,
  type Registration,
  registration,
  SUBPROTOCOL,
  validateToken,
} from "../protocol/mod.ts";

export interface ConnectorOptions {
  url: string;
  token: string;
  allowLoopbackHttp?: boolean;
  heartbeatMs?: number;
  signal?: AbortSignal;
  onRegistered?: (value: Registration) => void;
}

function validateOptions(options: ConnectorOptions): URL {
  validateToken(options.token);
  const url = new URL(options.url);
  const local = options.allowLoopbackHttp && url.protocol === "ws:" &&
    url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "wss:" && !local) || url.username || url.password ||
    url.search || url.hash || url.pathname !== "/__probe/connect"
  ) throw new Error("An exact secure connector endpoint is required.");
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  if (
    !Number.isInteger(heartbeatMs) || heartbeatMs < 1 ||
    heartbeatMs > HEARTBEAT_MS
  ) {
    throw new Error("Invalid heartbeat interval.");
  }
  return url;
}

// Deno's header-capable WebSocket constructor keeps bearer tokens out of URLs.
export function connectProbe(options: ConnectorOptions): Promise<void> {
  const url = validateOptions(options);
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  if (options.signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, {
      protocols: [SUBPROTOCOL],
      headers: { authorization: `Bearer ${options.token}` },
    });
    socket.binaryType = "arraybuffer";
    let registered = false;
    let lastAck = Date.now();
    let ended = false;
    const finish = (failure?: Error) => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      options.signal?.removeEventListener("abort", abort);
      if (socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "Connector stopped");
      }
      failure ? reject(failure) : resolve();
    };
    const abort = () => finish();
    const timer = setInterval(() => {
      if (Date.now() - lastAck >= IDLE_MS) {
        finish(new Error("Gateway heartbeat expired"));
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        if (!canSend(socket)) {
          finish(new Error("Connector send buffer full"));
          return;
        }
        socket.send('{"type":"heartbeat"}');
      }
    }, heartbeatMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    socket.addEventListener("message", (event) => {
      if (ended) return;
      try {
        if (!registered) {
          const value = registration(event.data);
          registered = true;
          lastAck = Date.now();
          options.onRegistered?.(value);
        } else if (typeof event.data === "string") {
          const control = parseControl(event.data);
          if (
            control.type !== "heartbeat-ack" ||
            Object.keys(control).length !== 1
          ) {
            throw new Error("Invalid acknowledgement");
          }
          lastAck = Date.now();
        } else {
          const frame = decodeFrame(event.data);
          if (!canSend(socket)) throw new Error("Connector send buffer full");
          socket.send(frame.bytes);
        }
      } catch {
        finish(new Error("Gateway protocol failure"));
      }
    });
    socket.addEventListener(
      "error",
      () => finish(new Error("Connector connection failed")),
    );
    socket.addEventListener(
      "close",
      () => finish(registered ? undefined : new Error("Registration failed")),
    );
  });
}

export async function runConnector(options: ConnectorOptions): Promise<void> {
  validateOptions(options);
  let retryMs = 250;
  while (!options.signal?.aborted) {
    try {
      await connectProbe({
        ...options,
        onRegistered(value) {
          retryMs = 250;
          options.onRegistered?.(value);
        },
      });
    } catch { /* Retry without emitting endpoints, headers, or credentials. */ }
    if (options.signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(
        done,
        retryMs + Math.floor(Math.random() * retryMs),
      );
      options.signal?.addEventListener("abort", done, { once: true });
      if (options.signal?.aborted) done();
    });
    retryMs = Math.min(10_000, retryMs * 2);
  }
}
