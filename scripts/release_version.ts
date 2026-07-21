export const packageDirectories = [
  "packages/bunny-ddns-edge-script",
  "packages/bunny-tunnel-edge-script",
  "packages/create-bunny-ddns",
] as const;

export const versionManifestPaths = [
  "package.json",
  ...packageDirectories.flatMap((directory) => [
    `${directory}/deno.json`,
    `${directory}/package.json`,
  ]),
] as const;

const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[a-z-][0-9a-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[a-z-][0-9a-z-]*)))*)?$/i;

export function assertReleaseVersion(value: string): void {
  if (!SEMVER_PATTERN.test(value)) {
    throw new Error(
      `Release version must be SemVer without a leading "v" or build metadata: ${value}`,
    );
  }
}

export async function assertManifestVersions(
  version: string,
  readTextFile: (path: string) => Promise<string> = Deno.readTextFile,
): Promise<void> {
  for (const manifest of versionManifestPaths) {
    const value = JSON.parse(await readTextFile(manifest)) as {
      version?: string;
    };
    if (value.version !== version) {
      throw new Error(`${manifest} version must equal release tag ${version}.`);
    }
  }
}

export async function setManifestVersions(version: string): Promise<void> {
  for (const manifest of versionManifestPaths) {
    const value = JSON.parse(await Deno.readTextFile(manifest)) as Record<
      string,
      unknown
    >;
    value.version = version;
    await Deno.writeTextFile(manifest, `${JSON.stringify(value, null, 2)}\n`);
  }
}
