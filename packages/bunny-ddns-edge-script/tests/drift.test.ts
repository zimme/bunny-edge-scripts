import {
  type BunnyDnsRecord,
  createHandler,
  DNS_RECORD_TYPE_A,
  DNS_RECORD_TYPE_AAAA,
  type Fetcher,
  type RuntimeConfig,
} from "../src/app.js";

function equal<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function fixture(
  overrides: Partial<RuntimeConfig> = {},
  type: typeof DNS_RECORD_TYPE_A | typeof DNS_RECORD_TYPE_AAAA =
    DNS_RECORD_TYPE_A,
) {
  const secret = crypto.randomUUID();
  const desiredIp = type === DNS_RECORD_TYPE_A
    ? "203.0.113.10"
    : "2001:db8::10";
  const driftedIp = type === DNS_RECORD_TYPE_A
    ? "198.51.100.20"
    : "2001:db8::20";
  const records: BunnyDnsRecord[] = [{
    Id: 101,
    Type: type,
    Name: "home",
    Value: desiredIp,
    Ttl: 300,
    Comment: "Existing operator comment",
    Disabled: false,
  }];
  const writes: Array<{ method: string; body: BunnyDnsRecord }> = [];
  let reads = 0;
  const fetcher: Fetcher = (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    if (url.pathname === "/dnszone" && method === "GET") {
      return Promise.resolve(Response.json({
        Items: [{ Id: 1, Domain: "example.com" }],
        CurrentPage: 1,
        HasMoreItems: false,
      }));
    }
    if (url.pathname === "/dnszone/1/records" && method === "GET") {
      reads += 1;
      return Promise.resolve(Response.json({
        Items: records.filter((record) =>
          record.Type === Number(url.searchParams.get("type"))
        ),
        CurrentPage: 1,
        HasMoreItems: false,
      }));
    }
    if (typeof init.body !== "string") {
      throw new Error("Unexpected Bunny API request");
    }
    const body = JSON.parse(init.body) as BunnyDnsRecord;
    if (url.pathname === "/dnszone/1/records/101" && method === "POST") {
      writes.push({ method, body });
      Object.assign(records.find((record) => record.Id === 101)!, body);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.pathname === "/dnszone/1/records" && method === "PUT") {
      writes.push({ method, body });
      records.push({ ...body, Id: 102 });
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    throw new Error("Unexpected Bunny API request");
  };
  const handler = createHandler({
    config: {
      apiBaseUrl: "https://api.bunny.net",
      bunnyApiKey: crypto.randomUUID(),
      clients: [{
        username: "router",
        sharedSecrets: [secret],
        allowedHosts: ["home.example.com"],
        deniedHosts: [],
        allowedZones: [],
        deniedZones: [],
      }],
      allowedHosts: ["home.example.com"],
      deniedHosts: [],
      allowedZones: [],
      deniedZones: [],
      allowAllHosts: false,
      autoCreate: true,
      defaultTtl: 900,
      allowInsecureHttp: false,
      multiRecordMode: "reject",
      maxHostnames: 25,
      maxMutations: 40,
      managedComment: "Managed by test",
      ...overrides,
    },
    fetcher,
  });
  async function update() {
    const response = await handler(
      new Request(
        `https://ddns.example/nic/update?hostname=home.example.com&myip=${desiredIp}`,
        { headers: { Authorization: `Basic ${btoa(`router:${secret}`)}` } },
      ),
    );
    equal(response.status, 200);
    return await response.text();
  }
  return { records, writes, desiredIp, driftedIp, update, reads: () => reads };
}

Deno.test("repeated unchanged-IP requests repair external A and AAAA value drift", async () => {
  for (const type of [DNS_RECORD_TYPE_A, DNS_RECORD_TYPE_AAAA]) {
    const f = fixture({}, type);
    equal(await f.update(), `nochg ${f.desiredIp}\n`);
    f.records[0].Value = f.driftedIp;
    equal(await f.update(), `good ${f.desiredIp}\n`);
    equal(f.records[0].Value, f.desiredIp);
    equal(f.writes.length, 1);
    equal(f.writes[0].body.Ttl, 300);
    equal(f.writes[0].body.Comment, "Existing operator comment");
    equal(await f.update(), `nochg ${f.desiredIp}\n`);
    equal(f.reads(), 3);
    equal(f.writes.length, 1);
  }
});

Deno.test("repeated unchanged-IP requests recreate externally deleted records", async () => {
  for (const type of [DNS_RECORD_TYPE_A, DNS_RECORD_TYPE_AAAA]) {
    const f = fixture({}, type);
    equal(await f.update(), `nochg ${f.desiredIp}\n`);
    f.records.splice(0);
    equal(await f.update(), `good ${f.desiredIp}\n`);
    equal(f.reads(), 2);
    equal(f.writes.length, 1);
    equal(f.writes[0].method, "PUT");
    equal(f.records[0].Name, "home");
    equal(f.records[0].Type, type);
    equal(f.records[0].Value, f.desiredIp);
    equal(f.records[0].Ttl, 900);
  }
});

Deno.test("drift reconciliation respects disabled auto-create after deletion", async () => {
  const f = fixture({ autoCreate: false });
  equal(await f.update(), `nochg ${f.desiredIp}\n`);
  f.records.splice(0);
  equal(await f.update(), "nohost\n");
  equal(f.reads(), 2);
  equal(f.writes.length, 0);
});

Deno.test("external duplicate records prevent unsafe drift reconciliation", async () => {
  const f = fixture();
  equal(await f.update(), `nochg ${f.desiredIp}\n`);
  f.records.push({ ...f.records[0], Id: 202, Value: f.driftedIp });
  equal(await f.update(), "dnserr\n");
  equal(f.reads(), 2);
  equal(f.records[0].Value, f.desiredIp);
  equal(f.records[1].Value, f.driftedIp);
  equal(f.writes.length, 0);
});

Deno.test("global denial prevents drift reads and writes", async () => {
  for (
    const policy of [
      { deniedHosts: ["home.example.com"] },
      { deniedZones: ["example.com"] },
    ]
  ) {
    const f = fixture(policy);
    f.records[0].Value = f.driftedIp;
    equal(await f.update(), "!yours\n");
    equal(f.records[0].Value, f.driftedIp);
    equal(f.reads(), 0);
    equal(f.writes.length, 0);
  }
});
