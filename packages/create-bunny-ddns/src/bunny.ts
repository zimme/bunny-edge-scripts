const BUNNY_API_BASE_URL = "https://api.bunny.net";

export interface BunnyProvisionOptions {
  apiKey: string;
  scriptName: string;
  ddnsSharedSecret: string;
  ddnsUsername: string;
  allowedHosts: string;
  allowedZones: string;
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
}

export async function provisionBunnyEdgeScript(
  options: BunnyProvisionOptions,
  fetcher: typeof fetch = fetch,
): Promise<BunnyProvisionResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("A Bunny API key is required for automatic setup.");
  }
  if (!options.scriptName || options.scriptName.length > 100) {
    throw new Error("The Bunny Edge Script name must be 1 to 100 characters.");
  }
  if (!options.ddnsSharedSecret) {
    throw new Error("A DDNS shared secret is required.");
  }

  const existing = await bunnyRequest<EdgeScriptList>(
    `/compute/script?type=0&page=1&perPage=1000&search=${
      encodeURIComponent(options.scriptName)
    }`,
    apiKey,
    undefined,
    fetcher,
  );
  const normalizedName = options.scriptName.toLowerCase();
  const collision = existing.Items?.find((script) =>
    !script.Deleted && script.Name?.toLowerCase() === normalizedName
  );
  if (collision) {
    throw new Error(
      `An Edge Script named "${options.scriptName}" already exists (ID ${collision.Id}). Automatic setup will not overwrite it.`,
    );
  }

  const script = await bunnyRequest<EdgeScript>(
    "/compute/script",
    apiKey,
    {
      method: "POST",
      body: {
        Name: options.scriptName,
        Code: null,
        ScriptType: 0,
        CreateLinkedPullZone: false,
      },
    },
    fetcher,
  );
  if (!Number.isSafeInteger(script.Id) || script.Id <= 0) {
    throw new Error("Bunny returned an invalid Edge Script ID.");
  }

  try {
    await upsertSecret(
      script.Id,
      "BUNNY_API_KEY",
      apiKey,
      apiKey,
      fetcher,
    );
    await upsertSecret(
      script.Id,
      "DDNS_SHARED_SECRET",
      options.ddnsSharedSecret,
      apiKey,
      fetcher,
    );

    const variables: Array<[string, string]> = [
      ["DDNS_USERNAME", options.ddnsUsername],
      [
        "DDNS_ALLOW_ALL_HOSTS",
        options.allowedHosts || options.allowedZones ? "false" : "true",
      ],
    ];
    if (options.allowedHosts) {
      variables.push(["DDNS_ALLOWED_HOSTS", options.allowedHosts]);
    }
    if (options.allowedZones) {
      variables.push(["DDNS_ALLOWED_ZONES", options.allowedZones]);
    }
    for (const [name, value] of variables) {
      await upsertVariable(script.Id, name, value, apiKey, fetcher);
    }
  } catch (error) {
    throw new Error(
      `Bunny created Edge Script ${script.Id}, but its configuration is incomplete. Review it in the Bunny dashboard. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    scriptId: script.Id,
    hostname: script.DefaultHostname ?? script.SystemHostname ?? null,
  };
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
    },
    fetcher,
  );
}

async function bunnyRequest<T = unknown>(
  path: string,
  apiKey: string,
  options: { method: string; body: Record<string, unknown> } | undefined,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(`${BUNNY_API_BASE_URL}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
      ...(options ? { "Content-Type": "application/json" } : {}),
    },
    body: options ? JSON.stringify(options.body) : undefined,
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `Bunny API request failed with HTTP ${response.status} ${response.statusText}.`,
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
