import {
  assertReleaseVersion,
  setManifestVersions,
} from "./release_version.ts";

const version = Deno.args[0]?.trim();
if (!version || Deno.args.length !== 1) {
  throw new Error("Usage: deno task release:prepare <version>");
}
assertReleaseVersion(version);

if (await gitOutput(["status", "--porcelain"])) {
  throw new Error("Release preparation requires a clean worktree.");
}
if (await gitOutput(["tag", "--list", version])) {
  throw new Error(`Tag ${version} already exists.`);
}

await setManifestVersions(version);
console.log(`Set all package versions to ${version}. Running validation...`);

const validation = await new Deno.Command("deno", {
  args: ["task", "validate"],
  stderr: "inherit",
  stdin: "inherit",
  stdout: "inherit",
}).spawn().status;
if (!validation.success) {
  throw new Error(
    "Validation failed. Fix the issue before committing the release versions.",
  );
}

console.log(
  `Release ${version} is prepared. Commit these changes and merge them into main before creating the tag.`,
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
