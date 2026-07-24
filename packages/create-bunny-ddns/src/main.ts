#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net=api.bunny.net --allow-run=deno

import {
  defaultOptions,
  type DeployMode,
  type PackageRegistry,
  type ScaffoldOptions,
  scaffoldProject,
} from "./mod.ts";
import { generateDdnsSharedSecret, provisionBunnyEdgeScript } from "./bunny.ts";

if (import.meta.main) {
  await main(Deno.args);
}

export async function main(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText());
    return;
  }

  const options = optionsFromArgs(args);
  const result = await scaffoldProject(options);

  console.log(`\nCreated ${result.files.length} files in ${result.directory}:`);
  for (const file of result.files) {
    console.log(`  - ${file}`);
  }

  if (options.dryRun) {
    console.log("\nDry run only; no files were written.");
    return;
  }

  if (options.installDependencies) {
    console.log("\nResolving dependencies and creating deno.lock...");
    const status = await new Deno.Command("deno", {
      args: ["install", "--entrypoint", "script.ts"],
      cwd: result.directory,
      stderr: "inherit",
      stdout: "inherit",
    }).spawn().status;
    if (!status.success) {
      throw new Error("deno install failed in the generated project.");
    }
  }

  const interactive = !args.includes("--yes") && !args.includes("-y") &&
    Deno.stdin.isTerminal();
  if (interactive) {
    console.log(
      "\nOptional automatic Bunny setup creates a Standalone Edge Script and " +
        "configures its runtime secrets and variables. Bunny account API keys " +
        "have full account access; this key is used only in memory and is not " +
        "saved locally.",
    );
    const apiKey = await promptSecret(
      "Bunny API key (leave blank for manual instructions): ",
    );
    if (apiKey) {
      const ddnsSharedSecret = generateDdnsSharedSecret();
      console.log("\nCreating and configuring the Bunny Edge Script...");
      const provisioned = await provisionBunnyEdgeScript({
        apiKey,
        scriptName: options.projectName,
        ddnsSharedSecret,
        ddnsUsername: options.ddnsUsername,
        allowedHosts: options.allowedHosts,
        allowedZones: options.allowedZones,
      });
      console.log(`\nCreated Bunny Edge Script ${provisioned.scriptId}.`);
      if (provisioned.hostname) {
        console.log(`Bunny hostname: ${provisioned.hostname}`);
      }
      console.log(
        `DDNS shared secret (shown once; configure this in inadyn):\n${ddnsSharedSecret}`,
      );
      console.log(gitIntegrationInstructions(result.directory));
      return;
    }
  }

  console.log(manualBunnySetupInstructions(options, result.directory));
}

function manualBunnySetupInstructions(
  options: ScaffoldOptions,
  directory: string,
): string {
  const scopeVariables = options.allowedHosts || options.allowedZones
    ? `${
      options.allowedHosts
        ? `\n     DDNS_ALLOWED_HOSTS=${options.allowedHosts}`
        : ""
    }${
      options.allowedZones
        ? `\n     DDNS_ALLOWED_ZONES=${options.allowedZones}`
        : ""
    }\n     DDNS_ALLOW_ALL_HOSTS=false`
    : "\n     DDNS_ALLOW_ALL_HOSTS=true";

  return `\nAutomatic Bunny setup was skipped.

Manual Bunny setup:
  1. Push ${directory} to GitHub.
  2. In Bunny, open Edge Platform > Scripting and add a Standalone script.
  3. Choose "Deploy and edit with GitHub" and connect this repository.
  4. Use install command: deno install --frozen
  5. Use build command: deno task build
  6. Use entry file: generated/script.ts
  7. Under Env Configuration, add these Environment Secrets:
     BUNNY_API_KEY=<your Bunny account API key>
     DDNS_SHARED_SECRET=<a strong, unique secret for inadyn>
  8. Add these Environment Variables:
     DDNS_USERNAME=${options.ddnsUsername}${scopeVariables}

Local checks:
  cd ${directory}
  ${options.installDependencies ? "" : "deno install\n  "}deno task ci

The generated README.md contains the complete deployment and inadyn setup.`;
}

function gitIntegrationInstructions(directory: string): string {
  return `\nFinish the Git integration in Bunny:
  1. Push ${directory} to GitHub.
  2. Open the new script in Bunny and connect this repository.
  3. Set install command to: deno install --frozen
  4. Set build command to: deno task build
  5. Set entry file to: generated/script.ts
  6. Deploy, then use the script hostname in inadyn.

The Bunny API key was not written to disk.`;
}

