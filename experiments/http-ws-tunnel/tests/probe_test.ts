import { createProbeGateway, type Platform } from "../edge/gateway.ts";
import { connectProbe, runConnector } from "../connector/client.ts";
import { parseArgs } from "../connector/main.ts";
import {
  challenge,
  decodeFrame,
  FRAME_BYTES,
  type Registration,
  registration,
  SUBPROTOCOL,
} from "../protocol/mod.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function deadline<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Test deadline exceeded")),
      5000,
    );
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function fixture(overrides: Partial<Platform> = {}) {
  const config = {
    hostname: "app.example.com",
    connectorToken: crypto.randomUUID(),
    viewerToken: crypto.randomUUID(),
  };
  const work: Promise<unknown>[] = [];
  const gateway = createProbeGateway(config, {
    allowLoopbackHttp: true,
    upgrade: (request) =>
      Deno.upgradeWebSocket(request, { protocol: SUBPROTOCOL }),
    waitUntil: (promise) => {
      work.push(promise);
    },
    ...overrides,
  });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    gateway.handle,
  );
  const url = `http://127.0.0.1:${server.addr.port}`;
  const sockets: WebSocket[] = [];
  const controllers: AbortController[] = [];
  const clients: Promise<void>[] = [];
  async function raw() {
    const socket = new WebSocket(
      url.replace("http:", "ws:") + "/__probe/connect",
      {
        protocols: [SUBPROTOCOL],
        headers: { authorization: `Bearer ${config.connectorToken}` },
      },
    );
    sockets.push(socket);
    socket.binaryType = "arraybuffer";
    const ready = deferred<Registration>();
    socket.addEventListener("message", function first(event) {
      socket.removeEventListener("message", first);
      try {
        ready.resolve(registration(event.data));
      } catch {
        ready.reject(new Error("Registration rejected"));
      }
    });
    const registered = await deadline(ready.promise);
    return { socket, registered };
  }
  async function connector(
    reconnect = false,
    onRegistered?: (value: Registration) => void,
  ) {
    const ready = deferred<Registration>();
    const controller = new AbortController();
    controllers.push(controller);
    const client = (reconnect ? runConnector : connectProbe)({
      url: url.replace("http:", "ws:") + "/__probe/connect",
      token: config.connectorToken,
      allowLoopbackHttp: true,
      signal: controller.signal,
      heartbeatMs: 10,
      onRegistered: (value) => {
        ready.resolve(value);
        onRegistered?.(value);
      },
    });
    clients.push(client);
    return await deadline(ready.promise);
  }
  function probe(signal?: AbortSignal) {
    return fetch(url + "/__probe", {
      signal,
      headers: { authorization: `Bearer ${config.viewerToken}` },
    });
  }
  return {
    config,
    gateway,
    url,
    raw,
    connector,
    probe,
    async [Symbol.asyncDispose]() {
      for (const controller of controllers) controller.abort();
      gateway.dispose();
      for (
        const socket of sockets
      ) if (socket.readyState < WebSocket.CLOSING) socket.close();
      await Promise.allSettled(clients);
      await Promise.all(work);
      await server.shutdown();
    },
  };
}

async function consume(response: Response, status: number) {
  const body = await response.arrayBuffer();
  assert(
    response.status === status,
    `Expected ${status}, got ${response.status}: ${
      new TextDecoder().decode(body)
    }`,
  );
  return body;
}

Deno.test("probe requires independent credentials, scope, HTTPS and bounded settings", async () => {
  await using f = fixture();
  const make = (url: string, headers: HeadersInit = {}) =>
    f.gateway.handle(new Request(url, { headers }));
  await consume(await make("http://app.example.com/__probe"), 400);
  await consume(await make("https://other.example.com/__probe"), 421);
  await consume(await make("https://app.example.com/__probe"), 401);
  await consume(
    await make("https://app.example.com/__probe?token=forbidden"),
    400,
  );
  await consume(
    await make("https://app.example.com/__probe", {
      authorization: `Bearer ${f.config.connectorToken}`,
    }),
    401,
  );
  await consume(
    await make("https://app.example.com/__probe/connect", {
      authorization: `Bearer ${f.config.viewerToken}`,
    }),
    401,
  );
  for (
    const config of [{ ...f.config, hostname: "*.example.com" }, {
      ...f.config,
      connectorToken: "",
    }, { ...f.config, viewerToken: f.config.connectorToken }]
  ) {
    let failed = false;
    try {
      createProbeGateway(config, {
        upgrade() {
          throw new Error();
        },
        waitUntil() {},
      });
    } catch {
      failed = true;
    }
    assert(failed);
  }
});

