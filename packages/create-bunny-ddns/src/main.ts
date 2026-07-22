#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run=deno

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

  console.log(`\nNext steps:
  cd ${result.directory}
  ${options.installDependencies ? "" : "deno install\n  "}deno task ci

Then follow README.md to connect the repo to Bunny Edge Scripting.`);
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
