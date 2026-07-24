// @ts-check
// @ts-self-types="./app.d.ts"

export const DNS_RECORD_TYPE_A = 0;
export const DNS_RECORD_TYPE_AAAA = 1;

const DEFAULT_API_BASE_URL = "https://api.bunny.net";
const DEFAULT_TTL_SECONDS = 900;
const DEFAULT_MAX_HOSTNAMES = 25;
const DEFAULT_MAX_MUTATIONS = 40;
const MAX_ZONE_PAGES = 10;
const BUNNY_SUBREQUEST_LIMIT = 50;
const MIN_SHARED_SECRET_LENGTH = 32;
const MAX_SHARED_SECRET_LENGTH = 256;
const DEFAULT_MANAGED_COMMENT = "Managed by bunny-ddns-edge-script";

/**
 * @typedef {typeof DNS_RECORD_TYPE_A | typeof DNS_RECORD_TYPE_AAAA} DdnsRecordType
 */

/**
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} Fetcher
 */

/**
 * @typedef {object} BunnyDnsRecord
 * @property {number} Id
 * @property {number} Type
 * @property {number | null} [Ttl]
 * @property {string | null} [Value]
 * @property {string | null} [Name]
 * @property {number | null} [Weight]
 * @property {number | null} [Priority]
 * @property {number | null} [Port]
 * @property {number | null} [Flags]
 * @property {string | null} [Tag]
 * @property {number | null} [PullZoneId]
 * @property {number | null} [ScriptId]
 * @property {boolean | null} [Accelerated]
 * @property {number | null} [AcceleratedPullZoneId]
 * @property {number | null} [MonitorType]
 * @property {number | null} [GeolocationLatitude]
 * @property {number | null} [GeolocationLongitude]
 * @property {Array<{ Name: string, Value: string }> | null} [EnviromentalVariables]
 * @property {string | null} [LatencyZone]
 * @property {number | null} [SmartRoutingType]
 * @property {boolean | null} [Disabled]
 * @property {string | null} [Comment]
 * @property {boolean | null} [AutoSslIssuance]
 */

/**
 * @typedef {object} BunnyDnsZone
 * @property {number} Id
 * @property {string} Domain
 * @property {BunnyDnsRecord[] | null} [Records]
 */

/**
 * @typedef {"reject" | "update-all"} MultiRecordMode
 */

/**
 * @typedef {object} RuntimeConfig
 * @property {string} apiBaseUrl
 * @property {string} bunnyApiKey
 * @property {string[]} sharedSecrets
 * @property {string} [username]
 * @property {string[]} allowedHosts
 * @property {string[]} deniedHosts
 * @property {string[]} allowedZones
 * @property {string[]} deniedZones
 * @property {boolean} allowAllHosts
 * @property {boolean} autoCreate
 * @property {number} defaultTtl
 * @property {boolean} allowInsecureHttp
 * @property {MultiRecordMode} multiRecordMode
 * @property {number} maxHostnames
 * @property {number} maxMutations
 * @property {string} managedComment
 */

/**
 * @typedef {object} EnvReader
 * @property {(name: string) => string | undefined} get
 */

/**
 * @typedef {object} HandlerOptions
 * @property {RuntimeConfig} config
 * @property {Fetcher} [fetcher]
 */

/**
 * @typedef {object} BasicCredentials
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {object} RequestedAddress
 * @property {string} ip
 * @property {DdnsRecordType} type
 */

/** @typedef {"good" | "nochg" | "nohost" | "notfqdn" | "badip" | "badauth" | "badagent" | "numhost" | "!yours" | "dnserr" | "911"} DdnsCode */

/**
 * @typedef {object} DdnsLine
 * @property {DdnsCode} code
 * @property {string} [detail]
 */

/** @typedef {{ kind: "none", address: RequestedAddress } | { kind: "create", address: RequestedAddress, name: string } | { kind: "update", address: RequestedAddress, records: BunnyDnsRecord[] }} PlannedAction */

/**
 * @typedef {object} HostPlan
 * @property {string} hostname
 * @property {BunnyDnsZone} zone
 * @property {PlannedAction[]} actions
 */

/**
 * @typedef {object} BunnyListResponse
 * @property {BunnyDnsZone[] | null} [Items]
 * @property {number} [CurrentPage]
 * @property {number} [TotalItems]
 * @property {boolean} [HasMoreItems]
 */

/**
 * @typedef {{ kind: "ok", values: string[] } | { kind: "error", code: DdnsCode }} ParsedHostnames
 */

/**
 * @typedef {{ kind: "ok", values: RequestedAddress[] } | { kind: "error", code: DdnsCode }} ParsedRequestedAddresses
 */

/**
 * @typedef {{ kind: "ok", value: HostPlan } | { kind: "error", line: DdnsLine }} PlannedHostnameUpdate
 */

/**
 * @typedef {object} ZoneCandidate
 * @property {BunnyDnsZone} zone
 * @property {string} domain
 */

