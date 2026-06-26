import {
  createBunnyTunnelHandler,
  type Fetcher,
  readBunnyTunnelConfigFromEnv,
  type RuntimeConfig,
} from "../src/app.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${expected}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    allowInsecureHttp: false,
    allowedMethods: ["GET", "POST"],
    deniedPathPrefixes: [],
    healthPath: "/__bunny_tunnel/healthz",
    preserveHostHeader: false,
    requestTimeoutMs: 30000,
    routes: [{ origin: "https://origin.example/base" }],
    viewerTokens: [],
    ...overrides,
  };
}

Deno.test("reads single-origin configuration from environment", () => {
  const env = new Map<string, string>([
    ["TUNNEL_ORIGIN", "https://origin.example"],
    ["TUNNEL_HOST", "app.example.com"],
    ["TUNNEL_VIEWER_TOKENS", "first,second"],
    ["TUNNEL_ALLOWED_METHODS", "GET,POST"],
    ["TUNNEL_DENIED_PATH_PREFIXES", "/admin,/private"],
    ["TUNNEL_ORIGIN_SHARED_SECRET", "origin-secret"],
  ]);

  const parsed = readBunnyTunnelConfigFromEnv({
    get(name) {
      return env.get(name);
    },
  });

  assertEquals(parsed.routes.length, 1);
  assertEquals(parsed.routes[0].origin, "https://origin.example");
  assertEquals(parsed.routes[0].host, "app.example.com");
  assertEquals(parsed.viewerTokens.length, 2);
  assertEquals(parsed.allowedMethods.join(","), "GET,POST");
  assertEquals(parsed.deniedPathPrefixes.join(","), "/admin,/private");
  assertEquals(parsed.originSharedSecret, "origin-secret");
});

Deno.test("requires at least one configured origin", () => {
  let failed = false;
  try {
    readBunnyTunnelConfigFromEnv({ get: () => undefined });
  } catch (error) {
    failed = error instanceof Error &&
      error.message.includes("TUNNEL_ORIGIN");
  }

  assert(failed, "Expected missing origin configuration to fail");
});

Deno.test("proxies matching requests to the configured origin", async () => {
  let upstreamRequest: Request | undefined;
  const fetcher: Fetcher = (input, init) => {
    upstreamRequest = input instanceof Request
      ? input
      : new Request(input, init);
    return Promise.resolve(
      new Response("from origin", {
        headers: { "x-origin": "yes" },
      }),
    );
  };

  const handler = createBunnyTunnelHandler({
    config: config(),
    fetcher,
  });

  const response = await handler(
    new Request("https://edge.example/api/users?active=1", {
      headers: {
        authorization: "Bearer viewer",
        connection: "close",
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "from origin");
  assert(upstreamRequest, "Expected upstream request");
  assertEquals(
    upstreamRequest.url,
    "https://origin.example/base/api/users?active=1",
  );
  assertEquals(upstreamRequest.headers.get("authorization"), null);
  assertEquals(upstreamRequest.headers.get("connection"), null);
  assertEquals(upstreamRequest.headers.get("x-forwarded-host"), "edge.example");
});

Deno.test("chooses host and path specific routes before generic routes", async () => {
  let proxiedUrl = "";
  const handler = createBunnyTunnelHandler({
    config: config({
      routes: [
        { origin: "https://generic.example" },
        {
          host: "app.example.com",
          origin: "https://app-origin.example/root",
          pathPrefix: "/app",
        },
      ],
    }),
    fetcher: (input) => {
      proxiedUrl = String(input);
      return Promise.resolve(new Response("ok"));
    },
  });

  const response = await handler(
    new Request("https://app.example.com/app/dashboard"),
  );

  assertEquals(response.status, 200);
  assertEquals(proxiedUrl, "https://app-origin.example/root/dashboard");
});

Deno.test("requires HTTPS by default", async () => {
  const handler = createBunnyTunnelHandler({ config: config() });

  const response = await handler(new Request("http://edge.example/"));

  assertEquals(response.status, 400);
  assertIncludes(await response.text(), "HTTPS required");
});

Deno.test("rejects requests without required viewer bearer token", async () => {
  const handler = createBunnyTunnelHandler({
    config: config({ viewerTokens: ["secret"] }),
  });

  const response = await handler(new Request("https://edge.example/"));

  assertEquals(response.status, 401);
});

Deno.test("allows requests with required viewer bearer token", async () => {
  const handler = createBunnyTunnelHandler({
    config: config({ viewerTokens: ["secret"] }),
    fetcher: () => Promise.resolve(new Response("ok")),
  });

  const response = await handler(
    new Request("https://edge.example/", {
      headers: { authorization: "Bearer secret" },
    }),
  );

  assertEquals(response.status, 200);
});

Deno.test("blocks methods outside the configured allow list", async () => {
  const handler = createBunnyTunnelHandler({
    config: config({ allowedMethods: ["GET"] }),
  });

  const response = await handler(
    new Request("https://edge.example/", { method: "POST", body: "data" }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "GET");
});

Deno.test("blocks denied path prefixes before proxying", async () => {
  let called = false;
  const handler = createBunnyTunnelHandler({
    config: config({ deniedPathPrefixes: ["/admin"] }),
    fetcher: () => {
      called = true;
      return Promise.resolve(new Response("unexpected"));
    },
  });

  const response = await handler(new Request("https://edge.example/admin"));

  assertEquals(response.status, 404);
  assertEquals(called, false);
});

Deno.test("signs upstream requests when an origin shared secret is configured", async () => {
  let upstreamRequest: Request | undefined;
  const handler = createBunnyTunnelHandler({
    config: config({ originSharedSecret: "origin-secret" }),
    fetcher: (input, init) => {
      upstreamRequest = input instanceof Request
        ? input
        : new Request(input, init);
      return Promise.resolve(new Response("ok"));
    },
    now: () => new Date("2026-06-26T12:00:00Z"),
  });

  const response = await handler(
    new Request("https://edge.example/api", {
      body: "hello",
      method: "POST",
    }),
  );

  assertEquals(response.status, 200);
  assert(upstreamRequest, "Expected upstream request");
  assertEquals(
    upstreamRequest.headers.get("x-bunny-tunnel-timestamp"),
    "1782475200",
  );
  assertEquals(
    upstreamRequest.headers.get("x-bunny-tunnel-body-sha256"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  assertIncludes(
    upstreamRequest.headers.get("x-bunny-tunnel-signature") ?? "",
    "v1=",
  );
});

Deno.test("serves a local health endpoint without proxying", async () => {
  let called = false;
  const handler = createBunnyTunnelHandler({
    config: config(),
    fetcher: () => {
      called = true;
      return Promise.resolve(new Response("unexpected"));
    },
  });

  const response = await handler(
    new Request("https://edge.example/__bunny_tunnel/healthz"),
  );

  assertEquals(response.status, 200);
  assertEquals(called, false);
  assertIncludes(await response.text(), "bunny-tunnel-edge-script");
});
