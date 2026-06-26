const packageDir = Deno.args[0] ?? ".";
const distDir = `${packageDir}/dist`;

async function runDeno(args: string[]) {
  const command = new Deno.Command("deno", {
    args,
    cwd: packageDir,
    stderr: "inherit",
    stdout: "inherit",
  });
  const status = await command.output();
  if (!status.success) {
    throw new Error(`deno ${args.join(" ")} failed`);
  }
}

try {
  await Deno.remove(distDir, { recursive: true });
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) {
    throw error;
  }
}

await Deno.mkdir(distDir, { recursive: true });

const hasTypeScript = await exists(`${packageDir}/src/mod.ts`);

for await (const entry of walk(`${packageDir}/src`)) {
  if (!entry.endsWith(".js") && !entry.endsWith(".d.ts")) {
    continue;
  }

  const relative = entry.slice(`${packageDir}/src/`.length);
  const output = `${distDir}/${relative}`;
  await Deno.mkdir(dirname(output), { recursive: true });
  await Deno.copyFile(entry, output);
}

if (hasTypeScript) {
  await runDeno(["bundle", "src/mod.ts", "-o", "dist/mod.js"]);
  if (await exists(`${packageDir}/src/main.ts`)) {
    await runDeno([
      "bundle",
      "--external",
      "@bunny.net/edgescript-sdk",
      "src/main.ts",
      "-o",
      "dist/main.js",
    ]);
    try {
      await Deno.chmod(`${distDir}/main.js`, 0o755);
    } catch {
      // chmod is not available on every platform Deno supports.
    }
  }
}

await runDeno(["task", "build:types"]);
await runDeno(["fmt", "dist"]);

async function* walk(directory: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walk(path);
      continue;
    }

    if (entry.isFile) {
      yield path;
    }
  }
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "." : path.slice(0, index);
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }

    throw error;
  }
}
