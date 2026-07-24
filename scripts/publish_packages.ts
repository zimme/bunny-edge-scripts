import { assertReleaseVersion } from "./release_version.ts";
import { withVerifiedNpmPackages } from "./verify_npm_packages.ts";

const version = Deno.env.get("RELEASE_TAG")?.trim();
if (!version) {
  throw new Error("RELEASE_TAG is required.");
}
assertReleaseVersion(version);

const packages = [
  {
    directory: "packages/bunny-ddns-edge-script",
    name: "@zimme/bunny-ddns-edge-script",
  },
  {
    directory: "packages/create-bunny-ddns",
    name: "@zimme/create-bunny-ddns",
  },
];

const npmPackagesToPublish = new Set<string>();

for (const packageInfo of packages) {
  const jsrVersionUrl =
    `https://jsr.io/${packageInfo.name}/${version}_meta.json`;
  if (await versionExists(jsrVersionUrl)) {
    console.log(`JSR ${packageInfo.name}@${version} already exists; skipping.`);
  } else {
    await run("deno", [
      "publish",
      "--config",
      `${packageInfo.directory}/deno.json`,
    ]);
  }

  const npmVersionUrl = `https://registry.npmjs.org/${
    encodeURIComponent(packageInfo.name)
  }/${version}`;
  if (await versionExists(npmVersionUrl)) {
    console.log(`npm ${packageInfo.name}@${version} already exists; skipping.`);
  } else {
    npmPackagesToPublish.add(packageInfo.name);
  }
}

if (npmPackagesToPublish.size > 0) {
  await withVerifiedNpmPackages(async (artifacts) => {
    for (const artifact of artifacts) {
      if (!npmPackagesToPublish.has(artifact.name)) {
        continue;
      }
      if (artifact.version !== version) {
        throw new Error(
          `${artifact.name} artifact version ${artifact.version} does not match release ${version}.`,
        );
      }
      await run("npm", ["publish", artifact.path]);
    }
  });
}

async function versionExists(url: string): Promise<boolean> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  await response.body?.cancel();
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `Registry version check failed with HTTP ${response.status}: ${url}`,
    );
  }
  return true;
}

async function run(
  command: string,
  args: string[],
  cwd?: string,
): Promise<void> {
  const status = await new Deno.Command(command, {
    args,
    cwd,
    stderr: "inherit",
    stdout: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}
