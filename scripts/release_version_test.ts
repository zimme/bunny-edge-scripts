import {
  assertManifestVersions,
  assertReleaseVersion,
  compareReleaseVersions,
  exampleImportMapPath,
  generatorVersionSource,
  versionManifestPaths,
} from "./release_version.ts";
import { isReleaseWorkflowTag, parseRefUpdates } from "./pre_push.ts";

function assertAccepted(version: string): void {
  assertReleaseVersion(version);
}

function assertRejected(version: string): void {
  try {
    assertReleaseVersion(version);
  } catch {
    return;
  }
  throw new Error(`Expected ${version} to be rejected.`);
}

Deno.test("accepts registry-safe release versions", () => {
  for (const version of ["0.0.0", "1.0.0", "2.3.4-rc.1", "10.20.30-beta.2"]) {
    assertAccepted(version);
  }
});

Deno.test("rejects ambiguous or non-canonical release tags", () => {
  for (
    const version of [
      "v1.0.0",
      "01.0.0",
      "1.0",
      "1.0.0-01",
      "1.0.0+build.1",
      "1.0.0/other",
    ]
  ) {
    assertRejected(version);
  }
});

Deno.test("identifies tags that can trigger the release workflow", () => {
  for (const tag of ["1.0.0", "1.0.0-rc.1", "v1.0.0", "one.two.three"]) {
    if (!isReleaseWorkflowTag(tag)) {
      throw new Error(`Expected ${tag} to be treated as a release tag.`);
    }
  }
  for (const tag of ["latest", "release/1.0.0", "1.0"]) {
    if (isReleaseWorkflowTag(tag)) {
      throw new Error(`Expected ${tag} not to be treated as a release tag.`);
    }
  }
});

Deno.test("parses pre-push ref updates", () => {
  const updates = parseRefUpdates(
    "refs/heads/main local refs/heads/main remote\n" +
      "refs/tags/1.0.0 tag refs/tags/1.0.0 zero\n",
  );
  if (
    updates.length !== 2 ||
    updates[0][0] !== "refs/heads/main" ||
    updates[1][1] !== "tag"
  ) {
    throw new Error("Expected pre-push ref updates to retain all fields.");
  }
});

Deno.test("rejects malformed pre-push ref updates", () => {
  try {
    parseRefUpdates("refs/heads/main missing-fields");
  } catch {
    return;
  }
  throw new Error("Expected malformed pre-push input to be rejected.");
});

Deno.test("orders stable and prerelease versions using SemVer precedence", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "2.0.0",
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareReleaseVersions(ordered[index - 1], ordered[index]) >= 0) {
      throw new Error("Expected release versions to be strictly increasing.");
    }
  }
  if (compareReleaseVersions("1.0.0", "1.0.0") !== 0) {
    throw new Error("Expected identical versions to compare equally.");
  }
});

Deno.test("release manifests include the generator's scaffold version", async () => {
  const files = new Map<string, string>(
    versionManifestPaths.map((path) => [
      path,
      JSON.stringify({ version: "1.2.3" }),
    ]),
  );
  files.set(
    generatorVersionSource,
    'const DEFAULT_PACKAGE_VERSION = "^1.2.3";',
  );
  files.set(
    exampleImportMapPath,
    JSON.stringify({
      imports: {
        "@zimme/bunny-ddns-edge-script":
          "jsr:@zimme/bunny-ddns-edge-script@^1.2.3",
      },
    }),
  );

  await assertManifestVersions("1.2.3", (path) => {
    const value = files.get(path);
    if (value === undefined) {
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    }
    return Promise.resolve(value);
  });

  files.set(
    generatorVersionSource,
    'const DEFAULT_PACKAGE_VERSION = "^1.0.0";',
  );
  try {
    await assertManifestVersions(
      "1.2.3",
      (path) => Promise.resolve(files.get(path) ?? ""),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("default package version")
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Expected a stale scaffold package version to be rejected.");
});

Deno.test("release manifests reject a stale checked example import", async () => {
  const files = new Map<string, string>(
    versionManifestPaths.map((path) => [
      path,
      JSON.stringify({ version: "1.2.3" }),
    ]),
  );
  files.set(
    generatorVersionSource,
    'const DEFAULT_PACKAGE_VERSION = "^1.2.3";',
  );
  files.set(
    exampleImportMapPath,
    JSON.stringify({
      imports: {
        "@zimme/bunny-ddns-edge-script":
          "jsr:@zimme/bunny-ddns-edge-script@^1.0.0",
      },
    }),
  );

  try {
    await assertManifestVersions(
      "1.2.3",
      (path) => Promise.resolve(files.get(path) ?? ""),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("runtime import")
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Expected a stale example runtime import to be rejected.");
});
