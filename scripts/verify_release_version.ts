import {
  assertComVerHistory,
  assertManifestVersions,
  assertReleaseVersion,
  compareReleaseVersions,
} from "./release_version.ts";

const tag = Deno.env.get("RELEASE_TAG")?.trim();
if (!tag) {
  throw new Error("RELEASE_TAG is required.");
}
assertReleaseVersion(tag);

const existingTags = (await gitOutput(["tag", "--list"]))
  .split("\n")
  .filter(Boolean)
  .filter((candidate) => candidate !== tag)
  .filter((candidate) => {
    try {
      assertReleaseVersion(candidate);
      return true;
    } catch {
      return false;
    }
  });
if (
  existingTags.some((candidate) => compareReleaseVersions(candidate, tag) >= 0)
) {
  throw new Error(
    `Release tag ${tag} must be newer than every existing release tag.`,
  );
}

await assertComVerHistory(tag, tag, gitOutput);
await assertManifestVersions(tag);

const tagCommit = await gitOutput([
  "rev-parse",
  "--verify",
  `refs/tags/${tag}^{commit}`,
]);
const headCommit = await gitOutput(["rev-parse", "HEAD"]);
if (tagCommit !== headCommit) {
  throw new Error(`Release tag ${tag} must point to the checked-out commit.`);
}
const onMain = await new Deno.Command("git", {
  args: [
    "merge-base",
    "--is-ancestor",
    tagCommit,
    "refs/remotes/origin/main",
  ],
  stderr: "null",
  stdout: "null",
}).output();
if (!onMain.success) {
  throw new Error(`Release tag ${tag} must point to a commit on origin/main.`);
}

if (Deno.env.get("CI") === "true") {
  await assertGitHubVerifiedTag(tag);
}

console.log(`Release tag ${tag} matches the root and all package versions.`);

async function gitOutput(args: string[]): Promise<string> {
  const output = await new Deno.Command("git", {
    args,
    stderr: "inherit",
    stdout: "piped",
  }).output();
  if (!output.success) {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
  return new TextDecoder().decode(output.stdout).trim();
}

async function assertGitHubVerifiedTag(tag: string): Promise<void> {
  const repository = Deno.env.get("GITHUB_REPOSITORY");
  if (!repository || !Deno.env.get("GH_TOKEN")) {
    throw new Error(
      "GITHUB_REPOSITORY and GH_TOKEN are required in release CI.",
    );
  }
  const reference = JSON.parse(
    await commandOutput("gh", [
      "api",
      `repos/${repository}/git/ref/tags/${tag}`,
    ]),
  ) as { object?: { type?: string; sha?: string } };
  if (reference.object?.type !== "tag" || !reference.object.sha) {
    throw new Error(`Release tag ${tag} must be annotated.`);
  }
  const tagObject = JSON.parse(
    await commandOutput("gh", [
      "api",
      `repos/${repository}/git/tags/${reference.object.sha}`,
    ]),
  ) as { verification?: { verified?: boolean; reason?: string } };
  if (tagObject.verification?.verified !== true) {
    throw new Error(
      `Release tag ${tag} must have a GitHub-verified signature (${
        tagObject.verification?.reason ?? "unknown"
      }).`,
    );
  }
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const output = await new Deno.Command(command, {
    args,
    stderr: "inherit",
    stdout: "piped",
  }).output();
  if (!output.success) throw new Error(`${command} ${args.join(" ")} failed.`);
  return new TextDecoder().decode(output.stdout).trim();
}
