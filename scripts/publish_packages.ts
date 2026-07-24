import { assertReleaseVersion } from "./release_version.ts";

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
    directory: "packages/bunny-tunnel-edge-script",
    name: "@zimme/bunny-tunnel-edge-script",
  },
  {
    directory: "packages/create-bunny-ddns",
    name: "@zimme/create-bunny-ddns",
  },
];

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
    await run("npm", ["publish"], packageInfo.directory);
  }
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