Deno.test("real connector echoes binary challenge and returns diagnostic IDs", async () => {
  await using f = fixture();
  const registered = await f.connector();
  const response = await f.probe();
  const body = await consume(response, 200);
  assert(body.byteLength === 32);
  assert(response.headers.get("x-probe-session-id") === registered.sessionId);
  assert(response.headers.get("x-probe-isolate-id") === registered.isolateId);
  assert(response.headers.get("x-probe-request-id"));
  assert(response.headers.get("cache-control") === "no-store");
});

Deno.test("isolates do not share registration even with the same configured hostname", async () => {
  await using a = fixture();
  await using b = fixture();
  await a.connector();
  await consume(await a.probe(), 200);
  const miss = await b.probe();
  assert(miss.headers.get("x-probe-isolate-id") !== a.gateway.isolateId);
  await consume(miss, 503);
});

Deno.test("replacement fails pending probes and cannot clear the new session", async () => {
  await using f = fixture();
  const old = await f.raw();
  const sent = deferred<void>();
  old.socket.addEventListener("message", () => sent.resolve());
  const pending = f.probe();
  await deadline(sent.promise);
  const replacement = await f.connector();
  assert(replacement.sessionId !== old.registered.sessionId);
  await consume(await pending, 503);
  const next = await f.probe();
  assert(next.headers.get("x-probe-session-id") === replacement.sessionId);
  await consume(next, 200);
});

Deno.test("missing echo times out and releases pending capacity", async () => {
  await using f = fixture({ probeTimeoutMs: 25 });
  await f.raw();
  await consume(await f.probe(), 504);
  await consume(await f.probe(), 504);
});

Deno.test("concurrency cap rejects overflow without growing the queue", async () => {
  await using f = fixture({ probeTimeoutMs: 1000 });
  const { socket } = await f.raw();
  let count = 0;
  const full = deferred<void>();
  socket.addEventListener("message", () => {
    if (++count === 8) full.resolve();
  });
  const pending = Array.from({ length: 8 }, () => f.probe());
  await deadline(full.promise);
  await consume(await f.probe(), 429);
  f.gateway.dispose();
  for (const response of await Promise.all(pending)) {
    await consume(response, 503);
  }
});

Deno.test("malformed and mismatched frames terminate the session", async () => {
  for (const bad of ["text", "length", "payload"]) {
    await using f = fixture();
    const { socket } = await f.raw();
    socket.addEventListener("message", (event) => {
      if (bad === "text") socket.send("{}");
      else if (bad === "length") socket.send(new Uint8Array(1));
      else {
        const bytes = new Uint8Array(event.data);
        bytes[36] ^= 1;
        socket.send(bytes);
      }
    });
    await consume(await f.probe(), 503);
  }
});

Deno.test("idle and lifetime expiration remove registration", async () => {
  for (const bounds of [{ idleMs: 20 }, { lifetimeMs: 20 }]) {
    await using f = fixture(bounds);
    const { socket } = await f.raw();
    await deadline(
      new Promise<void>((resolve) =>
        socket.addEventListener("close", () => resolve(), { once: true })
      ),
    );
    await consume(await f.probe(), 503);
  }
});

