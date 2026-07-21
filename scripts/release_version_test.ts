import { assertReleaseVersion } from "./release_version.ts";
import { isReleaseWorkflowTag } from "./pre_push.ts";

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
