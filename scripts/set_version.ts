import {
  assertReleaseVersion,
  setManifestVersions,
} from "./release_version.ts";

const version = Deno.args[0]?.trim();
if (!version || Deno.args.length !== 1) {
  throw new Error("Usage: npm run version:set -- <version>");
}
assertReleaseVersion(version);

await setManifestVersions(version);

console.log(`Set the root and all package versions to ${version}.`);
