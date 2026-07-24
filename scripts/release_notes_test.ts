import { ConventionalChangelog } from "conventional-changelog";
import createConventionalCommitsPreset from "conventional-changelog-conventionalcommits";
import {
  curateReleaseCommit,
  curateReleaseWriterTransform,
  type ReleaseCommit,
} from "./release_notes.ts";

const TUNNEL_FEATURE_COMMIT = "ae87b1fc9bf3c81d1afded0b938a59c5a296655e";
const RELEASE_AND_TUNNEL_SECURITY_COMMIT =
  "01c5f0370159f5e5ed32bd5b351350efe0d4c31d";
const MIXED_RUNTIME_SECURITY_COMMIT =
  "e4913aee4b1b4249f6ad5022a5c2397689655b31";
const DDNS_BREAKING_CHANGE =
  "DDNS RuntimeConfig now requires allowAllHosts.\n" +
  "Unscoped DDNS environments must set DDNS_ALLOW_ALL_HOSTS=true explicitly.";
const TUNNEL_BREAKING_CHANGE = "The tunnel body limit is now capped at 10 MiB.";

Deno.test("passes unrelated release commits through unchanged", () => {
  const commit = {
    hash: "1111111111111111111111111111111111111111",
    subject: "add a future edge script",
    notes: [],
  };

  if (curateReleaseCommit(commit) !== commit) {
    throw new Error("Expected an unrelated commit to retain its identity.");
  }
});

Deno.test("curates only the known historical tunnel changes", () => {
  if (
    curateReleaseCommit({
      hash: TUNNEL_FEATURE_COMMIT,
      subject: "add Bunny tunnel edge script",
    }) !== null
  ) {
    throw new Error("Expected the removed tunnel feature to be omitted.");
  }

  const releaseCommit = curateReleaseCommit<ReleaseCommit>({
    hash: RELEASE_AND_TUNNEL_SECURITY_COMMIT,
    subject: "harden release and tunnel security",
  });
  if (releaseCommit?.subject !== "harden release security") {
    throw new Error("Expected the relevant release work to remain.");
  }

  const runtimeCommit = curateReleaseCommit<ReleaseCommit>({
    hash: MIXED_RUNTIME_SECURITY_COMMIT,
    subject: "harden edge runtime trust boundaries",
    body: `${DDNS_BREAKING_CHANGE}\n${TUNNEL_BREAKING_CHANGE}`,
    footer: `${DDNS_BREAKING_CHANGE}\n${TUNNEL_BREAKING_CHANGE}`,
    notes: [{
      title: "BREAKING CHANGE",
      text: `${DDNS_BREAKING_CHANGE}\n${TUNNEL_BREAKING_CHANGE}`,
    }],
  });
  const serialized = JSON.stringify(runtimeCommit);
  assertIncludes(serialized, "DDNS RuntimeConfig now requires allowAllHosts");
  assertExcludes(serialized, TUNNEL_BREAKING_CHANGE);
});

Deno.test("renders accurate initial release history", async () => {
  const rootCommit = await commandOutput("git", [
    "rev-list",
    "--max-parents=0",
    "HEAD",
  ]);
  const preset = await createConventionalCommitsPreset() as {
    writer: {
      transform: (
        commit: ReleaseCommit,
        context: unknown,
      ) => unknown;
    };
  };
  preset.writer.transform = curateReleaseWriterTransform(
    preset.writer.transform,
  );
  const generator = new ConventionalChangelog(Deno.cwd())
    .config(
      preset as Parameters<ConventionalChangelog["config"]>[0],
    )
    .options({
      releaseCount: 0,
    })
    .readPackage()
    .readRepository()
    .commits({ from: rootCommit, to: "HEAD" });

  let changelog = "";
  for await (const chunk of generator.write()) {
    changelog += chunk;
  }

  assertExcludes(changelog, "add Bunny tunnel edge script");
  assertExcludes(changelog, "harden release and tunnel security");
  assertExcludes(changelog, TUNNEL_BREAKING_CHANGE);
  assertIncludes(changelog, "harden release security");
  assertIncludes(changelog, "DDNS RuntimeConfig now requires allowAllHosts");
});

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include: ${expected}`);
  }
}

function assertExcludes(actual: string, expected: string): void {
  if (actual.includes(expected)) {
    throw new Error(`Expected output to exclude: ${expected}`);
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
