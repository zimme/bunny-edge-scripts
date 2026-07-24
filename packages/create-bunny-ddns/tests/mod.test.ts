import { defaultOptions, scaffoldProject } from "../src/mod.ts";
import { main } from "../src/main.ts";
import { provisionBunnyEdgeScript } from "../src/bunny.ts";
import {
  type PrivateTerminalIO,
  provisionFromPrivateTerminal,
} from "../src/provision.ts";

const DDNS_SECRET = "a-strong-ddns-secret-from-a-password-manager";

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${expected}`);
  }
}

Deno.test("dry-run scaffold returns expected Bunny Git files", async () => {
  const result = await scaffoldProject({
    ...defaultOptions(),
    dryRun: true,
  });

  if (!result.files.includes("deno.json")) {
    throw new Error("Missing deno.json");
  }
  for (
    const file of [
      "AGENTS.md",
      "LICENSE",
      ".tool-versions",
      ".env.example",
      "provision.ts",
    ]
  ) {
    if (!result.files.includes(file)) {
      throw new Error(`Missing ${file}`);
    }
  }

  if (result.files.includes(".github/workflows/deploy.yml")) {
    throw new Error("Bunny Git mode should not include GitHub deploy workflow");
  }
});

Deno.test("scaffold emits account-wide scope only after explicit opt-in", async () => {
  const directory = await Deno.makeTempDir();
  await scaffoldProject({
    ...defaultOptions(),
    directory,
    allowAllHosts: true,
  });

  assertIncludes(
    await Deno.readTextFile(`${directory}/.env.example`),
    "DDNS_ALLOW_ALL_HOSTS=true",
  );
  assertIncludes(
    await Deno.readTextFile(`${directory}/provision.ts`),
    "allowAllHosts: true",
  );
});

Deno.test("scaffold writes a GitHub Action workflow when requested", async () => {
  const directory = await Deno.makeTempDir();
  const result = await scaffoldProject({
    ...defaultOptions(),
    directory,
    deployMode: "github-action",
  });

  if (!result.files.includes(".github/workflows/deploy.yml")) {
    throw new Error("Missing deploy workflow");
  }

  const readme = await Deno.readTextFile(`${directory}/README.md`);
  assertIncludes(readme, "GitHub Action Upload");
  assertIncludes(readme, "Ask An AI Agent");
  assertIncludes(readme, "SAFE AI HANDOFF");
  assertIncludes(readme, "stop and wait");
  assertIncludes(readme, "fails closed");
  if (readme.includes("checkip-server")) {
    throw new Error(
      "Generated inadyn config must not trust an unverified IP header",
    );
  }

  const agentInstructions = await Deno.readTextFile(`${directory}/AGENTS.md`);
  assertIncludes(agentInstructions, "deno task ci");
  assertIncludes(agentInstructions, "Never commit, print, log");
  assertIncludes(agentInstructions, "scope is declared in `.env.example`");
  assertIncludes(agentInstructions, ".github/workflows/deploy.yml");
  assertIncludes(agentInstructions, "Never ask the user for credentials");
  assertIncludes(agentInstructions, "must never be run by an AI agent");

  const denoJson = await Deno.readTextFile(`${directory}/deno.json`);
  assertIncludes(denoJson, "jsr:@zimme/bunny-ddns-edge-script@^0.0.0");
  assertIncludes(
    denoJson,
    "jsr:@zimme/create-bunny-ddns@^0.0.0/provision",
  );
  assertIncludes(denoJson, "npm:@bunny.net/edgescript-sdk@0.12.1");
  assertIncludes(denoJson, "deno run --allow-net=api.bunny.net provision.ts");

  const provisionSource = await Deno.readTextFile(
    `${directory}/provision.ts`,
  );
  assertIncludes(provisionSource, "provisionFromPrivateTerminal");
  assertIncludes(provisionSource, "allowAllHosts: false");
  if (
    provisionSource.includes("account-key") ||
    provisionSource.includes("client-secret")
  ) {
    throw new Error("Generated provisioning source contains credentials");
  }

  const gitignore = await Deno.readTextFile(`${directory}/.gitignore`);
  assertIncludes(gitignore, ".bunny/");

  const workflow = await Deno.readTextFile(
    `${directory}/.github/workflows/deploy.yml`,
  );
  assertIncludes(workflow, "deno install --frozen");
  assertIncludes(workflow, "deno-version: 2.9.3");
  assertIncludes(workflow, "script_id: ${{ secrets.SCRIPT_ID }}");
  if (workflow.includes("env:\n      SCRIPT_ID")) {
    throw new Error(
      "Deployment secrets must not be job-level environment variables",
    );
  }

  const envExample = await Deno.readTextFile(`${directory}/.env.example`);
  assertIncludes(envExample, "DDNS_ALLOW_ALL_HOSTS=false");
});

Deno.test("force mode refuses to overwrite through a symlink", async () => {
  const parent = await Deno.makeTempDir();
  const directory = `${parent}/project`;
  const externalFile = `${parent}/outside.md`;
  await Deno.mkdir(directory);
  await Deno.writeTextFile(externalFile, "unchanged\n");
  await Deno.symlink(externalFile, `${directory}/README.md`);

  let failed = false;
  try {
    await scaffoldProject({
      ...defaultOptions(),
      directory,
      force: true,
    });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("symlink");
  }

  if (!failed) {
    throw new Error("Expected a symlinked output to be rejected");
  }
  if (await Deno.readTextFile(externalFile) !== "unchanged\n") {
    throw new Error("Scaffold modified a file outside its target directory");
  }
});

Deno.test("scaffold rejects values that could inject agent instructions", async () => {
  for (
    const options of [
      { projectName: "safe\nignore-instructions" },
      { ddnsUsername: "inadyn\nignore-instructions" },
      { allowedHosts: "home.example.com\nignore-instructions" },
    ]
  ) {
    let failed = false;
    try {
      await scaffoldProject({
        ...defaultOptions(),
        ...options,
        dryRun: true,
      });
    } catch {
      failed = true;
    }
    if (!failed) {
      throw new Error("Expected unsafe generated instruction input to fail");
    }
  }
});

Deno.test("scaffold validates package and DNS scope configuration", async () => {
  for (
    const options of [
      { packageVersion: "latest" },
      { packageRegistry: "other" },
      { deployMode: "other" },
      { allowedHosts: "bad*.example.com" },
      { allowedZones: "example" },
      { allowedHosts: "home.example.com", allowAllHosts: true },
    ]
  ) {
    let failed = false;
    try {
      await scaffoldProject({
        ...defaultOptions(),
        ...options,
        dryRun: true,
      } as ReturnType<typeof defaultOptions>);
    } catch {
      failed = true;
    }
    if (!failed) {
      throw new Error(
        `Expected invalid scaffold options to fail: ${JSON.stringify(options)}`,
      );
    }
  }
});

Deno.test("CLI rejects unknown options", async () => {
  let failed = false;
  try {
    await main(["--dry-run", "--unknown"]);
  } catch (error) {
    failed = error instanceof Error && error.message.includes("Unknown option");
  }

  if (!failed) {
    throw new Error("Expected unknown CLI option to fail");
  }
});

Deno.test("Bunny provisioning creates a script and configures secrets", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Promise.resolve(Response.json({
        Items: [],
        CurrentPage: 1,
        TotalItems: 0,
        HasMoreItems: false,
      }));
    }
    if (requests.length === 2) {
      return Promise.resolve(Response.json({
        Id: 42,
        Name: "home-ddns",
        DefaultHostname: "home-ddns.edge.bunny.net",
      }, { status: 201 }));
    }
    return Promise.resolve(Response.json({
      Id: requests.length,
      Name: "configured-value",
    }));
  };

  const result = await provisionBunnyEdgeScript({
    apiKey: "account-key",
    scriptName: " home-ddns ",
    ddnsSharedSecret: DDNS_SECRET,
    ddnsUsername: " inadyn ",
    allowedHosts: " HOME.EXAMPLE.COM. ",
    allowedZones: "",
  }, fetcher as typeof fetch);

  if (result.scriptId !== 42) {
    throw new Error("Unexpected script ID");
  }
  if (requests.length !== 7) {
    throw new Error(`Expected 7 Bunny requests, received ${requests.length}`);
  }
  const listUrl = new URL(requests[0].url);
  if (
    listUrl.pathname !== "/compute/script" ||
    listUrl.searchParams.get("type") !== "0" ||
    listUrl.searchParams.get("page") !== "1" ||
    listUrl.searchParams.get("perPage") !== "1000" ||
    listUrl.searchParams.get("search") !== "home-ddns" ||
    requests[0].init?.method !== "GET"
  ) {
    throw new Error("Edge Script collision request was not correctly formed");
  }

  const createRequest = JSON.parse(String(requests[1].init?.body));
  if (
    requests[1].url !== "https://api.bunny.net/compute/script" ||
    requests[1].init?.method !== "POST" ||
    createRequest.Name !== "home-ddns" ||
    createRequest.Code !== null ||
    createRequest.ScriptType !== 0 ||
    createRequest.CreateLinkedPullZone !== false
  ) {
    throw new Error("Edge Script creation request was not safely configured");
  }
  for (const request of requests) {
    if (
      request.url.includes("account-key") ||
      request.url.includes(DDNS_SECRET)
    ) {
      throw new Error("A secret was included in a Bunny API URL");
    }
    if (new Headers(request.init?.headers).get("AccessKey") !== "account-key") {
      throw new Error("Bunny API request did not use the AccessKey header");
    }
    if (request.init?.redirect !== "error") {
      throw new Error("Bunny API request allowed redirects");
    }
  }

  const expectedWrites = [
    {
      url: "https://api.bunny.net/compute/script/42/variables",
      body: {
        Name: "DDNS_USERNAME",
        Required: false,
        DefaultValue: "inadyn",
      },
    },
    {
      url: "https://api.bunny.net/compute/script/42/variables",
      body: {
        Name: "DDNS_ALLOW_ALL_HOSTS",
        Required: false,
        DefaultValue: "false",
      },
    },
    {
      url: "https://api.bunny.net/compute/script/42/variables",
      body: {
        Name: "DDNS_ALLOWED_HOSTS",
        Required: false,
        DefaultValue: "home.example.com",
      },
    },
    {
      url: "https://api.bunny.net/compute/script/42/secrets",
      body: { Name: "DDNS_SHARED_SECRET", Secret: DDNS_SECRET },
    },
    {
      url: "https://api.bunny.net/compute/script/42/secrets",
      body: { Name: "BUNNY_API_KEY", Secret: "account-key" },
    },
  ];
  for (const [index, expected] of expectedWrites.entries()) {
    const request = requests[index + 2];
    if (
      request.url !== expected.url ||
      request.init?.method !== "PUT" ||
      JSON.stringify(JSON.parse(String(request.init?.body))) !==
        JSON.stringify(expected.body)
    ) {
      throw new Error(`Unexpected Bunny upsert request at index ${index}`);
    }
  }
});

Deno.test("Bunny provisioning refuses to overwrite an existing script", async () => {
  let requests = 0;
  const fetcher = () => {
    requests += 1;
    return Promise.resolve(Response.json({
      Items: [{ Id: 7, Name: "home-ddns", Deleted: false }],
      CurrentPage: 1,
      TotalItems: 1,
      HasMoreItems: false,
    }));
  };

  let failed = false;
  try {
    await provisionBunnyEdgeScript({
      apiKey: "account-key",
      scriptName: "home-ddns",
      ddnsSharedSecret: DDNS_SECRET,
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    }, fetcher as typeof fetch);
  } catch (error) {
    failed = error instanceof Error &&
      error.message.includes("will not overwrite");
  }

  if (!failed || requests !== 1) {
    throw new Error("Existing script collision was not handled safely");
  }
});

Deno.test("Bunny provisioning checks every collision page", async () => {
  const requestedPages: string[] = [];
  const fetcher = (url: string | URL | Request) => {
    const page = new URL(String(url)).searchParams.get("page") ?? "";
    requestedPages.push(page);
    return Promise.resolve(Response.json(
      page === "1"
        ? {
          Items: [{ Id: 6, Name: "another-script", Deleted: false }],
          CurrentPage: 1,
          TotalItems: 2,
          HasMoreItems: true,
        }
        : {
          Items: [{ Id: 7, Name: "HOME-DDNS", Deleted: false }],
          CurrentPage: 2,
          TotalItems: 2,
          HasMoreItems: false,
        },
    ));
  };

  let message = "";
  try {
    await provisionBunnyEdgeScript({
      apiKey: "account-key",
      scriptName: "home-ddns",
      ddnsSharedSecret: DDNS_SECRET,
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    }, fetcher as typeof fetch);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (
    !message.includes("will not overwrite") || requestedPages.join() !== "1,2"
  ) {
    throw new Error("Paginated Edge Script collision was not detected");
  }
});

Deno.test("Bunny provisioning requires explicit account-wide authority", async () => {
  for (
    const options of [
      { allowedHosts: "", allowedZones: "" },
      {
        allowedHosts: "home.example.com",
        allowedZones: "",
        allowAllHosts: true,
      },
    ]
  ) {
    let requestAttempted = false;
    let message = "";
    try {
      await provisionBunnyEdgeScript(
        {
          apiKey: "account-key",
          scriptName: "home-ddns",
          ddnsSharedSecret: DDNS_SECRET,
          ddnsUsername: "inadyn",
          ...options,
        },
        (() => {
          requestAttempted = true;
          return Promise.resolve(new Response());
        }) as typeof fetch,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (!message.includes("allowAllHosts") || requestAttempted) {
      throw new Error("Account-wide authority did not fail closed");
    }
  }
});

Deno.test("Bunny provisioning accepts explicit account-wide authority", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Promise.resolve(Response.json({
        Items: [],
        CurrentPage: 1,
        TotalItems: 0,
        HasMoreItems: false,
      }));
    }
    if (requests.length === 2) {
      return Promise.resolve(Response.json({
        Id: 42,
        Name: "home-ddns",
      }, { status: 201 }));
    }
    return Promise.resolve(Response.json({
      Id: requests.length,
      Name: "configured-value",
    }));
  };

  await provisionBunnyEdgeScript({
    apiKey: "account-key",
    scriptName: "home-ddns",
    ddnsSharedSecret: DDNS_SECRET,
    ddnsUsername: "inadyn",
    allowedHosts: "",
    allowedZones: "",
    allowAllHosts: true,
  }, fetcher as typeof fetch);

  if (requests.length !== 6) {
    throw new Error("Unexpected request count for account-wide provisioning");
  }
  const authority = JSON.parse(String(requests[3].init?.body));
  if (
    authority.Name !== "DDNS_ALLOW_ALL_HOSTS" ||
    authority.DefaultValue !== "true"
  ) {
    throw new Error("Explicit account-wide authority was not provisioned");
  }
});

Deno.test("Bunny provisioning validates inputs before API access", async () => {
  const invalidOptions = [
    { apiKey: "a".repeat(4097) },
    { scriptName: "   " },
    { ddnsSharedSecret: "too-short" },
    { ddnsSharedSecret: `${"a".repeat(31)}\n` },
    { ddnsUsername: "" },
    { ddnsUsername: "bad:user" },
    { allowedHosts: "not-a-hostname" },
    { allowedHosts: "home.example.com," },
    { allowedHosts: "home.example.com\n" },
    { allowedZones: "example.com,*bad.example.com" },
    { allowedHosts: `${"a".repeat(64)}.example.com` },
    { allowedHosts: Array(400).fill("home.example.com").join(",") },
    { allowAllHosts: "true" as unknown as boolean },
  ];

  for (const invalid of invalidOptions) {
    let requestAttempted = false;
    let failed = false;
    try {
      await provisionBunnyEdgeScript(
        {
          apiKey: "account-key",
          scriptName: "home-ddns",
          ddnsSharedSecret: DDNS_SECRET,
          ddnsUsername: "inadyn",
          allowedHosts: "home.example.com",
          allowedZones: "",
          ...invalid,
        },
        (() => {
          requestAttempted = true;
          return Promise.resolve(new Response());
        }) as typeof fetch,
      );
    } catch {
      failed = true;
    }
    if (!failed || requestAttempted) {
      throw new Error(
        `Invalid provisioning input reached Bunny: ${JSON.stringify(invalid)}`,
      );
    }
  }
});

Deno.test("Bunny provisioning deletes a partially configured script", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Promise.resolve(Response.json({
        Items: [],
        CurrentPage: 1,
        TotalItems: 0,
        HasMoreItems: false,
      }));
    }
    if (requests.length === 2) {
      return Promise.resolve(Response.json({
        Id: 42,
        Name: "home-ddns",
      }, { status: 201 }));
    }
    if (init?.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const body = JSON.parse(String(init?.body));
    if (body.Name === "BUNNY_API_KEY") {
      return Promise.resolve(
        new Response(
          `{"Message":"account-key ${DDNS_SECRET}"}`,
          { status: 500 },
        ),
      );
    }
    return Promise.resolve(Response.json({
      Id: requests.length,
      Name: body.Name,
    }));
  };

  let message = "";
  try {
    await provisionBunnyEdgeScript({
      apiKey: "account-key",
      scriptName: "home-ddns",
      ddnsSharedSecret: DDNS_SECRET,
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    }, fetcher as typeof fetch);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  const cleanup = requests.at(-1);
  if (
    !message.includes("newly created script was deleted") ||
    message.includes("account-key") ||
    message.includes(DDNS_SECRET) ||
    cleanup?.url !== "https://api.bunny.net/compute/script/42" ||
    cleanup.init?.method !== "DELETE" ||
    cleanup.init?.body !== undefined
  ) {
    throw new Error("Partial Bunny setup was not cleaned up safely");
  }
});

Deno.test("Bunny provisioning reports failed cleanup without secrets", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Promise.resolve(Response.json({
        Items: [],
        CurrentPage: 1,
        TotalItems: 0,
        HasMoreItems: false,
      }));
    }
    if (requests.length === 2) {
      return Promise.resolve(Response.json({
        Id: 42,
        Name: "home-ddns",
      }, { status: 201 }));
    }
    if (init?.method === "DELETE") {
      return Promise.resolve(
        new Response(
          `{"Message":"account-key ${DDNS_SECRET}"}`,
          { status: 503 },
        ),
      );
    }
    return Promise.resolve(new Response(null, { status: 500 }));
  };

  let message = "";
  try {
    await provisionBunnyEdgeScript({
      apiKey: "account-key",
      scriptName: "home-ddns",
      ddnsSharedSecret: DDNS_SECRET,
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    }, fetcher as typeof fetch);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (
    !message.includes("configuration and cleanup both failed") ||
    !message.includes("Review and delete it") ||
    !message.includes("HTTP 503") ||
    message.includes("account-key") ||
    message.includes(DDNS_SECRET)
  ) {
    throw new Error("Cleanup failure did not produce a secret-safe recovery");
  }
});

Deno.test("private-terminal provisioning never prints credentials", async () => {
  const outputs: string[] = [];
  const prompts: string[] = [];
  const secrets = [
    "account-key",
    "a-strong-ddns-secret-from-a-password-manager",
    "a-strong-ddns-secret-from-a-password-manager",
  ];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const io: PrivateTerminalIO = {
    isTerminal: true,
    readAcknowledgement(promptText) {
      prompts.push(promptText);
      return "I AM IN A PRIVATE TERMINAL";
    },
    readSecret(promptText) {
      prompts.push(promptText);
      return Promise.resolve(secrets.shift() ?? "");
    },
    write(message) {
      outputs.push(message);
    },
  };
  const fetcher = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Promise.resolve(Response.json({ Items: [] }));
    }
    if (requests.length === 2) {
      return Promise.resolve(Response.json({
        Id: 42,
        Name: "home-ddns",
        DefaultHostname: "home-ddns.edge.bunny.net",
      }, { status: 201 }));
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  };

  const result = await provisionFromPrivateTerminal(
    {
      scriptName: "home-ddns",
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    },
    io,
    fetcher as typeof fetch,
  );

  if (result.scriptId !== 42 || requests.length !== 7) {
    throw new Error("Private-terminal provisioning did not complete");
  }
  const transcript = [...outputs, ...prompts].join("\n");
  for (
    const expected of [
      "BEGIN SAFE AI HANDOFF",
      "Bunny provisioning: complete",
      "Script ID: 42",
      "Script hostname: home-ddns.edge.bunny.net",
      "Git integration: pending user dashboard action",
      "END SAFE AI HANDOFF",
    ]
  ) {
    assertIncludes(transcript, expected);
  }
  for (
    const secret of [
      "account-key",
      "a-strong-ddns-secret-from-a-password-manager",
    ]
  ) {
    if (transcript.includes(secret)) {
      throw new Error("Private-terminal transcript exposed a credential");
    }
  }
});

Deno.test("provisioning refuses non-interactive agent execution", async () => {
  let readAttempted = false;
  let requestAttempted = false;
  const io: PrivateTerminalIO = {
    isTerminal: false,
    readAcknowledgement() {
      readAttempted = true;
      return null;
    },
    readSecret() {
      readAttempted = true;
      return Promise.resolve("");
    },
    write() {},
  };

  let message = "";
  try {
    await provisionFromPrivateTerminal(
      {
        scriptName: "home-ddns",
        ddnsUsername: "inadyn",
        allowedHosts: "home.example.com",
        allowedZones: "",
      },
      io,
      (() => {
        requestAttempted = true;
        return Promise.resolve(new Response());
      }) as typeof fetch,
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (
    !message.includes("private terminal") || readAttempted || requestAttempted
  ) {
    throw new Error("Non-interactive provisioning did not fail closed");
  }
});

Deno.test("provisioning requires the private-terminal acknowledgement", async () => {
  let secretReadAttempted = false;
  let requestAttempted = false;
  const io: PrivateTerminalIO = {
    isTerminal: true,
    readAcknowledgement() {
      return "continue";
    },
    readSecret() {
      secretReadAttempted = true;
      return Promise.resolve("");
    },
    write() {},
  };

  let message = "";
  try {
    await provisionFromPrivateTerminal(
      {
        scriptName: "home-ddns",
        ddnsUsername: "inadyn",
        allowedHosts: "home.example.com",
        allowedZones: "",
      },
      io,
      (() => {
        requestAttempted = true;
        return Promise.resolve(new Response());
      }) as typeof fetch,
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (
    !message.includes("acknowledgement") ||
    secretReadAttempted ||
    requestAttempted
  ) {
    throw new Error(
      "Missing private-terminal acknowledgement did not fail closed",
    );
  }
});

Deno.test("provisioning rejects mismatched DDNS secret confirmation", async () => {
  const secrets = [
    "account-key",
    "a-strong-ddns-secret-from-a-password-manager",
    "a-different-strong-ddns-secret-value",
  ];
  let requestAttempted = false;
  const io: PrivateTerminalIO = {
    isTerminal: true,
    readAcknowledgement() {
      return "I AM IN A PRIVATE TERMINAL";
    },
    readSecret() {
      return Promise.resolve(secrets.shift() ?? "");
    },
    write() {},
  };

  let message = "";
  try {
    await provisionFromPrivateTerminal(
      {
        scriptName: "home-ddns",
        ddnsUsername: "inadyn",
        allowedHosts: "home.example.com",
        allowedZones: "",
      },
      io,
      (() => {
        requestAttempted = true;
        return Promise.resolve(new Response());
      }) as typeof fetch,
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (!message.includes("did not match") || requestAttempted) {
    throw new Error("Mismatched secret confirmation did not fail closed");
  }
});

Deno.test("Bunny API errors do not echo response bodies or secrets", async () => {
  const fetcher = () =>
    Promise.resolve(
      new Response(`{"Message":"account-key ${DDNS_SECRET}"}`, {
        status: 401,
        statusText: "Unauthorized",
      }),
    );

  let message = "";
  try {
    await provisionBunnyEdgeScript({
      apiKey: "account-key",
      scriptName: "home-ddns",
      ddnsSharedSecret: DDNS_SECRET,
      ddnsUsername: "inadyn",
      allowedHosts: "home.example.com",
      allowedZones: "",
    }, fetcher as typeof fetch);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (
    !message.includes("HTTP 401") ||
    message.includes("account-key") ||
    message.includes(DDNS_SECRET)
  ) {
    throw new Error("Bunny API error handling exposed secret material");
  }
});

Deno.test("scaffold CLI prints credential-safe Bunny handoff", async () => {
  const directory = await Deno.makeTempDir();
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    messages.push(values.map(String).join(" "));
  };
  try {
    await main([directory, "--yes", "--no-install"]);
  } finally {
    console.log = originalLog;
  }

  const output = messages.join("\n");
  for (
    const expected of [
      "No credentials were requested or accessed",
      "Safest setup (recommended)",
      "Deploy and edit with GitHub",
      "BUNNY_API_KEY=<your Bunny account API key>",
      "DDNS_SHARED_SECRET=<a strong, unique secret for inadyn>",
      "DDNS_ALLOW_ALL_HOSTS=false",
      "generated configuration intentionally fails closed",
      "deno task provision",
      "not controlled or recorded by AI",
      "SAFE AI HANDOFF",
    ]
  ) {
    assertIncludes(output, expected);
  }
});