/**
 * @param {HandlerOptions} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createHandler(options) {
  const config = normalizeRuntimeConfig(options.config);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const client = new BunnyDnsClient(config, fetcher);

  return async (request) => {
    try {
      return await routeRequest(request, config, client);
    } catch (error) {
      console.error(
        "[bunny-ddns-edge-script] unhandled request failure",
        error,
      );
      return ddnsResponse([{ code: "911" }]);
    }
  };
}

/** Secure, descriptive alias for {@link createHandler}. */
export const createBunnyDdnsHandler = createHandler;

/**
 * @param {EnvReader} env
 * @returns {RuntimeConfig}
 */
export function readConfigFromEnv(env) {
  const bunnyApiKey = env.get("BUNNY_API_KEY") ?? env.get("BUNNY_ACCESS_KEY");
  if (!bunnyApiKey) {
    throw new Error("Missing required BUNNY_API_KEY secret.");
  }

  const pluralSecrets = env.get("DDNS_SHARED_SECRETS");
  const singularSecret = env.get("DDNS_SHARED_SECRET");
  const sharedSecrets = pluralSecrets === undefined
    ? (singularSecret === undefined ? [] : [singularSecret])
    : parseSharedSecretList(pluralSecrets);
  if (sharedSecrets.length === 0) {
    throw new Error("Missing required DDNS_SHARED_SECRET secret.");
  }

  const allowInsecureHttp = parseBoolean(
    env.get("DDNS_ALLOW_INSECURE_HTTP"),
    false,
  );

  const config = {
    apiBaseUrl: parseApiBaseUrl(
      env.get("DDNS_API_BASE_URL") ?? DEFAULT_API_BASE_URL,
      allowInsecureHttp,
    ),
    bunnyApiKey,
    sharedSecrets,
    username: emptyToUndefined(env.get("DDNS_USERNAME")),
    allowedHosts: parseList(env.get("DDNS_ALLOWED_HOSTS")),
    deniedHosts: parseList(env.get("DDNS_DENIED_HOSTS")),
    allowedZones: parseList(env.get("DDNS_ALLOWED_ZONES")),
    deniedZones: parseList(env.get("DDNS_DENIED_ZONES")),
    allowAllHosts: parseBoolean(env.get("DDNS_ALLOW_ALL_HOSTS"), false),
    autoCreate: parseBoolean(env.get("DDNS_AUTO_CREATE"), true),
    defaultTtl: parseInteger(
      env.get("DDNS_TTL"),
      DEFAULT_TTL_SECONDS,
      60,
      2_147_483_647,
    ),
    allowInsecureHttp,
    multiRecordMode: parseMultiRecordMode(env.get("DDNS_MULTI_RECORD_MODE")),
    maxHostnames: parseInteger(
      env.get("DDNS_MAX_HOSTNAMES"),
      DEFAULT_MAX_HOSTNAMES,
      1,
      100,
    ),
    maxMutations: parseInteger(
      env.get("DDNS_MAX_MUTATIONS"),
      DEFAULT_MAX_MUTATIONS,
      1,
      DEFAULT_MAX_MUTATIONS,
    ),
    managedComment: env.get("DDNS_RECORD_COMMENT") ?? DEFAULT_MANAGED_COMMENT,
  };
  return normalizeRuntimeConfig(config);
}

/** Secure, descriptive alias for {@link readConfigFromEnv}. */
export const readBunnyDdnsConfigFromEnv = readConfigFromEnv;

/**
 * @param {RuntimeConfig} config
 * @returns {RuntimeConfig}
 */
function normalizeRuntimeConfig(config) {
  const normalized = {
    ...config,
    sharedSecrets: [...config.sharedSecrets],
    allowedHosts: normalizePatterns(config.allowedHosts, "allowedHosts"),
    deniedHosts: normalizePatterns(config.deniedHosts, "deniedHosts"),
    allowedZones: normalizePatterns(config.allowedZones, "allowedZones"),
    deniedZones: normalizePatterns(config.deniedZones, "deniedZones"),
  };

  validateRuntimeConfig(normalized);
  return normalized;
}

/**
 * @param {RuntimeConfig} config
 */
