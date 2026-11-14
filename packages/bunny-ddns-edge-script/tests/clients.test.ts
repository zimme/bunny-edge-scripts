import {
  type BunnyDnsZone,
  createHandler,
  type DdnsClientConfig,
  DNS_RECORD_TYPE_A,
  type Fetcher,
  readConfigFromEnv,
} from "../src/app.js";

const homeSecret = crypto.randomUUID();
const officeSecret = crypto.randomUUID();
const rotatedSecret = crypto.randomUUID();

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    username: "home",
    sharedSecrets: [homeSecret],
    allowedHosts: ["home.example.com"],
    ...overrides,
  };
}

function environment(
  clients: unknown = [client()],
  overrides: Record<string, string> = {},
) {
  const values: Record<string, string> = {
    BUNNY_API_KEY: crypto.randomUUID(),
    DDNS_CLIENTS: JSON.stringify(clients),
    DDNS_ALLOWED_ZONES: "example.com",
    ...overrides,
  };
  return { get: (name: string) => values[name] };
}

function request(
  hostname = "home.example.com",
  username = "home",
  secret: string = homeSecret,
) {
  const url = new URL("https://ddns.example/nic/update");
  url.searchParams.set("hostname", hostname);
  url.searchParams.set("myip", "203.0.113.9");
  return new Request(url, {
    headers: { Authorization: `Basic ${btoa(`${username}:${secret}`)}` },
  });
}

function upstream(zones: BunnyDnsZone[] = [{
  Id: 1,
  Domain: "example.com",
  Records: [],
}]) {
  const reads: string[] = [];
  const writes: string[] = [];
  const fetcher: Fetcher = (input, init = {}) => {
    const url = new URL(input.toString());
    if (!init.method || init.method === "GET") {
      reads.push(url.pathname);
      return Promise.resolve(Response.json({
        Items: url.pathname === "/dnszone"
          ? zones.map(({ Id, Domain }) => ({ Id, Domain }))
          : zones.find((zone) => url.pathname === `/dnszone/${zone.Id}/records`)
            ?.Records ?? [],
        CurrentPage: 1,
        HasMoreItems: false,
      }));
    }
    writes.push(url.pathname);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  return { reads, writes, fetcher };
}

Deno.test("reads scoped clients with normalized, intersecting policies", () => {
  const cfg = readConfigFromEnv(environment([client({
    allowedHosts: ["HOME.Example.com."],
    allowedZones: ["Example.COM."],
    deniedHosts: ["*.blocked.example.com"],
  })]));
  equal(cfg.sharedSecrets, []);
  equal(cfg.clients?.[0].allowedHosts, ["home.example.com"]);
  equal(cfg.clients?.[0].allowedZones, ["example.com"]);
  equal(cfg.clients?.[0].deniedZones, []);
});

Deno.test("rejects malformed, unscoped, duplicate or ambiguous client configuration without exposing input", () => {
  const invalid: unknown[] = [
    [],
    null,
    {},
    "clients",
    [null],
    [[]],
    [true],
    [client({ username: "" })],
    [client({ username: " home" })],
    [client({ username: "home:" })],
    [client({ username: "home\n" })],
    [client({ username: "x".repeat(129) })],
    [client(), client()],
    [client({ sharedSecrets: [] })],
    [client({ sharedSecrets: homeSecret })],
    [client({ sharedSecrets: [null] })],
    [client({ sharedSecrets: ["short"] })],
    [client({ sharedSecrets: [`${homeSecret},${rotatedSecret}`] })],
    [client({ sharedSecrets: [`${homeSecret} `] })],
    [client({ allowedHosts: [], allowedZones: [] })],
    [client({ allowedHosts: null })],
    [client({ allowedHosts: "home.example.com" })],
    [client({ allowedHosts: [12] })],
    [client({ allowedHosts: ["*"] })],
    [client({ allowedHosts: ["home.*.example.com"] })],
    [client({ allowedHosts: ["home.example.com"], deniedZones: null })],
    [client({ allowedHost: ["home.example.com"] })],
    [client({ allowAllHosts: true })],
  ];
  for (const value of invalid) {
    let error: unknown;
    try {
      readConfigFromEnv(environment(value));
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof Error)) {
      throw new Error("Invalid client configuration was accepted");
    }
    if (error.message.includes(homeSecret)) {
      throw new Error("Configuration error exposed a credential");
    }
  }
  for (const value of ["", "[", `[{\"sharedSecrets\":[\"${homeSecret}\"]`]) {
    let error: unknown;
    try {
      readConfigFromEnv(environment([], { DDNS_CLIENTS: value }));
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof Error)) {
      throw new Error("Malformed JSON was accepted");
    }
    if (error.message.includes(homeSecret)) {
      throw new Error("JSON error exposed a credential");
    }
  }
});

