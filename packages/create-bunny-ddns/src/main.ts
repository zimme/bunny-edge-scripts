#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=deno

import {
  defaultOptions,
  type DeployMode,
  type PackageRegistry,
  type ScaffoldOptions,
  scaffoldProject,
} from "./mod.ts";

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

  console.log(nextSteps(options, result.directory));
}

function nextSteps(
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

  return `\nNo credentials were requested or accessed.

Safest setup (recommended):
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

Optional private-terminal provisioning:
  1. End every AI agent session that can observe the terminal.
  2. Open a separate local terminal that is not controlled or recorded by AI.
  3. Generate and save a strong DDNS secret in your password manager.
  4. Run: cd ${directory} && deno task provision
  5. Enter both credentials only into that command's hidden prompts.
  6. Paste only its SAFE AI HANDOFF block into the AI task, then wait for the
     remaining Git integration guidance.

Local checks:
  cd ${directory}
  ${options.installDependencies ? "" : "deno install\n  "}deno task ci

The generated README.md contains the complete deployment and inadyn setup.`;
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