function validateRuntimeConfig(config) {
  parseApiBaseUrl(config.apiBaseUrl, config.allowInsecureHttp);
  if (!config.bunnyApiKey || config.sharedSecrets.length === 0) {
    throw new Error("Bunny API and DDNS shared secrets are required.");
  }
  for (const secret of config.sharedSecrets) {
    validateSharedSecret(secret);
  }
  if (
    !config.allowAllHosts && config.allowedHosts.length === 0 &&
    config.allowedZones.length === 0
  ) {
    throw new Error(
      "Set DDNS_ALLOWED_HOSTS or DDNS_ALLOWED_ZONES, or explicitly set DDNS_ALLOW_ALL_HOSTS=true.",
    );
  }
  if (
    !Number.isSafeInteger(config.maxHostnames) || config.maxHostnames < 1 ||
    config.maxHostnames > 100
  ) {
    throw new Error("maxHostnames must be between 1 and 100.");
  }
  if (
    !Number.isSafeInteger(config.maxMutations) || config.maxMutations < 1 ||
    config.maxMutations > DEFAULT_MAX_MUTATIONS
  ) {
    throw new Error(
      `maxMutations must be between 1 and ${DEFAULT_MAX_MUTATIONS}.`,
    );
  }
  if (
    !Number.isSafeInteger(config.defaultTtl) || config.defaultTtl < 60 ||
    config.defaultTtl > 2_147_483_647
  ) {
    throw new Error("defaultTtl must be a valid Bunny TTL.");
  }
  if (!["reject", "update-all"].includes(config.multiRecordMode)) {
    throw new Error("Invalid multiRecordMode.");
  }
}

/**
 * @param {string} hostname
 * @returns {string | undefined}
 */
export function normalizeHostname(hostname) {
  const normalized = hostname.trim().replace(/\.$/, "").toLowerCase();
  if (normalized.length === 0 || normalized.length > 253) {
    return undefined;
  }

  const labels = normalized.split(".");
  if (labels.length < 2) {
    return undefined;
  }

  for (const label of labels) {
    if (
      label.length === 0 || label.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    ) {
      return undefined;
    }
  }

  return normalized;
}

/**
 * @param {string} ip
 * @returns {RequestedAddress | undefined}
 */
export function classifyIpAddress(ip) {
  const normalized = ip.trim();
  if (isValidIpv4(normalized)) {
    return { ip: normalized, type: DNS_RECORD_TYPE_A };
  }

  const ipv6 = canonicalizeIpv6(normalized);
  if (ipv6) {
    return { ip: ipv6, type: DNS_RECORD_TYPE_AAAA };
  }

  return undefined;
}

/**
 * @param {string} hostname
 * @param {BunnyDnsZone} zone
 * @param {RuntimeConfig} config
 * @returns {boolean}
 */
export function isHostnameAllowed(hostname, zone, config) {
  const zoneDomain = normalizeHostname(zone.Domain);
  if (!zoneDomain) {
    return false;
  }

  if (matchesAny(hostname, config.deniedHosts)) {
    return false;
  }

  if (matchesAny(zoneDomain, config.deniedZones)) {
    return false;
  }

  if (
    config.allowedHosts.length > 0 &&
    !matchesAny(hostname, config.allowedHosts)
  ) {
    return false;
  }

  if (
    config.allowedZones.length > 0 &&
    !matchesAny(zoneDomain, config.allowedZones)
  ) {
    return false;
  }

  return true;
}

class BunnyDnsClient {
  #config;
  #fetcher;

  /**
   * @param {RuntimeConfig} config
   * @param {Fetcher} fetcher
   */
  constructor(config, fetcher) {
    this.#config = config;
    this.#fetcher = fetcher;
  }

  /**
   * @param {SubrequestBudget} budget
   * @returns {Promise<BunnyDnsZone[]>}
   */
  async listZones(budget) {
    /** @type {BunnyDnsZone[]} */
    const zones = [];
    let page = 1;

    while (true) {
      const url = new URL("/dnszone", this.#config.apiBaseUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("perPage", "1000");
      url.searchParams.set("view", "1");

      budget.consume();
      const response = await this.#fetcher(url, {
        headers: this.#apiHeaders(),
      });
      await assertBunnyResponse(response, "list DNS zones");

      const body = validateBunnyListResponse(await response.json(), page);
      zones.push(...body.Items);

      if (!body.HasMoreItems) {
        return zones;
      }

      if (page >= MAX_ZONE_PAGES) {
        throw new Error(
          `Bunny returned more than ${MAX_ZONE_PAGES} DNS zone pages.`,
        );
      }

      page += 1;
    }
  }

  /**
   * @param {BunnyDnsZone} zone
   * @param {DdnsRecordType} type
   * @param {SubrequestBudget} budget
   * @returns {Promise<BunnyDnsRecord[]>}
   */
  async listRecords(zone, type, budget) {
    /** @type {BunnyDnsRecord[]} */
    const records = [];
    let page = 1;

    while (true) {
      const url = new URL(
        `/dnszone/${zone.Id}/records`,
        this.#config.apiBaseUrl,
      );
      url.searchParams.set("page", String(page));
      url.searchParams.set("perPage", "1000");
      url.searchParams.set("type", String(type));

      budget.consume();
      const response = await this.#fetcher(url, {
        headers: this.#apiHeaders(),
      });
      await assertBunnyResponse(
        response,
        `list DNS records for zone ${zone.Id}`,
      );

      const body = validateBunnyRecordListResponse(
        await response.json(),
        page,
        type,
      );
      records.push(...body.Items);
      if (!body.HasMoreItems) {
        return records;
      }

      page += 1;
    }
  }

  /**
   * @param {BunnyDnsZone} zone
   * @param {BunnyDnsRecord} record
   * @param {RequestedAddress} address
   * @param {SubrequestBudget} budget
   * @returns {Promise<void>}
   */
  async updateRecord(zone, record, address, budget) {
    const url = new URL(
      `/dnszone/${zone.Id}/records/${record.Id}`,
      this.#config.apiBaseUrl,
    );
    const payload = recordToUpdatePayload(record, address);

    budget.consume();
    const response = await this.#fetcher(url, {
      method: "POST",
      headers: this.#apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    await assertBunnyResponse(response, `update DNS record ${record.Id}`);
  }

  /**
   * @param {BunnyDnsZone} zone
   * @param {string} name
   * @param {RequestedAddress} address
   * @param {SubrequestBudget} budget
   * @returns {Promise<void>}
   */
  async createRecord(zone, name, address, budget) {
    const url = new URL(`/dnszone/${zone.Id}/records`, this.#config.apiBaseUrl);
    const payload = {
      Type: address.type,
      Ttl: this.#config.defaultTtl,
      Value: address.ip,
      Name: name,
      Disabled: false,
      Comment: this.#config.managedComment,
    };

    budget.consume();
    const response = await this.#fetcher(url, {
      method: "PUT",
      headers: this.#apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    await assertBunnyResponse(response, "create DNS record");
  }

  /**
   * @param {Record<string, string>} [extra]
   * @returns {Headers}
   */
  #apiHeaders(extra) {
    const headers = new Headers(extra);
    headers.set("AccessKey", this.#config.bunnyApiKey);
    return headers;
  }
}