Deno.test("client mode rejects every legacy secret variable including empty values", () => {
  for (const name of ["DDNS_SHARED_SECRET", "DDNS_SHARED_SECRETS"]) {
    for (const value of ["", homeSecret]) {
      let rejected = false;
      try {
        readConfigFromEnv(environment([client()], { [name]: value }));
      } catch {
        rejected = true;
      }
      equal(rejected, true);
    }
  }
  const cfg = readConfigFromEnv(environment());
  let rejected = false;
  try {
    createHandler({ config: { ...cfg, sharedSecrets: [homeSecret] } });
  } catch {
    rejected = true;
  }
  equal(rejected, true);
});

Deno.test("clients still require an explicit global authorization ceiling", () => {
  let rejected = false;
  try {
    readConfigFromEnv(environment([client()], { DDNS_ALLOWED_ZONES: "" }));
  } catch {
    rejected = true;
  }
  equal(rejected, true);
});

Deno.test("authenticates the exact client username and secret without legacy fallback", async () => {
  const api = upstream();
  const handler = createHandler({
    config: readConfigFromEnv(environment([
      client(),
      client({
        username: "office",
        sharedSecrets: [officeSecret],
        allowedHosts: ["office.example.com"],
      }),
    ], { DDNS_USERNAME: "inadyn" })),
    fetcher: api.fetcher,
  });
  for (
    const [username, secret] of [
      ["home", officeSecret],
      ["office", homeSecret],
      ["unknown", homeSecret],
      ["Home", homeSecret],
      ["inadyn", homeSecret],
    ]
  ) {
    const response = await handler(
      request("home.example.com", username, secret),
    );
    equal(response.status, 401);
    equal(await response.text(), "badauth\n");
  }
  const missing = await handler(new Request(request().url));
  equal(missing.status, 401);
  equal(await missing.text(), "badauth\n");
  equal(api.reads, []);
  const allowed = await handler(request());
  equal(await allowed.text(), "good 203.0.113.9\n");
  const denied = await handler(request("office.example.com"));
  equal(await denied.text(), "!yours\n");
  equal(api.writes, ["/dnszone/1/records"]);
});

Deno.test("intersects client host and zone scope with global host and zone scope and denies", async () => {
  const cases: Array<
    {
      rules?: Record<string, unknown>;
      global?: Record<string, string>;
      host?: string;
    }
  > = [
    { global: { DDNS_ALLOWED_HOSTS: "office.example.com" } },
    { global: { DDNS_ALLOWED_ZONES: "other.com" } },
    { global: { DDNS_DENIED_HOSTS: "home.example.com" } },
    { global: { DDNS_DENIED_ZONES: "example.com" } },
    { rules: { deniedHosts: ["home.example.com"] } },
    { rules: { deniedZones: ["example.com"] } },
    { rules: { allowedZones: ["other.com"] } },
    {
      rules: {
        allowedHosts: ["office.example.com"],
        allowedZones: ["example.com"],
      },
    },
    {
      rules: {
        allowedHosts: ["*.example.com"],
        deniedHosts: ["home.example.com"],
      },
    },
    {
      global: {
        DDNS_ALLOW_ALL_HOSTS: "true",
        DDNS_DENIED_HOSTS: "home.example.com",
      },
    },
  ];
  for (const test of cases) {
    const api = upstream();
    const handler = createHandler({
      config: readConfigFromEnv(environment([client(test.rules)], test.global)),
      fetcher: api.fetcher,
    });
    equal(await (await handler(request(test.host))).text(), "!yours\n");
    equal(api.reads, ["/dnszone"]);
    equal(api.writes, []);
  }
});

