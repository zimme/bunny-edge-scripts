#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

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

  console.log(`\nNext steps:
  cd ${result.directory}
  deno install
  deno task ci

Then follow README.md to connect the repo to Bunny Edge Scripting.`);
}

function optionsFromArgs(args: string[]): ScaffoldOptions {
  const options = defaultOptions();

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

    if (arg === "--dir" && next) {
      options.directory = next;
      options.projectName = basename(next);
      index += 1;
      continue;
    }

    if (arg === "--deploy" && next) {
      options.deployMode = parseDeployMode(next);
      index += 1;
      continue;
    }

    if (arg === "--registry" && next) {
      options.packageRegistry = parsePackageRegistry(next);
      index += 1;
      continue;
    }

    if (arg === "--version" && next) {
      options.packageVersion = next;
      index += 1;
      continue;
    }

    if (arg === "--allowed-hosts" && next) {
      options.allowedHosts = next;
      index += 1;
      continue;
    }

    if (arg === "--allowed-zones" && next) {
      options.allowedZones = next;
      index += 1;
      continue;
    }

    if (arg === "--username" && next) {
      options.ddnsUsername = next;
      index += 1;
      continue;
    }

    if (!arg.startsWith("-")) {
      options.directory = arg;
      options.projectName = basename(arg);
    }
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