class SubrequestBudget {
  #used = 0;

  /** @returns {number} */
  get remaining() {
    return BUNNY_SUBREQUEST_LIMIT - this.#used;
  }

  /** @returns {void} */
  consume() {
    if (this.remaining < 1) {
      throw new Error("Bunny Edge Script subrequest budget exhausted.");
    }
    this.#used += 1;
  }
}

/**
 * @param {unknown} value
 * @param {number} expectedPage
 * @returns {{ Items: BunnyDnsZone[], HasMoreItems: boolean }}
 */
function validateBunnyListResponse(value, expectedPage) {
  if (!value || typeof value !== "object") {
    throw new Error("Bunny returned an invalid DNS zone response.");
  }
  const body = /** @type {Record<string, unknown>} */ (value);
  if (!Array.isArray(body.Items) || typeof body.HasMoreItems !== "boolean") {
    throw new Error("Bunny returned an invalid DNS zone page.");
  }
  if (
    body.CurrentPage !== undefined &&
    body.CurrentPage !== expectedPage
  ) {
    throw new Error("Bunny returned an unexpected DNS zone page.");
  }
  for (const value of body.Items) {
    if (!isBunnyDnsZone(value)) {
      throw new Error("Bunny returned an invalid DNS zone or record.");
    }
  }
  return {
    Items: /** @type {BunnyDnsZone[]} */ (body.Items),
    HasMoreItems: body.HasMoreItems,
  };
}

/** @param {unknown} value @returns {value is BunnyDnsZone} */
function isBunnyDnsZone(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const zone = /** @type {Record<string, unknown>} */ (value);
  if (
    !Number.isSafeInteger(zone.Id) || typeof zone.Domain !== "string" ||
    !normalizeHostname(zone.Domain) ||
    (zone.Records !== undefined && zone.Records !== null &&
      !Array.isArray(zone.Records))
  ) {
    return false;
  }
  return (zone.Records ?? []).every(isBunnyDnsRecord);
}

/** @param {unknown} value @returns {value is BunnyDnsRecord} */
function isBunnyDnsRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return Number.isSafeInteger(record.Id) &&
    Number.isSafeInteger(record.Type) &&
    (record.Name === null || record.Name === undefined ||
      typeof record.Name === "string") &&
    (record.Value === null || record.Value === undefined ||
      typeof record.Value === "string") &&
    (record.Disabled === null || record.Disabled === undefined ||
      typeof record.Disabled === "boolean");
}

/**
 * @param {unknown} value
 * @param {number} expectedPage
 * @param {DdnsRecordType} expectedType
 * @returns {{ Items: BunnyDnsRecord[], HasMoreItems: boolean }}
 */
