import {
  type BunnyDnsZone,
  createHandler,
  DNS_RECORD_TYPE_A,
  DNS_RECORD_TYPE_AAAA,
  type Fetcher,
  readConfigFromEnv,
  type RuntimeConfig,
} from "../src/app.js";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertThrows(callback: () => unknown): void {
  try {
    callback();
  } catch {
    return;
  }

  throw new Error("Expected callback to throw");
}

async function withConsoleErrorSilenced<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
}

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    apiBaseUrl: "https://api.bunny.net",
    bunnyApiKey: "account-api-key",
    sharedSecrets: ["ddns-secret"],
    username: "inadyn",
    allowedHosts: [],
    deniedHosts: [],
    allowedZones: [],
    deniedZones: [],
    autoCreate: true,
    defaultTtl: 900,
    allowInsecureHttp: false,
    multiRecordMode: "reject",
    maxHostnames: 25,
    maxMutations: 40,
    managedComment: "Managed by test",
    ...overrides,
  };
}

function auth(password = "ddns-secret", username = "inadyn"): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function makeRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://ddns.example${path}`, {
    ...init,
    headers: {
      Authorization: auth(),
      ...(init.headers ?? {}),
    },
  });
}

function makeFetch(
  zones: BunnyDnsZone[],
  events: Array<{ method: string; path: string; body?: unknown }> = [],
): Fetcher {
  let nextRecordId = 10_000;

  return (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    const path = url.pathname;
    const body = typeof init.body === "string"
      ? JSON.parse(init.body)
      : undefined;

    events.push({ method, path, body });

    if (method === "GET" && path === "/dnszone") {
      return Promise.resolve(Response.json({
        Items: zones,
        CurrentPage: 1,
        TotalItems: zones.length,
        HasMoreItems: false,
      }));
    }

    const updateMatch = path.match(/^\/dnszone\/(\d+)\/records\/(\d+)$/);
    if (method === "POST" && updateMatch) {
      const zone = zones.find((item) => item.Id === Number(updateMatch[1]));
      const record = zone?.Records?.find((item) =>
        item.Id === Number(updateMatch[2])
      );
      if (!record || !body || typeof body !== "object") {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      record.Value = String((body as { Value: string }).Value);
      record.Type = Number((body as { Type: number }).Type);
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const createMatch = path.match(/^\/dnszone\/(\d+)\/records$/);
    if (method === "PUT" && createMatch) {
      const zone = zones.find((item) => item.Id === Number(createMatch[1]));
      if (!zone || !body || typeof body !== "object") {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      zone.Records ??= [];
      zone.Records.push({
        Id: nextRecordId,
        Type: Number((body as { Type: number }).Type),
        Ttl: Number((body as { Ttl: number }).Ttl),
        Value: String((body as { Value: string }).Value),
        Name: String((body as { Name: string }).Name),
        Disabled: false,
      });
      nextRecordId += 1;
      return Promise.resolve(new Response(null, { status: 201 }));
    }

    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };
}

function makePagedFetch(
  pages: BunnyDnsZone[][],
  events: Array<{ method: string; path: string; body?: unknown }> = [],
): Fetcher {
  return (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    events.push({ method, path: `${url.pathname}?${url.searchParams}` });

    if (method !== "GET" || url.pathname !== "/dnszone") {
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    }

    const page = Number(url.searchParams.get("page") ?? "1");
    const items = pages[page - 1] ?? [];
    return Promise.resolve(Response.json({
      Items: items,
      CurrentPage: page,
      TotalItems: pages.flat().length,
      HasMoreItems: page < pages.length,
    }));
  };
}

Deno.test("reads required and optional configuration from environment values", () => {
  const values = new Map([
    ["BUNNY_API_KEY", "account-api-key"],
    ["DDNS_SHARED_SECRETS", "old-secret,new-secret"],
    ["DDNS_USERNAME", "inadyn"],
    ["DDNS_ALLOWED_HOSTS", "home.example.com,*.lan.example.com"],
    ["DDNS_DENIED_ZONES", "blocked.example.com"],
    ["DDNS_AUTO_CREATE", "false"],
    ["DDNS_TTL", "300"],
    ["DDNS_MULTI_RECORD_MODE", "update-all"],
    ["DDNS_MAX_HOSTNAMES", "5"],
    ["DDNS_MAX_MUTATIONS", "8"],
    ["DDNS_RECORD_COMMENT", "Managed by test"],
  ]);

  const parsed = readConfigFromEnv({
    get(name: string) {
      return values.get(name);
    },
  });

  assertDeepEqual(parsed.sharedSecrets, ["old-secret", "new-secret"]);
  assertEqual(parsed.username, "inadyn");
  assertDeepEqual(parsed.allowedHosts, [
    "home.example.com",
    "*.lan.example.com",
  ]);
  assertDeepEqual(parsed.deniedZones, ["blocked.example.com"]);
  assertEqual(parsed.autoCreate, false);
  assertEqual(parsed.defaultTtl, 300);
  assertEqual(parsed.multiRecordMode, "update-all");
  assertEqual(parsed.maxHostnames, 5);
  assertEqual(parsed.maxMutations, 8);
  assertEqual(parsed.managedComment, "Managed by test");
});

Deno.test("requires Bunny API and DDNS secrets in configuration", () => {
  assertThrows(() =>
    readConfigFromEnv({
      get() {
        return undefined;
      },
    })
  );

  assertThrows(() =>
    readConfigFromEnv({
      get(name: string) {
        return name === "BUNNY_API_KEY" ? "account-api-key" : undefined;
      },
    })
  );
});

Deno.test("rejects invalid security configuration instead of failing open", () => {
  assertThrows(() =>
    readConfigFromEnv({
      get(name: string) {
        const values: Record<string, string> = {
          BUNNY_API_KEY: "account-api-key",
          DDNS_SHARED_SECRET: "secret",
          DDNS_AUTO_CREATE: "flase",
        };
        return values[name];
      },
    })
  );

  assertThrows(() =>
    readConfigFromEnv({
      get(name: string) {
        const values: Record<string, string> = {
          BUNNY_API_KEY: "account-api-key",
          DDNS_SHARED_SECRET: "secret",
          DDNS_MAX_MUTATIONS: "41",
        };
        return values[name];
      },
    })
  );
});

Deno.test("updates an existing A record using the DynDNS endpoint", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [{
      Id: 101,
      Type: DNS_RECORD_TYPE_A,
      Ttl: 900,
      Value: "198.51.100.1",
      Name: "home",
    }],
  }];
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones, events),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.7"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.7\n");
  assertEqual(zones[0].Records?.[0].Value, "203.0.113.7");
  assertDeepEqual(events.map((event) => `${event.method} ${event.path}`), [
    "GET /dnszone",
    "POST /dnszone/1/records/101",
  ]);
  assertDeepEqual(events[1].body, {
    Type: DNS_RECORD_TYPE_A,
    Ttl: 900,
    Value: "203.0.113.7",
    Name: "home",
    Id: 101,
  });
});

