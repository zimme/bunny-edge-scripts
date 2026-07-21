import {
  createBunnyTunnelHandler,
  type Fetcher,
  readBunnyTunnelConfigFromEnv,
  type RuntimeConfig,
  verifyBunnyTunnelSignature,
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
    allowPublic: true,
    allowInsecureHttp: false,
    allowInsecureOrigin: false,
    allowedMethods: ["GET", "POST"],
    deniedPathPrefixes: [],
    healthPath: "/__bunny_tunnel/healthz",
    maxBodyBytes: 10 * 1024 * 1024,
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
    ["TUNNEL_MAX_BODY_BYTES", "4096"],
  ]);

  const parsed = readBunnyTunnelConfigFromEnv({
    get(name) {
      return env.get(name);
    },
  });

  assertEquals(parsed.routes.length, 1);
  assertEquals(parsed.allowPublic, false);
  assertEquals(parsed.routes[0].origin, "https://origin.example");
  assertEquals(parsed.routes[0].host, "app.example.com");
  assertEquals(parsed.viewerTokens.length, 2);
  assertEquals(parsed.allowedMethods.join(","), "GET,POST");
  assertEquals(parsed.deniedPathPrefixes.join(","), "/admin,/private");
  assertEquals(parsed.originSharedSecret, "origin-secret");
  assertEquals(parsed.maxBodyBytes, 4096);
});

