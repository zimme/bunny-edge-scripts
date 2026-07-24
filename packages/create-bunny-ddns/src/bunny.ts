const BUNNY_API_BASE_URL = "https://api.bunny.net";
const MAX_EDGE_SCRIPT_NAME_LENGTH = 100;
const MAX_SECRET_LENGTH = 4096;
const MAX_DDNS_SHARED_SECRET_LENGTH = 256;
const MIN_DDNS_SHARED_SECRET_LENGTH = 32;
const MAX_VARIABLE_VALUE_LENGTH = 4096;
const EDGE_SCRIPT_PAGE_SIZE = 1000;

export interface BunnyProvisionOptions {
  apiKey: string;
  scriptName: string;
  ddnsSharedSecret: string;
  ddnsUsername: string;
  allowedHosts: string;
  allowedZones: string;
  allowAllHosts?: boolean;
}

export interface BunnyProvisionResult {
  scriptId: number;
  hostname: string | null;
}

interface EdgeScript {
  Id: number;
  Name: string | null;
  Deleted?: boolean;
  DefaultHostname?: string | null;
  SystemHostname?: string | null;
}

interface EdgeScriptList {
  Items?: EdgeScript[] | null;
  CurrentPage?: number;
  TotalItems?: number;
  HasMoreItems?: boolean;
}

interface ValidatedProvisionOptions {
  apiKey: string;
  scriptName: string;
  ddnsSharedSecret: string;
  ddnsUsername: string;
  allowedHosts: string;
  allowedZones: string;
  allowAllHosts: boolean;
}

export async function provisionBunnyEdgeScript(
  options: BunnyProvisionOptions,
  fetcher: typeof fetch = fetch,
): Promise<BunnyProvisionResult> {
  const validated = validateProvisionOptions(options);
  await assertNoScriptNameCollision(
    validated.scriptName,
    validated.apiKey,
    fetcher,
  );

  const script = await bunnyRequest<EdgeScript>(
    "/compute/script",
    validated.apiKey,
    {
      method: "POST",
      body: {
        Name: validated.scriptName,
        Code: null,
        ScriptType: 0,
        CreateLinkedPullZone: false,
      },
      expectedStatuses: [201],
    },
    fetcher,
  );
  if (!Number.isSafeInteger(script.Id) || script.Id <= 0) {
    throw new Error("Bunny returned an invalid Edge Script ID.");
  }

  try {
    const variables: Array<[string, string]> = [
      ["DDNS_USERNAME", validated.ddnsUsername],
      [
        "DDNS_ALLOW_ALL_HOSTS",
        String(validated.allowAllHosts),
      ],
    ];
    if (validated.allowedHosts) {
      variables.push(["DDNS_ALLOWED_HOSTS", validated.allowedHosts]);
    }
    if (validated.allowedZones) {
      variables.push(["DDNS_ALLOWED_ZONES", validated.allowedZones]);
    }
    for (const [name, value] of variables) {
      await upsertVariable(script.Id, name, value, validated.apiKey, fetcher);
    }

    await upsertSecret(
      script.Id,
      "DDNS_SHARED_SECRET",
      validated.ddnsSharedSecret,
      validated.apiKey,
      fetcher,
    );
    await upsertSecret(
      script.Id,
      "BUNNY_API_KEY",
      validated.apiKey,
      validated.apiKey,
      fetcher,
    );
  } catch (error) {
    const configurationError = safeErrorMessage(error);
    try {
      await deleteEdgeScript(script.Id, validated.apiKey, fetcher);
    } catch (cleanupError) {
      throw new Error(
        `Bunny created Edge Script ${script.Id}, but configuration and cleanup both failed. Review and delete it in the Bunny dashboard. Configuration error: ${configurationError} Cleanup error: ${
          safeErrorMessage(cleanupError)
        }`,
      );
    }
    throw new Error(
      `Bunny could not configure Edge Script ${script.Id}; the newly created script was deleted and provisioning can be retried. ${configurationError}`,
    );
  }

  return {
    scriptId: script.Id,
    hostname: script.DefaultHostname ?? script.SystemHostname ?? null,
  };
}

function validateProvisionOptions(
  options: BunnyProvisionOptions,
): ValidatedProvisionOptions {
  if (typeof options.apiKey !== "string") {
    throw new Error("The Bunny API key must be a string.");
  }
  const apiKey = options.apiKey.trim();
  if (!apiKey || apiKey.length > MAX_SECRET_LENGTH) {
    throw new Error(
      `The Bunny API key must be 1 to ${MAX_SECRET_LENGTH} characters.`,
    );
  }

  if (typeof options.scriptName !== "string") {
    throw new Error("The Bunny Edge Script name must be a string.");
  }
  const scriptName = options.scriptName.trim();
  if (
    !/^[A-Za-z0-9._-]+$/.test(scriptName) ||
    scriptName.length > MAX_EDGE_SCRIPT_NAME_LENGTH
  ) {
    throw new Error(
      "The Bunny Edge Script name must use 1 to 100 letters, numbers, periods, underscores, or hyphens.",
    );
  }

  if (typeof options.ddnsSharedSecret !== "string") {
    throw new Error("The DDNS shared secret must be a string.");
  }
  validateDdnsSharedSecret(options.ddnsSharedSecret);

  if (typeof options.ddnsUsername !== "string") {
    throw new Error("The DDNS username must be a string.");
  }
  const ddnsUsername = options.ddnsUsername.trim();
  if (!/^[A-Za-z0-9._@+-]{1,128}$/.test(ddnsUsername)) {
    throw new Error(
      "The DDNS username must use 1 to 128 safe Basic Auth username characters.",
    );
  }

  if (
    typeof options.allowedHosts !== "string" ||
    typeof options.allowedZones !== "string"
  ) {
    throw new Error("DDNS hostname and zone allow-lists must be strings.");
  }
  const allowedHosts = validatePatternList(
    "DDNS_ALLOWED_HOSTS",
    options.allowedHosts,
  );
  const allowedZones = validatePatternList(
    "DDNS_ALLOWED_ZONES",
    options.allowedZones,
  );
  if (
    options.allowAllHosts !== undefined &&
    typeof options.allowAllHosts !== "boolean"
  ) {
    throw new Error("allowAllHosts must be a boolean when provided.");
  }
  const allowAllHosts = options.allowAllHosts === true;
  const hasScope = Boolean(allowedHosts || allowedZones);
  if (!hasScope && !allowAllHosts) {
    throw new Error(
      "Set allowedHosts or allowedZones, or explicitly set allowAllHosts=true to grant account-wide DDNS authority.",
    );
  }
  if (hasScope && allowAllHosts) {
    throw new Error(
      "allowAllHosts=true cannot be combined with allowedHosts or allowedZones.",
    );
  }

  return {
    apiKey,
    scriptName,
    ddnsSharedSecret: options.ddnsSharedSecret,
    ddnsUsername,
    allowedHosts,
    allowedZones,
    allowAllHosts,
  };
}

