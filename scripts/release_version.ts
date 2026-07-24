export const packageDirectories = [
  "packages/bunny-ddns-edge-script",
  "packages/create-bunny-ddns",
] as const;

export const versionManifestPaths = [
  "package.json",
  ...packageDirectories.flatMap((directory) => [
    `${directory}/deno.json`,
    `${directory}/package.json`,
  ]),
] as const;

export const generatorVersionSource = "packages/create-bunny-ddns/src/mod.ts";
export const exampleImportMapPath = "examples/ddns-edge-script-repo/deno.json";

const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[a-z-][0-9a-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[a-z-][0-9a-z-]*)))*)?$/i;

export function assertReleaseVersion(value: string): void {
  if (!SEMVER_PATTERN.test(value)) {
    throw new Error(
      `Release version must be SemVer without a leading "v" or build metadata: ${value}`,
    );
  }
}

export function compareReleaseVersions(left: string, right: string): number {
  assertReleaseVersion(left);
  assertReleaseVersion(right);
  const [leftCore, leftPre] = left.split("-", 2);
  const [rightCore, rightPre] = right.split("-", 2);
  const leftParts = leftCore.split(".").map(BigInt);
  const rightParts = rightCore.split(".").map(BigInt);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  if (leftPre === undefined || rightPre === undefined) {
    return leftPre === rightPre ? 0 : leftPre === undefined ? 1 : -1;
  }
  const leftIdentifiers = leftPre.split(".");
  const rightIdentifiers = rightPre.split(".");
  const length = Math.max(leftIdentifiers.length, rightIdentifiers.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier
        ? 0
        : leftIdentifier === undefined
        ? -1
        : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftIdentifier) < BigInt(rightIdentifier) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
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

  const generatorSource = await readTextFile(generatorVersionSource);
  if (
    !generatorSource.includes(
      `const DEFAULT_PACKAGE_VERSION = "^${version}";`,
    )
  ) {
    throw new Error(
      `${generatorVersionSource} default package version must equal ^${version}.`,
    );
  }

  const example = JSON.parse(await readTextFile(exampleImportMapPath)) as {
    imports?: Record<string, string>;
  };
  const expectedRuntimeImport = `jsr:@zimme/bunny-ddns-edge-script@^${version}`;
  if (
    example.imports?.["@zimme/bunny-ddns-edge-script"] !==
      expectedRuntimeImport
  ) {
    throw new Error(
      `${exampleImportMapPath} runtime import must equal ${expectedRuntimeImport}.`,
    );
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

  const source = await Deno.readTextFile(generatorVersionSource);
  const nextSource = source.replace(
    /const DEFAULT_PACKAGE_VERSION = "\^[^"]+";/,
    `const DEFAULT_PACKAGE_VERSION = "^${version}";`,
  );
  if (nextSource === source) {
    throw new Error(
      `${generatorVersionSource} does not contain DEFAULT_PACKAGE_VERSION.`,
    );
  }
  await Deno.writeTextFile(generatorVersionSource, nextSource);

  const example = JSON.parse(
    await Deno.readTextFile(exampleImportMapPath),
  ) as {
    imports: Record<string, string>;
  };
  example.imports["@zimme/bunny-ddns-edge-script"] =
    `jsr:@zimme/bunny-ddns-edge-script@^${version}`;
  await Deno.writeTextFile(
    exampleImportMapPath,
    `${JSON.stringify(example, null, 2)}\n`,
  );
}
