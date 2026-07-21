const insideWorktree = await new Deno.Command("git", {
  args: ["rev-parse", "--is-inside-work-tree"],
  stderr: "null",
  stdout: "piped",
}).output();

if (!insideWorktree.success) {
  console.log("Skipping Git hook installation outside a worktree.");
  Deno.exit(0);
}

const status = await new Deno.Command("git", {
  args: ["config", "--local", "core.hooksPath", ".githooks"],
  stderr: "inherit",
  stdout: "inherit",
}).spawn().status;
if (!status.success) {
  throw new Error("Failed to configure the repository Git hooks path.");
}

console.log("Configured tracked Git hooks from .githooks/.");