function optionsFromArgs(args: string[]): ScaffoldOptions {
  const options = defaultOptions();
  let positionalCount = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--yes" || arg === "-y") {
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--no-install") {
      options.installDependencies = false;
      continue;
    }

    if (arg === "--dir" && next && !next.startsWith("-")) {
      options.directory = next;
      options.projectName = basename(next);
      index += 1;
      continue;
    }

    if (arg === "--deploy" && next && !next.startsWith("-")) {
      options.deployMode = parseDeployMode(next);
      index += 1;
      continue;
    }

    if (arg === "--registry" && next && !next.startsWith("-")) {
      options.packageRegistry = parsePackageRegistry(next);
      index += 1;
      continue;
    }

    if (arg === "--version" && next && !next.startsWith("-")) {
      options.packageVersion = next;
      index += 1;
      continue;
    }

    if (arg === "--allowed-hosts" && next && !next.startsWith("-")) {
      options.allowedHosts = next;
      index += 1;
      continue;
    }

    if (arg === "--allowed-zones" && next && !next.startsWith("-")) {
      options.allowedZones = next;
      index += 1;
      continue;
    }

    if (arg === "--username" && next && !next.startsWith("-")) {
      options.ddnsUsername = next;
      index += 1;
      continue;
    }

    if (
      [
        "--dir",
        "--deploy",
        "--registry",
        "--version",
        "--allowed-hosts",
        "--allowed-zones",
        "--username",
      ].includes(arg)
    ) {
      throw new Error(`Missing value for ${arg}.`);
    }

    if (!arg.startsWith("-")) {
      positionalCount += 1;
      if (positionalCount > 1) {
        throw new Error("Only one target directory can be provided.");
      }
      options.directory = arg;
      options.projectName = basename(arg);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (
    args.includes("--yes") || args.includes("-y") || !Deno.stdin.isTerminal()
  ) {
    return options;
  }

  options.directory = promptText("Directory", options.directory);
  options.projectName = basename(options.directory);
  options.packageRegistry = promptChoice("Package registry", {
    defaultValue: options.packageRegistry,
    choices: ["jsr", "npm"],
  });
  options.deployMode = promptChoice("Deployment mode", {
    defaultValue: options.deployMode,
    choices: ["bunny-git", "github-action"],
  });
  options.ddnsUsername = promptText("DDNS username", options.ddnsUsername);
  options.allowedHosts = promptText(
    "Optional DDNS_ALLOWED_HOSTS",
    options.allowedHosts,
  );
  options.allowedZones = promptText(
    "Optional DDNS_ALLOWED_ZONES",
    options.allowedZones,
  );

  return options;
}

function helpText(): string {
  return `Create a Bunny DDNS Edge Script deployment repository.

Usage:
  deno create jsr:@zimme/create-bunny-ddns -- [directory] [options]
  npm init @zimme/bunny-ddns [directory] -- [options]

Options:
  --dir <path>             Target directory
  --deploy <mode>          bunny-git or github-action
  --registry <registry>    jsr or npm
  --version <range>        Runtime package version range
  --username <name>        Required DDNS Basic Auth username
  --allowed-hosts <list>   Initial DDNS_ALLOWED_HOSTS value
  --allowed-zones <list>   Initial DDNS_ALLOWED_ZONES value
  --no-install             Skip dependency resolution and lockfile creation
  --force                  Write into a non-empty directory
  --dry-run                List files without writing them
  -y, --yes                Accept defaults without prompts
  -h, --help               Show this help
`;
}

function promptText(label: string, defaultValue: string): string {
  const answer = prompt(`${label} (${defaultValue || "empty"}):`);
  return answer?.trim() || defaultValue;
}

function promptChoice<T extends string>(
  label: string,
  options: { defaultValue: T; choices: T[] },
): T {
  const choices = options.choices.join("/");
  const answer = prompt(`${label} [${choices}] (${options.defaultValue}):`)
    ?.trim();
  if (!answer) {
    return options.defaultValue;
  }

  if (!options.choices.includes(answer as T)) {
    throw new Error(`Invalid ${label}: ${answer}`);
  }

  return answer as T;
}

async function promptSecret(label: string): Promise<string> {
  await Deno.stdout.write(new TextEncoder().encode(label));
  Deno.stdin.setRaw(true);
  const bytes: number[] = [];
  const buffer = new Uint8Array(64);
  try {
    while (true) {
      const count = await Deno.stdin.read(buffer);
      if (count === null) {
        break;
      }
      for (const byte of buffer.subarray(0, count)) {
        if (byte === 3) {
          throw new Error("Setup cancelled.");
        }
        if (byte === 4 || byte === 10 || byte === 13) {
          return new TextDecoder().decode(new Uint8Array(bytes)).trim();
        }
        if (byte === 8 || byte === 127) {
          bytes.pop();
          continue;
        }
        if (byte >= 32) {
          bytes.push(byte);
        }
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes)).trim();
  } finally {
    Deno.stdin.setRaw(false);
    await Deno.stdout.write(new Uint8Array([10]));
  }
}

function parseDeployMode(value: string): DeployMode {
  if (value === "bunny-git" || value === "github-action") {
    return value;
  }

  throw new Error(`Invalid deploy mode: ${value}`);
}

function parsePackageRegistry(value: string): PackageRegistry {
  if (value === "jsr" || value === "npm") {
    return value;
  }

  throw new Error(`Invalid registry: ${value}`);
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ??
    "my-bunny-ddns-edge-script";
}