function validateBunnyRecordListResponse(value, expectedPage, expectedType) {
  if (!value || typeof value !== "object") {
    throw new Error("Bunny returned an invalid DNS record response.");
  }
  const body = /** @type {Record<string, unknown>} */ (value);
  if (!Array.isArray(body.Items) || typeof body.HasMoreItems !== "boolean") {
    throw new Error("Bunny returned an invalid DNS record page.");
  }
  if (
    body.CurrentPage !== undefined &&
    body.CurrentPage !== expectedPage
  ) {
    throw new Error("Bunny returned an unexpected DNS record page.");
  }
  const items = body.Items.map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Bunny returned an invalid DNS record.");
    }
    const source = /** @type {Record<string, unknown>} */ (value);
    const record = {
      ...source,
      Type: source.Type ?? expectedType,
    };
    if (!isBunnyDnsRecord(record) || record.Type !== expectedType) {
      throw new Error("Bunny returned an invalid DNS record.");
    }
    return record;
  });
  return {
    Items: /** @type {BunnyDnsRecord[]} */ (items),
    HasMoreItems: body.HasMoreItems,
  };
}

/**
 * @param {Request} request
 * @param {RuntimeConfig} config
 * @param {BunnyDnsClient} client
 * @returns {Promise<Response>}
 */
async function routeRequest(request, config, client) {
  const url = new URL(request.url);

  if (!isSecureRequest(request, url, config)) {
    return plainResponse("badagent\n", 400);
  }

  if (isHealthPath(url.pathname)) {
    return plainResponse("ok\n", 200);
  }

  if (isCheckIpPath(url.pathname)) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return plainResponse("method not allowed\n", 405, {
        Allow: "GET, HEAD",
      });
    }

    const address = classifyIpAddress(getClientIp(request) ?? "");
    if (!address) {
      return ddnsResponse([{ code: "badip" }]);
    }

    return plainResponse(`${address.ip}\n`, 200);
  }

  if (!isUpdatePath(url.pathname)) {
    return plainResponse("not found\n", 404);
  }

  if (request.method !== "GET") {
    return plainResponse("method not allowed\n", 405, { Allow: "GET" });
  }

  if (hasQueryCredentials(url)) {
    return ddnsResponse([{ code: "badauth" }]);
  }

  if (!isAuthorized(request, config)) {
    return ddnsResponse([{ code: "badauth" }]);
  }

  const hostnames = parseHostnames(url.searchParams.get("hostname"));
  if (hostnames.kind === "error") {
    return ddnsResponse([{ code: hostnames.code }]);
  }

  if (hostnames.values.length > config.maxHostnames) {
    return ddnsResponse([{ code: "numhost" }]);
  }

  const addresses = parseRequestedAddresses(url);
  if (addresses.kind === "error") {
    return ddnsResponse([{ code: addresses.code }]);
  }

  const budget = new SubrequestBudget();
  const zones = await client.listZones(budget);
  const zoneCandidates = prepareZoneCandidates(zones);
  const selectedZones = new Map();
  for (const hostname of hostnames.values) {
    const zone = findBestZone(hostname, zoneCandidates);
    if (zone && isHostnameAllowed(hostname, zone, config)) {
      selectedZones.set(zone.Id, zone);
    }
  }

  for (const zone of selectedZones.values()) {
    const records = [];
    for (const address of addresses.values) {
      records.push(...await client.listRecords(zone, address.type, budget));
    }
    zone.Records = records;
  }

  const plans = hostnames.values.map((hostname) =>
    planHostnameUpdate(hostname, addresses.values, zoneCandidates, config)
  );
  const mutationCount = plans.reduce(
    (total, plan) =>
      total + (plan.kind === "ok" ? countMutations(plan.value) : 0),
    0,
  );
  if (
    mutationCount > config.maxMutations ||
    mutationCount > budget.remaining
  ) {
    return ddnsResponse([{ code: "numhost" }]);
  }

  /** @type {DdnsLine[]} */
  const lines = [];

  for (const plan of plans) {
    if (plan.kind === "error") {
      lines.push(plan.line);
      continue;
    }

    try {
      const changed = await executePlan(plan.value, client, budget);
      lines.push({
        code: changed ? "good" : "nochg",
        detail: addresses.values.map((address) => address.ip).join(","),
      });
    } catch (error) {
      console.error(
        "[bunny-ddns-edge-script] Bunny DNS mutation failed",
        error,
      );
      lines.push({ code: "911" });
    }
  }

  return ddnsResponse(lines);
}

/**
 * @param {HostPlan} plan
 * @returns {number}
 */
function countMutations(plan) {
  return plan.actions.reduce((total, action) => {
    if (action.kind === "none") {
      return total;
    }

    return total + (action.kind === "update" ? action.records.length : 1);
  }, 0);
}

/**
 * @param {string} hostname
 * @param {RequestedAddress[]} addresses
 * @param {ZoneCandidate[]} zones
 * @param {RuntimeConfig} config
 * @returns {PlannedHostnameUpdate}
 */
