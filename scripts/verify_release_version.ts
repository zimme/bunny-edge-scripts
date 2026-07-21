import {
  assertManifestVersions,
  assertReleaseVersion,
} from "./release_version.ts";

const tag = Deno.env.get("RELEASE_TAG")?.trim();
if (!tag) {
  throw new Error("RELEASE_TAG is required.");
}
assertReleaseVersion(tag);

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