Deno.test("connector reconnects after bounded lifetime rotation", async () => {
  await using f = fixture({ lifetimeMs: 100 });
  const first = await f.connector(true);
  let next: Response | undefined;
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await f.probe();
    const changed = response.status === 200 &&
      response.headers.get("x-probe-session-id") !== first.sessionId;
    await consume(response, response.status);
    if (changed) {
      next = response;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(next, "Connector did not reconnect");
});

Deno.test("viewer abort removes pending work and a late echo is harmless", async () => {
  await using f = fixture();
  const { socket } = await f.raw();
  const sent = deferred<ArrayBuffer>();
  socket.addEventListener("message", (event) => sent.resolve(event.data));
  const controller = new AbortController();
  const pending = f.probe(controller.signal).catch(() => undefined);
  const frame = await deadline(sent.promise);
  controller.abort();
  const response = await pending;
  if (response) await response.body?.cancel();
  socket.send(frame);
  socket.addEventListener("message", (event) => {
    if (event.data instanceof ArrayBuffer) socket.send(event.data);
  });
  await consume(await f.probe(), 200);
});

Deno.test("wire frame rejects wrong types and identifiers", () => {
  const frame = challenge(crypto.randomUUID());
  assert(frame.length === FRAME_BYTES);
  assert(decodeFrame(frame.buffer).bytes.length === FRAME_BYTES);
  for (
    const value of [
      "invalid",
      new ArrayBuffer(0),
      new Uint8Array(FRAME_BYTES).buffer,
    ]
  ) {
    let failed = false;
    try {
      decodeFrame(value);
    } catch {
      failed = true;
    }
    assert(failed);
  }
});

Deno.test("invalid connector startup configuration fails before any network or retry", async () => {
  const token = crypto.randomUUID();
  for (
    const options of [
      { url: "wss://app.example.com/__probe/connect", token: "" },
      { url: "ws://127.0.0.1/__probe/connect", token },
      { url: "wss://app.example.com/__probe/connect?token=forbidden", token },
      { url: "wss://app.example.com/__probe/connect", token, heartbeatMs: 0 },
    ]
  ) {
    let failed = false;
    try {
      await runConnector(options);
    } catch {
      failed = true;
    }
    assert(failed);
  }
  for (
    const args of [[], ["endpoint", "unknown"], [
      "endpoint",
      "--loopback",
      "extra",
    ]]
  ) {
    let failed = false;
    try {
      parseArgs(args);
    } catch {
      failed = true;
    }
    assert(failed);
  }
});

Deno.test("bad upgrade attempts never replace an authenticated connector", async () => {
  await using f = fixture();
  const registered = await f.connector();
  const rejectedHeaders: Record<string, string>[] = [
    {
      origin: "https://app.example.com",
      "sec-websocket-protocol": SUBPROTOCOL,
    },
    { "sec-websocket-protocol": "other-protocol" },
  ];
  for (const extra of rejectedHeaders) {
    const response = await fetch(f.url + "/__probe/connect", {
      headers: {
        authorization: `Bearer ${f.config.connectorToken}`,
        upgrade: "websocket",
        ...extra,
      },
    });
    await consume(response, 400);
  }
  const method = await fetch(f.url + "/__probe", {
    method: "POST",
    body: "forbidden",
    headers: { authorization: `Bearer ${f.config.viewerToken}` },
  });
  await consume(method, 405);
  const response = await f.probe();
  assert(response.headers.get("x-probe-session-id") === registered.sessionId);
  await consume(response, 200);
});

Deno.test("oversized control messages close the connector and resolve lifetime work", async () => {
  await using f = fixture();
  const { socket } = await f.raw();
  const closed = new Promise<void>((resolve) =>
    socket.addEventListener("close", () => resolve(), { once: true })
  );
  socket.send("x".repeat(513));
  await deadline(closed);
  await consume(await f.probe(), 503);
});

Deno.test("healthy session rotations reset accumulated reconnect backoff", async () => {
  await using f = fixture({ lifetimeMs: 30 });
  const times: number[] = [];
  const rotated = deferred<void>();
  await f.connector(true, () => {
    times.push(performance.now());
    if (times.length === 4) rotated.resolve();
  });
  await deadline(rotated.promise);
  for (let index = 1; index < times.length; index++) {
    assert(
      times[index] - times[index - 1] < 1000,
      "Healthy rotation retained failure backoff",
    );
  }
});