function planHostnameUpdate(hostname, addresses, zones, config) {
  const zone = findBestZone(hostname, zones);
  if (!zone) {
    return { kind: "error", line: { code: "nohost" } };
  }

  if (!isHostnameAllowed(hostname, zone, config)) {
    return { kind: "error", line: { code: "!yours" } };
  }

  /** @type {PlannedAction[]} */
  const actions = [];

  for (const address of addresses) {
    const matchingRecords = getMatchingRecords(zone, hostname, address.type);

    if (matchingRecords.length === 0) {
      if (!config.autoCreate) {
        return { kind: "error", line: { code: "nohost" } };
      }

      actions.push({
        kind: "create",
        address,
        name: relativeRecordName(hostname, zone.Domain),
      });
      continue;
    }

    const allAlreadyCurrent = matchingRecords.every((record) => {
      const existing = classifyIpAddress(record.Value ?? "");
      return existing?.type === address.type && existing.ip === address.ip;
    });
    if (allAlreadyCurrent) {
      actions.push({ kind: "none", address });
      continue;
    }

    if (matchingRecords.length > 1 && config.multiRecordMode === "reject") {
      return { kind: "error", line: { code: "dnserr" } };
    }

    actions.push({
      kind: "update",
      address,
      records: config.multiRecordMode === "update-all"
        ? matchingRecords
        : [matchingRecords[0]],
    });
  }

  return {
    kind: "ok",
    value: {
      hostname,
      zone,
      actions,
    },
  };
}

/**
 * @param {HostPlan} plan
 * @param {BunnyDnsClient} client
 * @param {SubrequestBudget} budget
 * @returns {Promise<boolean>}
 */
async function executePlan(plan, client, budget) {
  let changed = false;

  for (const action of plan.actions) {
    if (action.kind === "none") {
      continue;
    }

    changed = true;

    if (action.kind === "create") {
      await client.createRecord(
        plan.zone,
        action.name,
        action.address,
        budget,
      );
      continue;
    }

    for (const record of action.records) {
      await client.updateRecord(plan.zone, record, action.address, budget);
    }
  }

  return changed;
}

/**
 * @param {string | null} rawHostname
 * @returns {ParsedHostnames}
 */
function parseHostnames(rawHostname) {
  if (!rawHostname) {
    return { kind: "error", code: "nohost" };
  }

  const values = rawHostname.split(",").map((hostname) =>
    normalizeHostname(hostname)
  );

  if (values.some((hostname) => !hostname)) {
    return { kind: "error", code: "notfqdn" };
  }

  const uniqueValues = [...new Set(/** @type {string[]} */ (values))];
  if (uniqueValues.length === 0) {
    return { kind: "error", code: "nohost" };
  }

  return { kind: "ok", values: uniqueValues };
}

/**
 * @param {URL} url
 * @returns {ParsedRequestedAddresses}
 */
function parseRequestedAddresses(url) {
  if (
    ["myip", "myip6", "ip"].some((name) =>
      url.searchParams.getAll(name).length > 1
    )
  ) {
    return { kind: "error", code: "badip" };
  }

  const requestedIps = /** @type {string[]} */ ([
    url.searchParams.get("myip"),
    url.searchParams.get("myip6"),
    url.searchParams.get("ip"),
  ].filter((value) => Boolean(value)));

  if (requestedIps.length === 0) {
    return { kind: "error", code: "badip" };
  }

  const addresses = requestedIps.map(classifyIpAddress);
  if (addresses.some((address) => !address)) {
    return { kind: "error", code: "badip" };
  }

  /** @type {Map<DdnsRecordType, RequestedAddress>} */
  const byType = new Map();
  for (const address of /** @type {RequestedAddress[]} */ (addresses)) {
    const existing = byType.get(address.type);
    if (existing && existing.ip !== address.ip) {
      return { kind: "error", code: "badip" };
    }
    byType.set(address.type, address);
  }

  return { kind: "ok", values: [...byType.values()] };
}

/**
 * @param {string} hostname
 * @param {ZoneCandidate[]} zones
 * @returns {BunnyDnsZone | undefined}
 */
function findBestZone(hostname, zones) {
  return zones.find(({ domain }) =>
    hostname === domain || hostname.endsWith(`.${domain}`)
  )?.zone;
}

/**
 * @param {BunnyDnsZone[]} zones
 * @returns {ZoneCandidate[]}
 */
function prepareZoneCandidates(zones) {
  return /** @type {ZoneCandidate[]} */ (zones.map((zone) => ({
    zone,
    domain: normalizeHostname(zone.Domain),
  })).filter((candidate) => Boolean(candidate.domain)))
    .sort((left, right) => right.domain.length - left.domain.length);
}

/**
 * @param {BunnyDnsZone} zone
 * @param {string} hostname
 * @param {DdnsRecordType} type
 * @returns {BunnyDnsRecord[]}
 */
function getMatchingRecords(zone, hostname, type) {
  return (zone.Records ?? []).filter((record) =>
    record.Disabled !== true &&
    record.Type === type &&
    recordHostname(record, zone.Domain) === hostname
  );
}

/**
 * @param {BunnyDnsRecord} record
 * @param {string} zoneDomain
 * @returns {string | undefined}
 */
