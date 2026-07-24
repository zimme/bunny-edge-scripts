import { packageDirectories } from "./release_version.ts";

for (const directory of packageDirectories) {
  const status = await new Deno.Command("npm", {
    args: ["pack", "--dry-run"],
    cwd: directory,
    env: {
      npm_config_cache: `${Deno.cwd()}/.npm-cache`,
    },
    stderr: "inherit",
    stdout: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`npm pack --dry-run failed in ${directory}.`);
  }
}