Deno.test("paginates Bunny DNS zones before choosing the matching zone", async () => {
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config(),
    fetcher: makePagedFetch(
      [
        [{ Id: 1, Domain: "first.example.com", Records: [] }],
        [{
          Id: 2,
          Domain: "example.com",
          Records: [{
            Id: 202,
            Type: DNS_RECORD_TYPE_A,
            Value: "203.0.113.7",
            Name: "home",
          }],
        }],
      ],
      events,
    ),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.7"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "nochg 203.0.113.7\n");
  assertDeepEqual(events.map((event) => event.path), [
    "/dnszone?page=1&perPage=1000",
    "/dnszone?page=2&perPage=1000",
  ]);
});

Deno.test("returns nochg when the existing record already has the requested address", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [{
      Id: 101,
      Type: DNS_RECORD_TYPE_A,
      Value: "203.0.113.7",
      Name: "home",
    }],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.7"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "nochg 203.0.113.7\n");
});

Deno.test("creates missing records when auto-create is enabled", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [],
  }];
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones, events),
  });

  const response = await handler(
    makeRequest("/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.9\n");
  assertEqual(zones[0].Records?.[0].Name, "home");
  assertEqual(zones[0].Records?.[0].Type, DNS_RECORD_TYPE_A);
  assertEqual(zones[0].Records?.[0].Value, "203.0.113.9");
  assertDeepEqual(events.map((event) => `${event.method} ${event.path}`), [
    "GET /dnszone",
    "PUT /dnszone/1/records",
  ]);
});