Deno.test("uses the secure default method allow list", () => {
  const parsed = readBunnyTunnelConfigFromEnv({
    get(name) {
      const values: Record<string, string> = {
        TUNNEL_ALLOW_PUBLIC: "true",
        TUNNEL_ORIGIN: "https://origin.example",
      };
      return values[name];
    },
  });

  assertEquals(
    parsed.allowedMethods.join(","),
    "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  );
});

Deno.test("requires viewer auth unless public access is explicit", () => {
  let failed = false;
  try {
    readBunnyTunnelConfigFromEnv({
      get(name) {
        return name === "TUNNEL_ORIGIN" ? "https://origin.example" : undefined;
      },
    });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("VIEWER_TOKEN");
  }

  assert(failed, "Expected implicit public access to fail");
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

Deno.test("rejects invalid tunnel limits", () => {
  let failed = false;
  try {
    readBunnyTunnelConfigFromEnv({
      get(name) {
        const values: Record<string, string> = {
          TUNNEL_ORIGIN: "https://origin.example",
          TUNNEL_VIEWER_TOKEN: "secret",
          TUNNEL_MAX_BODY_BYTES: "999999999",
        };
        return values[name];
      },
    });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("MAX_BODY_BYTES");
  }

  assert(failed, "Expected an unsafe body limit to fail");
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

Deno.test("strips spoofable forwarding and tunnel signature headers", async () => {
  let upstreamRequest: Request | undefined;
  const handler = createBunnyTunnelHandler({
    config: config(),
    fetcher: (input, init) => {
      upstreamRequest = input instanceof Request
        ? input
        : new Request(input, init);
      return Promise.resolve(new Response("ok"));
    },
  });

  await handler(
    new Request("https://edge.example/", {
      headers: {
        "x-bunny-tunnel-signature": "v1=forged",
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-port": "1234",
        "x-original-url": "/admin",
      },
    }),
  );

  assert(upstreamRequest, "Expected upstream request");
  assertEquals(upstreamRequest.headers.get("x-bunny-tunnel-signature"), null);
  assertEquals(upstreamRequest.headers.get("x-forwarded-for"), null);
  assertEquals(upstreamRequest.headers.get("x-forwarded-port"), null);
  assertEquals(upstreamRequest.headers.get("x-original-url"), null);
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

Deno.test("does not trust forwarded headers as proof of HTTPS", async () => {
  const handler = createBunnyTunnelHandler({ config: config() });
  const response = await handler(
    new Request("http://edge.example/", {
      headers: { "x-forwarded-proto": "https" },
    }),
  );

  assertEquals(response.status, 400);
});

Deno.test("requires HTTPS origins unless explicitly enabled", () => {
  let failed = false;
  try {
    createBunnyTunnelHandler({
      config: config({ routes: [{ origin: "http://origin.example" }] }),
    });
  } catch {
    failed = true;
  }

  assert(failed, "Expected insecure origin configuration to fail");
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

Deno.test("rejects ambiguous encoded paths", async () => {
  const handler = createBunnyTunnelHandler({ config: config() });
  // cspell:disable
  for (
    const pathname of [
      "/admin%2Fsettings",
      "/admin%252Fsettings",
      "/invalid%zzpath",
      "/invalid%C0%AFpath",
    ]
  ) {
    const response = await handler(
      new Request(`https://edge.example${pathname}`),
    );
    assertEquals(response.status, 400);
  }
  // cspell:enable
});

Deno.test("encoded path characters cannot bypass denied prefixes", async () => {
  let called = false;
  const handler = createBunnyTunnelHandler({
    config: config({ deniedPathPrefixes: ["/admin"] }),
    fetcher: () => {
      called = true;
      return Promise.resolve(new Response("unexpected"));
    },
  });

  const response = await handler(new Request("https://edge.example/%61dmin"));

  assertEquals(response.status, 404);
  assertEquals(called, false);
});

Deno.test("canonicalizes safe encoded path characters before routing", async () => {
  let proxiedUrl = "";
  const handler = createBunnyTunnelHandler({
    config: config({
      routes: [{ origin: "https://origin.example", pathPrefix: "/files;v1" }],
    }),
    fetcher: (input) => {
      proxiedUrl = String(input);
      return Promise.resolve(new Response("ok"));
    },
  });

  const response = await handler(
    new Request("https://edge.example/files%3Bv1/report%20one"),
  );

  assertEquals(response.status, 200);
  assertEquals(proxiedUrl, "https://origin.example/report%20one");
});

Deno.test("rejects request bodies over the configured limit", async () => {
  let called = false;
  const handler = createBunnyTunnelHandler({
    config: config({ maxBodyBytes: 4 }),
    fetcher: () => {
      called = true;
      return Promise.resolve(new Response("unexpected"));
    },
  });
  const response = await handler(
    new Request("https://edge.example/", {
      body: "hello",
      method: "POST",
    }),
  );

  assertEquals(response.status, 413);
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
    "v2=",
  );
  assertEquals(upstreamRequest.headers.get("x-bunny-tunnel-version"), "v2");
  assertEquals(
    upstreamRequest.headers.get("x-bunny-tunnel-origin"),
    "https://origin.example",
  );
  assert(
    /^[a-f0-9]{32}$/.test(
      upstreamRequest.headers.get("x-bunny-tunnel-nonce") ?? "",
    ),
    "Expected a random signature nonce",
  );
  assertEquals(
    await verifyBunnyTunnelSignature(upstreamRequest, "origin-secret", {
      now: () => new Date("2026-06-26T12:00:00Z"),
    }),
    true,
  );
  assertEquals(
    await verifyBunnyTunnelSignature(upstreamRequest, "origin-secret", {
      now: () => new Date("2026-06-26T12:00:00Z"),
    }),
    false,
  );
});

Deno.test("binds signed requests to the selected origin", async () => {
  let upstreamRequest: Request | undefined;
  const now = () => new Date("2026-06-26T12:00:00Z");
  const handler = createBunnyTunnelHandler({
    config: config({ originSharedSecret: "origin-secret" }),
    fetcher: (input, init) => {
      upstreamRequest = input instanceof Request
        ? input
        : new Request(input, init);
      return Promise.resolve(new Response("ok"));
    },
    now,
  });

  await handler(new Request("https://edge.example/api"));
  assert(upstreamRequest, "Expected upstream request");

  const replayedAtAnotherOrigin = new Request(
    "https://another-origin.example/api",
    { headers: upstreamRequest.headers },
  );
  assertEquals(
    await verifyBunnyTunnelSignature(
      replayedAtAnotherOrigin,
      "origin-secret",
      { now },
    ),
    false,
  );
});

Deno.test("supports explicit origin binding when Host is preserved", async () => {
  let upstreamRequest: Request | undefined;
  const now = () => new Date("2026-06-26T12:00:00Z");
  const handler = createBunnyTunnelHandler({
    config: config({
      originSharedSecret: "origin-secret",
      preserveHostHeader: true,
    }),
    fetcher: (input, init) => {
      const proxied = input instanceof Request
        ? input
        : new Request(input, init);
      const observedUrl = new URL(proxied.url);
      observedUrl.host = "edge.example";
      upstreamRequest = new Request(observedUrl, {
        headers: proxied.headers,
      });
      return Promise.resolve(new Response("ok"));
    },
    now,
  });

  await handler(new Request("https://edge.example/api"));
  assert(upstreamRequest, "Expected upstream request");
  assertEquals(
    await verifyBunnyTunnelSignature(upstreamRequest, "origin-secret", {
      expectedOrigin: "https://origin.example",
      now,
    }),
    true,
  );
});

Deno.test("bounds bodies while verifying origin signatures", async () => {
  let upstreamRequest: Request | undefined;
  const now = () => new Date("2026-06-26T12:00:00Z");
  const handler = createBunnyTunnelHandler({
    config: config({ originSharedSecret: "origin-secret" }),
    fetcher: (input, init) => {
      upstreamRequest = input instanceof Request
        ? input
        : new Request(input, init);
      return Promise.resolve(new Response("ok"));
    },
    now,
  });

  await handler(
    new Request("https://edge.example/api", {
      body: "hello",
      method: "POST",
    }),
  );
  assert(upstreamRequest, "Expected upstream request");
  assertEquals(
    await verifyBunnyTunnelSignature(upstreamRequest, "origin-secret", {
      maxBodyBytes: 4,
      now,
    }),
    false,
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

Deno.test("health checks still require HTTPS by default", async () => {
  const handler = createBunnyTunnelHandler({ config: config() });
  const response = await handler(
    new Request("http://edge.example/__bunny_tunnel/healthz"),
  );

  assertEquals(response.status, 400);
});
