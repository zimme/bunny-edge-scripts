import {
  assertManifestVersions,
  assertReleaseVersion,
} from "./release_version.ts";

const version = Deno.args[0]?.trim();
if (!version || Deno.args.length !== 1) {
  throw new Error("Usage: deno task release:tag <version>");
}
assertReleaseVersion(version);

if (await gitOutput(["status", "--porcelain"])) {
  throw new Error("Tag creation requires a clean worktree.");
}
if (await gitOutput(["branch", "--show-current"]) !== "main") {
  throw new Error("Release tags must be created from main.");
}

const head = await gitOutput(["rev-parse", "HEAD"]);
const upstreamMain = await gitOutput([
  "rev-parse",
  "--verify",
  "refs/remotes/origin/main",
]);
if (head !== upstreamMain) {
  throw new Error(
    "main must match origin/main. Fetch after merging the release commit, then try again.",
  );
}
if (await gitOutput(["tag", "--list", version])) {
  throw new Error(`Tag ${version} already exists.`);
}

await assertManifestVersions(version);
await runGit(["tag", "-s", version, "-m", `Release ${version}`]);
console.log(
  `Created signed release tag ${version}. Push it explicitly when ready.`,
);

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

async function runGit(args: string[]): Promise<void> {
  const status = await new Deno.Command("git", {
    args,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
}