export function validateDdnsSharedSecret(secret: string): void {
  if (
    secret.length < MIN_DDNS_SHARED_SECRET_LENGTH ||
    secret.length > MAX_DDNS_SHARED_SECRET_LENGTH ||
    !/^[\x21-\x7E]+$/.test(secret) ||
    secret.includes(",")
  ) {
    throw new Error(
      `DDNS shared secret must be ${MIN_DDNS_SHARED_SECRET_LENGTH} to ${MAX_DDNS_SHARED_SECRET_LENGTH} printable ASCII characters without commas.`,
    );
  }
}

function validatePatternList(name: string, value: string): string {
  if (
    value.length > MAX_VARIABLE_VALUE_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    throw new Error(
      `${name} must not exceed ${MAX_VARIABLE_VALUE_LENGTH} characters or contain line breaks.`,
    );
  }
  if (value.trim() === "") return "";

  const patterns = value.split(",").map((pattern) => pattern.trim());
  if (patterns.some((pattern) => pattern.length === 0)) {
    throw new Error(`${name} must not contain empty patterns.`);
  }
  const normalized = patterns.map((pattern) => {
    const candidate = pattern.replace(/\.$/, "").toLowerCase();
    const hostname = candidate.startsWith("*.")
      ? candidate.slice(2)
      : candidate;
    if (!isValidHostname(hostname)) {
      throw new Error(
        `${name} must contain only comma-separated DNS names or leading-wildcard patterns.`,
      );
    }
    return candidate.startsWith("*.") ? `*.${hostname}` : hostname;
  }).join(",");

  return normalized;
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false;
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

async function assertNoScriptNameCollision(
  scriptName: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<void> {
  const normalizedName = scriptName.toLowerCase();
  for (let page = 1;; page += 1) {
    const query = new URLSearchParams({
      type: "0",
      page: String(page),
      perPage: String(EDGE_SCRIPT_PAGE_SIZE),
      search: scriptName,
    });
    const existing = await bunnyRequest<EdgeScriptList>(
      `/compute/script?${query}`,
      apiKey,
      { expectedStatuses: [200] },
      fetcher,
    );
    if (
      existing.Items !== undefined &&
      existing.Items !== null &&
      !Array.isArray(existing.Items)
    ) {
      throw new Error("Bunny returned an invalid Edge Script list.");
    }
    if (
      existing.HasMoreItems !== undefined &&
      typeof existing.HasMoreItems !== "boolean"
    ) {
      throw new Error("Bunny returned invalid Edge Script pagination.");
    }

    const collision = existing.Items?.find((script) =>
      !script.Deleted && script.Name?.toLowerCase() === normalizedName
    );
    if (collision) {
      if (!Number.isSafeInteger(collision.Id) || collision.Id <= 0) {
        throw new Error("Bunny returned an invalid colliding Edge Script ID.");
      }
      throw new Error(
        `An Edge Script named "${scriptName}" already exists (ID ${collision.Id}). Automatic setup will not overwrite it.`,
      );
    }
    if (existing.HasMoreItems !== true) return;
  }
}

async function upsertSecret(
  scriptId: number,
  name: string,
  secret: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<void> {
  await bunnyRequest(
    `/compute/script/${scriptId}/secrets`,
    apiKey,
    {
      method: "PUT",
      body: { Name: name, Secret: secret },
      expectedStatuses: [200, 204],
    },
    fetcher,
  );
}

async function upsertVariable(
  scriptId: number,
  name: string,
  value: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<void> {
  await bunnyRequest(
    `/compute/script/${scriptId}/variables`,
    apiKey,
    {
      method: "PUT",
      body: { Name: name, Required: false, DefaultValue: value },
      expectedStatuses: [200, 204],
    },
    fetcher,
  );
}

async function deleteEdgeScript(
  scriptId: number,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<void> {
  await bunnyRequest(
    `/compute/script/${scriptId}`,
    apiKey,
    { method: "DELETE", expectedStatuses: [204] },
    fetcher,
  );
}

interface BunnyRequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  expectedStatuses: number[];
}

async function bunnyRequest<T = unknown>(
  path: string,
  apiKey: string,
  options: BunnyRequestOptions,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(`${BUNNY_API_BASE_URL}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "error",
  });
  if (!options.expectedStatuses.includes(response.status)) {
    throw new Error(
      `Bunny API request failed with HTTP ${response.status}.`,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error("Bunny API returned an invalid JSON response.");
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Bunny API failure.";
}
