import {
  assertComVerHistory,
  assertManifestVersions,
  assertReleaseVersion,
} from "./release_version.ts";

type RefUpdate = [
  localRef: string,
  localOid: string,
  remoteRef: string,
  remoteOid: string,
];

export function isReleaseWorkflowTag(tag: string): boolean {
  return !tag.includes("/") && tag.split(".").length >= 3;
}

if (import.meta.main) {
  const updates = parseRefUpdates(
    await new Response(Deno.stdin.readable).text(),
  );
  const remoteName = Deno.args[0] ?? "origin";
  await verifyPushedCommitMessages(updates, remoteName);
  await verifyPushedReleaseTags(updates, remoteName);
}

export function parseRefUpdates(input: string): RefUpdate[] {
  return input.trim().split("\n").filter(Boolean).map((line) => {
    const fields = line.split(" ");
    if (fields.length !== 4) {
      throw new Error(`Malformed pre-push ref update: ${line}`);
    }
    return fields as RefUpdate;
  });
}

async function verifyPushedCommitMessages(
  updates: RefUpdate[],
  remoteName: string,
): Promise<void> {
  for (const [localRef, localOid, , remoteOid] of updates) {
    if (!localRef.startsWith("refs/heads/") || isZeroOid(localOid)) {
      continue;
    }
    const from = isZeroOid(remoteOid)
      ? await gitOutput([
        "merge-base",
        localOid,
        `refs/remotes/${remoteName}/main`,
      ])
      : remoteOid;
    await runDeno([
      "run",
      "-A",
      "npm:@commitlint/cli@21.2.1",
      "--from",
      from,
      "--to",
      localOid,
      "--verbose",
    ]);
  }
}

async function verifyPushedReleaseTags(
  updates: RefUpdate[],
  remoteName: string,
): Promise<void> {
  const releaseUpdates = updates.filter(([localRef, localOid]) => {
    const tag = localRef.startsWith("refs/tags/")
      ? localRef.slice("refs/tags/".length)
      : "";
    return !isZeroOid(localOid) && isReleaseWorkflowTag(tag);
  });
  if (releaseUpdates.length === 0) {
    return;
  }

  const pushedMain = updates.find((update) =>
    update[3] === "refs/heads/main" && !isZeroOid(update[1])
  )?.[1];
  const remoteMain = pushedMain ?? await gitOutput([
    "rev-parse",
    "--verify",
    `refs/remotes/${remoteName}/main`,
  ]);

  for (const [localRef] of releaseUpdates) {
    const tag = localRef.slice("refs/tags/".length);
    if (!isReleaseWorkflowTag(tag)) {
      continue;
    }
    assertReleaseVersion(tag);

    if (await gitOutput(["cat-file", "-t", localRef]) !== "tag") {
      throw new Error(`Release tag ${tag} must be signed and annotated.`);
    }
    await runGit(["verify-tag", localRef]);

    const commit = await gitOutput(["rev-parse", `${localRef}^{commit}`]);
    if (
      !await gitSucceeds(["merge-base", "--is-ancestor", commit, remoteMain])
    ) {
      throw new Error(
        `Release tag ${tag} must point to a commit already on the pushed main branch.`,
      );
    }
    await assertComVerHistory(tag, commit, gitOutput);
    await assertManifestVersions(
      tag,
      (path) => gitOutput(["show", `${commit}:${path}`]),
    );
  }
}

function isZeroOid(value: string): boolean {
  return /^0+$/.test(value);
}

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

async function gitSucceeds(args: string[]): Promise<boolean> {
  return (await new Deno.Command("git", {
    args,
    stderr: "null",
    stdout: "null",
  }).output()).success;
}

async function runGit(args: string[]): Promise<void> {
  const status = await new Deno.Command("git", {
    args,
    stderr: "inherit",
    stdout: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
}

async function runDeno(args: string[]): Promise<void> {
  const status = await new Deno.Command(Deno.execPath(), {
    args,
    stderr: "inherit",
    stdout: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`deno ${args.join(" ")} failed.`);
  }
}