Deno.test("creates root records with an empty Bunny record name", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.9\n");
  assertEqual(zones[0].Records?.[0].Name, "");
});

Deno.test("uses the longest matching Bunny DNS zone", async () => {
  const zones: BunnyDnsZone[] = [
    {
      Id: 1,
      Domain: "example.com",
      Records: [{
        Id: 101,
        Type: DNS_RECORD_TYPE_A,
        Value: "203.0.113.1",
        Name: "home",
      }],
    },
    {
      Id: 2,
      Domain: "home.example.com",
      Records: [{
        Id: 201,
        Type: DNS_RECORD_TYPE_A,
        Value: "203.0.113.2",
        Name: "",
      }],
    },
  ];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.9\n");
  assertEqual(zones[0].Records?.[0].Value, "203.0.113.1");
  assertEqual(zones[1].Records?.[0].Value, "203.0.113.9");
});

Deno.test("returns nohost when auto-create is disabled and no record exists", async () => {
  const handler = createHandler({
    config: config({ autoCreate: false }),
    fetcher: makeFetch([{ Id: 1, Domain: "example.com", Records: [] }]),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "nohost\n");
});

Deno.test("rejects ambiguous multi-record updates by default", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [
      { Id: 101, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.1", Name: "home" },
      { Id: 102, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.2", Name: "home" },
    ],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "dnserr\n");
  assertDeepEqual(
    zones[0].Records?.map((record) => record.Value),
    ["203.0.113.1", "203.0.113.2"],
  );
});

Deno.test("can update all matching records when explicitly configured", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [
      { Id: 101, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.1", Name: "home" },
      { Id: 102, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.2", Name: "home" },
    ],
  }];
  const handler = createHandler({
    config: config({ multiRecordMode: "update-all" }),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.9\n");
  assertDeepEqual(
    zones[0].Records?.map((record) => record.Value),
    ["203.0.113.9", "203.0.113.9"],
  );
});

Deno.test("deny lists win over allow lists", async () => {
  const handler = createHandler({
    config: config({
      allowedHosts: ["*.example.com"],
      deniedHosts: ["home.example.com"],
    }),
    fetcher: makeFetch([{ Id: 1, Domain: "example.com", Records: [] }]),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "!yours\n");
});

Deno.test("zone deny lists block otherwise valid hostnames", async () => {
  const handler = createHandler({
    config: config({
      allowedZones: ["example.com"],
      deniedZones: ["example.com"],
    }),
    fetcher: makeFetch([{
      Id: 1,
      Domain: "example.com",
      Records: [{
        Id: 101,
        Type: DNS_RECORD_TYPE_A,
        Value: "198.51.100.1",
        Name: "home",
      }],
    }]),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "!yours\n");
});

Deno.test("updates IPv4 and IPv6 records in one request", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [
      { Id: 101, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.1", Name: "home" },
      {
        Id: 102,
        Type: DNS_RECORD_TYPE_AAAA,
        Value: "2001:db8::1",
        Name: "home",
      },
    ],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest(
      "/nic/update?hostname=home.example.com&myip=203.0.113.9&myip6=2001:db8::9",
    ),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "good 203.0.113.9,2001:db8::9\n");
  assertDeepEqual(
    zones[0].Records?.map((record) => record.Value),
    ["203.0.113.9", "2001:db8::9"],
  );
});

Deno.test("supports comma-separated hostnames with one response per host", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [
      { Id: 101, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.1", Name: "a" },
      { Id: 102, Type: DNS_RECORD_TYPE_A, Value: "203.0.113.2", Name: "b" },
    ],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    makeRequest(
      "/nic/update?hostname=a.example.com,b.example.com&myip=203.0.113.9",
    ),
  );

  assertEqual(response.status, 200);
  assertEqual(
    await response.text(),
    "good 203.0.113.9\ngood 203.0.113.9\n",
  );
});

Deno.test("rejects invalid hostnames before calling Bunny DNS", async () => {
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([], events),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=localhost&myip=203.0.113.9"),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "notfqdn\n");
  assertDeepEqual(events, []);
});

Deno.test("requires an explicit IP address on update requests", async () => {
  const zones: BunnyDnsZone[] = [{
    Id: 1,
    Domain: "example.com",
    Records: [{
      Id: 101,
      Type: DNS_RECORD_TYPE_A,
      Value: "198.51.100.1",
      Name: "home",
    }],
  }];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch(zones),
  });

  const response = await handler(
    new Request("https://ddns.example/nic/update?hostname=home.example.com", {
      headers: {
        Authorization: auth(),
        "x-forwarded-for": "203.0.113.42",
      },
    }),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "badip\n");
  assertEqual(zones[0].Records?.[0].Value, "198.51.100.1");
});