function recordHostname(record, zoneDomain) {
  const normalizedZone = normalizeHostname(zoneDomain);
  if (!normalizedZone) {
    return undefined;
  }

  const name = (record.Name ?? "").trim().replace(/\.$/, "").toLowerCase();
  if (name === "" || name === "@") {
    return normalizedZone;
  }

  return normalizeHostname(`${name}.${normalizedZone}`);
}

/**
 * @param {string} hostname
 * @param {string} zoneDomain
 * @returns {string}
 */
function relativeRecordName(hostname, zoneDomain) {
  const normalizedZone = normalizeHostname(zoneDomain);
  if (!normalizedZone || hostname === normalizedZone) {
    return "";
  }

  return hostname.slice(0, -(normalizedZone.length + 1));
}

/**
 * @param {BunnyDnsRecord} record
 * @param {RequestedAddress} address
 * @returns {Record<string, unknown>}
 */
function recordToUpdatePayload(record, address) {
  return stripUndefined({
    Type: address.type,
    Ttl: record.Ttl,
    Value: address.ip,
    Name: record.Name,
    Weight: record.Weight,
    Priority: record.Priority,
    Flags: record.Flags,
    Tag: record.Tag,
    Port: record.Port,
    PullZoneId: record.PullZoneId ?? record.AcceleratedPullZoneId,
    ScriptId: record.ScriptId,
    Accelerated: record.Accelerated,
    MonitorType: record.MonitorType,
    GeolocationLatitude: record.GeolocationLatitude,
    GeolocationLongitude: record.GeolocationLongitude,
    LatencyZone: record.LatencyZone,
    SmartRoutingType: record.SmartRoutingType,
    Disabled: record.Disabled,
    EnviromentalVariables: record.EnviromentalVariables,
    Comment: record.Comment,
    AutoSslIssuance: record.AutoSslIssuance,
    Id: record.Id,
  });
}

/**
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
function stripUndefined(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

/**
 * @param {Response} response
 * @param {string} operation
 * @returns {void}
 */
function assertBunnyResponse(response, operation) {
  if (response.ok) {
    return;
  }

  throw new Error(`Failed to ${operation}: HTTP ${response.status}.`);
}

/**
 * @param {Request} request
 * @param {RuntimeConfig} config
 * @returns {boolean}
 */
function isAuthorized(request, config) {
  const credentials = parseBasicAuth(request.headers.get("Authorization"));
  if (!credentials) {
    return false;
  }

  if (
    config.username &&
    !constantTimeEqual(credentials.username, config.username)
  ) {
    return false;
  }

  return config.sharedSecrets.some((secret) =>
    constantTimeEqual(credentials.password, secret)
  );
}

/**
 * @param {string | null} header
 * @returns {BasicCredentials | undefined}
 */
