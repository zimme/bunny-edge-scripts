const expected = await readExpectedVersions(".tool-versions");

await verify("deno", Deno.version.deno, expected.deno);
await verify(
  "node",
  await commandVersion("node", ["--version"]),
  expected.nodejs,
);
await verify("npm", await commandVersion("npm", ["--version"]), expected.npm);
await verify("gh", await commandVersion("gh", ["--version"]), expected.gh);
await verify(
  "copilot",
  await commandVersion("copilot", ["--version"]),
  expected.copilot,
);

console.log("Toolchain matches .tool-versions.");

async function readExpectedVersions(path: string) {
  const versions: Record<string, string> = {};
  for (const line of (await Deno.readTextFile(path)).split("\n")) {
    const [name, version, extra] = line.trim().split(/\s+/);
    if (!name) continue;
    if (!version || extra) {
      throw new Error(`Invalid tool version line: ${line}`);
    }
    versions[name] = version;
  }

  for (const name of ["deno", "nodejs", "npm", "gh", "copilot"]) {
    if (!versions[name]) throw new Error(`Missing ${name} in ${path}`);
  }
  return versions;
}

async function commandVersion(command: string, args: string[]) {
  const output = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }

  const text = new TextDecoder().decode(output.stdout).trim();
  const match = text.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!match) {
    throw new Error(`Could not parse ${command} version from: ${text}`);
  }
  return match[1];
}

function verify(name: string, actual: string, wanted: string) {
  if (actual !== wanted) {
    throw new Error(`${name} ${actual} is installed; expected ${wanted}`);
  }
}