Deno.test("allows zone-scoped clients but applies the most specific selected zone", async () => {
  const api = upstream([
    { Id: 1, Domain: "example.com", Records: [] },
    { Id: 2, Domain: "sub.example.com", Records: [] },
  ]);
  const handler = createHandler({
    config: readConfigFromEnv(
      environment(
        [client({ allowedHosts: [], allowedZones: ["example.com"] })],
        {
          DDNS_ALLOWED_ZONES: "example.com,sub.example.com",
        },
      ),
    ),
    fetcher: api.fetcher,
  });
  equal(await (await handler(request())).text(), "good 203.0.113.9\n");
  equal(
    await (await handler(request("home.sub.example.com"))).text(),
    "!yours\n",
  );
  equal(api.writes, ["/dnszone/1/records"]);
});

Deno.test("a mixed hostname batch never reads or mutates an unauthorized zone", async () => {
  const api = upstream([
    { Id: 1, Domain: "example.com", Records: [] },
    { Id: 2, Domain: "other.com", Records: [] },
  ]);
  const handler = createHandler({
    config: readConfigFromEnv(
      environment([client()], { DDNS_ALLOWED_ZONES: "example.com,other.com" }),
    ),
    fetcher: api.fetcher,
  });
  equal(
    await (await handler(
      request("home.example.com,office.example.com,home.other.com"),
    )).text(),
    "good 203.0.113.9\n!yours\n!yours\n",
  );
  equal(api.reads, ["/dnszone", "/dnszone/1/records"]);
  equal(api.writes, ["/dnszone/1/records"]);
});

Deno.test("rotates and revokes individual clients independently", async () => {
  const office = client({
    username: "office",
    sharedSecrets: [officeSecret],
    allowedHosts: ["office.example.com"],
  });
  const stages = [
    {
      clients: [client({ sharedSecrets: [homeSecret, rotatedSecret] }), office],
      old: 200,
      rotated: 200,
    },
    {
      clients: [client({ sharedSecrets: [rotatedSecret] }), office],
      old: 401,
      rotated: 200,
    },
    { clients: [office], old: 401, rotated: 401 },
  ];
  for (const stage of stages) {
    const api = upstream();
    const handler = createHandler({
      config: readConfigFromEnv(environment(stage.clients)),
      fetcher: api.fetcher,
    });
    const old = await handler(request());
    equal(old.status, stage.old);
    await old.text();
    const rotated = await handler(
      request("home.example.com", "home", rotatedSecret),
    );
    equal(rotated.status, stage.rotated);
    await rotated.text();
    equal(
      await (await handler(
        request("office.example.com", "office", officeSecret),
      )).text(),
      "good 203.0.113.9\n",
    );
  }
});

Deno.test("handler snapshots client credentials and every policy array", async () => {
  const cfg = readConfigFromEnv(environment());
  const api = upstream();
  const handler = createHandler({ config: cfg, fetcher: api.fetcher });
  const scoped = cfg.clients?.[0] as DdnsClientConfig;
  scoped.allowedHosts.push("office.example.com");
  scoped.allowedZones.push("other.com");
  scoped.deniedHosts.push("home.example.com");
  scoped.deniedZones.push("example.com");
  scoped.sharedSecrets.push(rotatedSecret);
  scoped.username = "changed";
  cfg.clients?.push({ ...scoped, username: "office" });
  equal(
    await (await handler(request("office.example.com"))).text(),
    "!yours\n",
  );
  const rotated = await handler(
    request("home.example.com", "home", rotatedSecret),
  );
  equal(rotated.status, 401);
  await rotated.text();
  equal(await (await handler(request())).text(), "good 203.0.113.9\n");
});

Deno.test("scoped clients retain ambiguous-record rejection", async () => {
  const api = upstream([{
    Id: 1,
    Domain: "example.com",
    Records: [
      { Id: 1, Type: DNS_RECORD_TYPE_A, Name: "home", Value: "203.0.113.1" },
      { Id: 2, Type: DNS_RECORD_TYPE_A, Name: "home", Value: "203.0.113.2" },
    ],
  }]);
  const handler = createHandler({
    config: readConfigFromEnv(environment()),
    fetcher: api.fetcher,
  });
  equal(await (await handler(request())).text(), "dnserr\n");
  equal(api.writes, []);
});

Deno.test("rejects sparse programmatic client arrays at startup", () => {
  const cfg = readConfigFromEnv(environment());
  let rejected = false;
  try {
    createHandler({ config: { ...cfg, clients: new Array(1) } });
  } catch {
    rejected = true;
  }
  equal(rejected, true);
});
