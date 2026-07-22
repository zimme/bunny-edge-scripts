import { defaultOptions, scaffoldProject } from "../src/mod.ts";
import { main } from "../src/main.ts";

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${expected}`);
  }
}

Deno.test("dry-run scaffold returns expected Bunny Git files", async () => {
  const result = await scaffoldProject({
    ...defaultOptions(),
    dryRun: true,
  });

  if (!result.files.includes("deno.json")) {
    throw new Error("Missing deno.json");
  }
  for (const file of ["LICENSE", ".tool-versions", ".env.example"]) {
    if (!result.files.includes(file)) {
      throw new Error(`Missing ${file}`);
    }
  }

  if (result.files.includes(".github/workflows/deploy.yml")) {
    throw new Error("Bunny Git mode should not include GitHub deploy workflow");
  }
});

Deno.test("scaffold writes a GitHub Action workflow when requested", async () => {
  const directory = await Deno.makeTempDir();
  const result = await scaffoldProject({
    ...defaultOptions(),
    directory,
    deployMode: "github-action",
  });

  if (!result.files.includes(".github/workflows/deploy.yml")) {
    throw new Error("Missing deploy workflow");
  }

  const readme = await Deno.readTextFile(`${directory}/README.md`);
  assertIncludes(readme, "GitHub Action Upload");

  const denoJson = await Deno.readTextFile(`${directory}/deno.json`);
  assertIncludes(denoJson, "jsr:@zimme/bunny-ddns-edge-script@^1.0.0");
  assertIncludes(denoJson, "npm:@bunny.net/edgescript-sdk@0.12.1");

  const gitignore = await Deno.readTextFile(`${directory}/.gitignore`);
  assertIncludes(gitignore, ".bunny/");

  const workflow = await Deno.readTextFile(
    `${directory}/.github/workflows/deploy.yml`,
  );
  assertIncludes(workflow, "deno install --frozen");
  assertIncludes(workflow, "deno-version: 2.9.3");
  assertIncludes(workflow, "script_id: ${{ secrets.SCRIPT_ID }}");
  if (workflow.includes("env:\n      SCRIPT_ID")) {
    throw new Error(
      "Deployment secrets must not be job-level environment variables",
    );
  }

  const envExample = await Deno.readTextFile(`${directory}/.env.example`);
  assertIncludes(envExample, "DDNS_ALLOW_ALL_HOSTS=true");
});

Deno.test("force mode refuses to overwrite through a symlink", async () => {
  const parent = await Deno.makeTempDir();
  const directory = `${parent}/project`;
  const externalFile = `${parent}/outside.md`;
  await Deno.mkdir(directory);
  await Deno.writeTextFile(externalFile, "unchanged\n");
  await Deno.symlink(externalFile, `${directory}/README.md`);

  let failed = false;
  try {
    await scaffoldProject({
      ...defaultOptions(),
      directory,
      force: true,
    });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("symlink");
  }

  if (!failed) {
    throw new Error("Expected a symlinked output to be rejected");
  }
  if (await Deno.readTextFile(externalFile) !== "unchanged\n") {
    throw new Error("Scaffold modified a file outside its target directory");
  }
});

Deno.test("CLI rejects unknown options", async () => {
  let failed = false;
  try {
    await main(["--dry-run", "--unknown"]);
  } catch (error) {
    failed = error instanceof Error && error.message.includes("Unknown option");
  }

  if (!failed) {
    throw new Error("Expected unknown CLI option to fail");
  }
});
