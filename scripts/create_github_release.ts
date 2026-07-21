import {
  ConventionalChangelog,
  type Flags,
  runProgram,
} from "conventional-changelog";
import { assertReleaseVersion } from "./release_version.ts";

const tag = Deno.env.get("RELEASE_TAG")?.trim();
const dryRun = Deno.args.length === 1 && Deno.args[0] === "--dry-run";
if (Deno.args.length > (dryRun ? 1 : 0)) {
  throw new Error("Usage: create_github_release.ts [--dry-run]");
}
if (!tag) {
  throw new Error("RELEASE_TAG is required.");
}
assertReleaseVersion(tag);
if (!dryRun && !Deno.env.get("GH_TOKEN")) {
  throw new Error("GH_TOKEN is required.");
}

const tagCommit = await commandOutput("git", [
  "rev-parse",
  "--verify",
  `refs/tags/${tag}^{commit}`,
]);
const headCommit = await commandOutput("git", ["rev-parse", "HEAD"]);
if (tagCommit !== headCommit) {
  throw new Error(`Release tag ${tag} does not point to HEAD.`);
}

const mergedTags = (await commandOutput("git", [
  "tag",
  "--merged",
  tag,
  "--sort=-version:refname",
])).split("\n").filter(Boolean);
const previousTag = mergedTags.find((candidate) => {
  if (candidate === tag) {
    return false;
  }
  try {
    assertReleaseVersion(candidate);
    return true;
  } catch {
    return false;
  }
});

await Deno.mkdir(".release", { recursive: true });
const notesPath = ".release/RELEASE_NOTES.md";
const changelogPath = ".release/CHANGELOG.md";
await generateChangelog(notesPath, {
  from: previousTag,
  releaseCount: 0,
  to: tag,
});
await generateChangelog(changelogPath, { releaseCount: 0 });

if (dryRun) {
  console.log(`Generated ${notesPath} and ${changelogPath}.`);
  Deno.exit(0);
}

const args = [
  "release",
  "create",
  tag,
  "--verify-tag",
  "--title",
  tag,
  "--notes-file",
  notesPath,
  `${changelogPath}#CHANGELOG.md`,
];
args.push(tag.includes("-") ? "--prerelease" : "--latest");

const status = await new Deno.Command("gh", {
  args,
  stderr: "inherit",
  stdout: "inherit",
}).spawn().status;
if (!status.success) {
  throw new Error("GitHub release creation failed.");
}

async function generateChangelog(
  outputPath: string,
  flags: Flags,
): Promise<void> {
  await runProgram(new ConventionalChangelog(Deno.cwd()), {
    ...flags,
    infile: "",
    outfile: outputPath,
    preset: "conventionalcommits",
  });
  if (!(await Deno.readTextFile(outputPath)).trim()) {
    throw new Error("Conventional Changelog produced empty release notes.");
  }
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const output = await new Deno.Command(command, {
    args,
    stderr: "inherit",
    stdout: "piped",
  }).output();
  if (!output.success) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
  return new TextDecoder().decode(output.stdout).trim();
}