function parseBasicAuth(header) {
  if (!header?.toLowerCase().startsWith("basic ")) {
    return undefined;
  }

  try {
    const decoded = globalThis.atob(header.slice(6).trim());
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return undefined;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return undefined;
  }
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

/**
 * @param {URL} url
 * @returns {boolean}
 */
function hasQueryCredentials(url) {
  const credentialKeys = ["user", "username", "password", "pass", "token"];
  return [...url.searchParams.keys()].some((key) =>
    credentialKeys.includes(key.toLowerCase())
  );
}

/**
 * @param {Request} _request
 * @param {URL} url
 * @param {RuntimeConfig} config
 * @returns {boolean}
 */
function isSecureRequest(_request, url, config) {
  if (config.allowInsecureHttp) {
    return true;
  }

  return url.protocol === "https:";
}

/**
 * @param {Request} request
 * @returns {string | undefined}
 */
function getClientIp(request) {
  const headers = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-forwarded-for",
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (!value) {
      continue;
    }

    const candidate = value.split(",")[0]?.trim();
    if (candidate && classifyIpAddress(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isUpdatePath(pathname) {
  return pathname === "/nic/update" || pathname === "/update";
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isCheckIpPath(pathname) {
  return pathname === "/checkip" || pathname === "/nic/checkip" ||
    pathname === "/ip";
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isHealthPath(pathname) {
  return pathname === "/health" || pathname === "/healthz";
}

/**
 * @param {DdnsLine[]} lines
 * @returns {Response}
 */
function ddnsResponse(lines) {
  const status = lines.some((line) => line.code === "badauth") ? 401 : 200;
  const body = lines
    .map((line) => line.detail ? `${line.code} ${line.detail}` : line.code)
    .join("\n") + "\n";

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });

  if (status === 401) {
    headers.set(
      "WWW-Authenticate",
      'Basic realm="@zimme/bunny-ddns-edge-script"',
    );
  }

  return new Response(body, { status, headers });
}

/**
 * @param {string} body
 * @param {number} status
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
function plainResponse(body, status, extraHeaders) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  return new Response(body, { status, headers });
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isValidIpv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) {
      return false;
    }

    return Number(part) <= 255;
  });
}

/**
 * @param {string} ip
 * @returns {string | undefined}
 */
function canonicalizeIpv6(ip) {
  if (!ip.includes(":") || /[%\[\]]/.test(ip)) {
    return undefined;
  }

  let value = ip.toLowerCase();
  const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    if (!isValidIpv4(ipv4Match[1])) {
      return undefined;
    }
    const bytes = ipv4Match[1].split(".").map(Number);
    const replacement = `${((bytes[0] << 8) | bytes[1]).toString(16)}:${
      ((bytes[2] << 8) | bytes[3]).toString(16)
    }`;
    value = value.slice(0, -ipv4Match[1].length) + replacement;
  }

  if ((value.match(/::/g) ?? []).length > 1) {
    return undefined;
  }
  const [leftRaw, rightRaw] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if ([...left, ...right].some((part) => !/^[a-f0-9]{1,4}$/.test(part))) {
    return undefined;
  }
  const omitted = 8 - left.length - right.length;
  if (
    (value.includes("::") && omitted < 1) ||
    (!value.includes("::") && omitted !== 0)
  ) {
    return undefined;
  }
  const groups = [...left, ...Array(omitted).fill("0"), ...right].map((part) =>
    Number.parseInt(part, 16)
  );
  if (groups.length !== 8) {
    return undefined;
  }

  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < groups.length;) {
    if (groups[start] !== 0) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < groups.length && groups[end] === 0) {
      end += 1;
    }
    if (end - start > bestLength && end - start >= 2) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  const parts = groups.map((group) => group.toString(16));
  if (bestStart < 0) {
    return parts.join(":");
  }
  const before = parts.slice(0, bestStart).join(":");
  const after = parts.slice(bestStart + bestLength).join(":");
  return `${before}::${after}`;
}

/**
 * @param {string} value
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesAny(value, patterns) {
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

/**
 * @param {string} value
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesPattern(value, pattern) {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return value.endsWith(`.${suffix}`) && value !== suffix;
  }

  return value === pattern;
}

/**
 * @param {string[]} patterns
 * @param {string} name
 * @returns {string[]}
 */
function normalizePatterns(patterns, name) {
  if (!Array.isArray(patterns)) {
    throw new Error(`${name} must be an array of hostname patterns.`);
  }

  return patterns.map((pattern) => {
    if (typeof pattern !== "string") {
      throw new Error(`${name} contains a non-string hostname pattern.`);
    }

    const value = pattern.trim().toLowerCase();
    const wildcard = value.startsWith("*.");
    const hostname = normalizeHostname(wildcard ? value.slice(2) : value);
    if (!hostname || value.includes("*") !== wildcard) {
      throw new Error(
        `${name} patterns must be exact hostnames or begin with "*.".`,
      );
    }

    return wildcard ? `*.${hostname}` : hostname;
  });
}

/**
 * @param {string} secret
 * @returns {void}
 */
function validateSharedSecret(secret) {
  if (
    typeof secret !== "string" ||
    secret.length < MIN_SHARED_SECRET_LENGTH ||
    secret.length > MAX_SHARED_SECRET_LENGTH ||
    !/^[\x21-\x7E]+$/.test(secret) ||
    secret.includes(",")
  ) {
    throw new Error(
      `DDNS shared secrets must be ${MIN_SHARED_SECRET_LENGTH} to ${MAX_SHARED_SECRET_LENGTH} printable ASCII characters without whitespace or commas.`,
    );
  }
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function parseSharedSecretList(value) {
  if (value === "") {
    return [];
  }
  return value.split(",");
}

/**
 * @param {string | undefined} value
 * @returns {string[]}
 */
function parseList(value) {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function emptyToUndefined(value) {
  if (!value || value.trim() === "") {
    return undefined;
  }

  return value;
}

/**
 * @param {string | undefined} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue) {
  if (!value || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

/**
 * @param {string | undefined} value
 * @param {number} defaultValue
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function parseInteger(value, defaultValue, min, max) {
  if (!value) {
    return defaultValue;
  }

  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Integer value must be between ${min} and ${max}.`);
  }

  return parsed;
}

/**
 * @param {string} value
 * @param {boolean} allowInsecureHttp
 * @returns {string}
 */
function parseApiBaseUrl(value, allowInsecureHttp) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "DDNS_API_BASE_URL cannot contain credentials, query, or fragment.",
    );
  }

  if (
    url.protocol !== "https:" &&
    !(allowInsecureHttp && url.protocol === "http:")
  ) {
    throw new Error("DDNS_API_BASE_URL must use HTTPS.");
  }

  return url.toString();
}

/**
 * @param {string | undefined} value
 * @returns {MultiRecordMode}
 */
function parseMultiRecordMode(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "reject") {
    return "reject";
  }
  if (normalized === "update-all") {
    return "update-all";
  }
  throw new Error(`Invalid DDNS_MULTI_RECORD_MODE: ${value}`);
}
