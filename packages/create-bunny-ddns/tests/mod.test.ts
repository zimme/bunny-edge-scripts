import { defaultOptions, scaffoldProject } from "../src/mod.ts";

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

  if (!result.files.includes("bunny-sdk.d.ts")) {
    throw new Error("Missing Bunny Edge Script SDK type shim");
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

  const bunnySdkTypes = await Deno.readTextFile(`${directory}/bunny-sdk.d.ts`);
  assertIncludes(bunnySdkTypes, 'declare module "@bunny.net/edgescript-sdk"');
});
