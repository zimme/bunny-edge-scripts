const tag = Deno.env.get("RELEASE_TAG")?.trim();
if (!tag) {
  throw new Error("RELEASE_TAG is required.");
}

const expectedVersion = tag.startsWith("v") ? tag.slice(1) : tag;
const packageDirectories = [
  "packages/bunny-ddns-edge-script",
  "packages/bunny-tunnel-edge-script",
  "packages/create-bunny-ddns",
];

for (const directory of packageDirectories) {
  const denoConfig = JSON.parse(
    await Deno.readTextFile(`${directory}/deno.json`),
  ) as { version?: string };
  const npmPackage = JSON.parse(
    await Deno.readTextFile(`${directory}/package.json`),
  ) as { version?: string };

  if (
    denoConfig.version !== expectedVersion ||
    npmPackage.version !== expectedVersion
  ) {
    throw new Error(
      `${directory} versions must both equal release tag ${expectedVersion}.`,
    );
  }
}

console.log(`Release tag ${tag} matches all package versions.`);