Deno.test("rejects invalid Basic Auth credentials before calling Bunny DNS", async () => {
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([], events),
  });

  const response = await handler(
    makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9", {
      headers: { Authorization: auth("wrong-secret") },
    }),
  );

  assertEqual(response.status, 401);
  assertEqual(await response.text(), "badauth\n");
  assertDeepEqual(events, []);
});

Deno.test("returns 911 when Bunny rejects a DNS mutation", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: (input, init = {}) => {
      const url = new URL(input.toString());
      const method = init.method ?? "GET";
      if (method === "GET" && url.pathname === "/dnszone") {
        return Promise.resolve(Response.json({
          Items: [{
            Id: 1,
            Domain: "example.com",
            Records: [{
              Id: 101,
              Type: DNS_RECORD_TYPE_A,
              Value: "198.51.100.1",
              Name: "home",
            }],
          }],
          HasMoreItems: false,
        }));
      }

      return Promise.resolve(new Response("Bunny says no", { status: 500 }));
    },
  });

  const response = await withConsoleErrorSilenced(() =>
    handler(
      makeRequest("/nic/update?hostname=home.example.com&myip=203.0.113.9"),
    )
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "911\n");
});

Deno.test("requires HTTPS unless local insecure mode is enabled", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([]),
  });

  const response = await handler(
    new Request(
      "http://ddns.example/nic/update?hostname=home.example.com&myip=203.0.113.9",
      { headers: { Authorization: auth() } },
    ),
  );

  assertEqual(response.status, 400);
  assertEqual(await response.text(), "badagent\n");
});

Deno.test("does not trust forwarded headers as proof of HTTPS", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([]),
  });

  const response = await handler(
    new Request(
      "http://ddns.example/nic/update?hostname=home.example.com&myip=203.0.113.9",
      {
        headers: {
          Authorization: auth(),
          "x-forwarded-proto": "https",
        },
      },
    ),
  );

  assertEqual(response.status, 400);
  assertEqual(await response.text(), "badagent\n");
});

Deno.test("rejects duplicate address parameters", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([]),
  });

  const response = await handler(
    makeRequest(
      "/nic/update?hostname=home.example.com&myip=203.0.113.9&myip=203.0.113.10",
    ),
  );

  assertEqual(await response.text(), "badip\n");
});

Deno.test("rejects requests that exceed the mutation budget before writing", async () => {
  const events: Array<{ method: string; path: string; body?: unknown }> = [];
  const handler = createHandler({
    config: config({ maxMutations: 1 }),
    fetcher: makeFetch([{
      Id: 1,
      Domain: "example.com",
      Records: [],
    }], events),
  });

  const response = await handler(
    makeRequest(
      "/nic/update?hostname=one.example.com,two.example.com&myip=203.0.113.9",
    ),
  );

  assertEqual(await response.text(), "numhost\n");
  assertDeepEqual(events.map((event) => event.method), ["GET"]);
});

Deno.test("rejects query-string credentials", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([]),
  });

  const response = await handler(
    makeRequest(
      "/nic/update?hostname=home.example.com&myip=203.0.113.9&password=secret",
    ),
  );

  assertEqual(response.status, 401);
  assertEqual(await response.text(), "badauth\n");
});

Deno.test("returns the detected client IP from checkip endpoints", async () => {
  const handler = createHandler({
    config: config(),
    fetcher: makeFetch([]),
  });

  const response = await handler(
    new Request("https://ddns.example/checkip", {
      headers: { "x-forwarded-for": "203.0.113.42" },
    }),
  );

  assertEqual(response.status, 200);
  assertEqual(await response.text(), "203.0.113.42\n");
});
