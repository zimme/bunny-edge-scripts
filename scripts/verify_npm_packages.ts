interface PackFile {
  mode: number;
  path: string;
}

interface PackArtifact {
  filename: string;
  files: PackFile[];
  name: string;
  version: string;
}

export interface PackageExpectation {
  executablePaths?: string[];
  files: string[];
  name: string;
}

export interface VerifiedNpmPackage {
  name: string;
  path: string;
  version: string;
}

const packageExpectations: Array<{
  directory: string;
  expectation: PackageExpectation;
}> = [
  {
    directory: "packages/bunny-ddns-edge-script",
    expectation: {
      name: "@zimme/bunny-ddns-edge-script",
      files: [
        ".env.example",
        "LICENSE",
        "README.md",
        "dist/app.d.ts",
        "dist/app.js",
        "dist/mod.d.ts",
        "dist/mod.js",
        "package.json",
      ],
    },
  },
  {
    directory: "packages/create-bunny-ddns",
    expectation: {
      name: "@zimme/create-bunny-ddns",
      files: [
        "LICENSE",
        "README.md",
        "dist/main.d.ts",
        "dist/main.js",
        "dist/mod.d.ts",
        "dist/mod.js",
        "dist/provision.d.ts",
        "dist/provision.js",
        "package.json",
      ],
      executablePaths: ["dist/main.js"],
    },
  },
];

if (import.meta.main) {
  await verifyNpmPackages();
}

export async function verifyNpmPackages(): Promise<void> {
  await withVerifiedNpmPackages(() => Promise.resolve());
}

export async function withVerifiedNpmPackages<T>(
  operation: (packages: VerifiedNpmPackage[]) => Promise<T>,
): Promise<T> {
  const temporaryDirectory = await createTemporaryDirectory();
  const packages: VerifiedNpmPackage[] = [];

  try {
    for (const { directory, expectation } of packageExpectations) {
      const output = await runNpm([
        "--silent",
        "pack",
        "--json",
        "--pack-destination",
        temporaryDirectory,
      ], { cwd: directory, captureOutput: true });
      const artifact = parsePackOutput(output);
      assertPackageArtifact(artifact, expectation);
      packages.push({
        name: artifact.name,
        path: `${temporaryDirectory}/${artifact.filename}`,
        version: artifact.version,
      });
      console.log(
        `Verified npm artifact ${artifact.name}@${artifact.version} ` +
          `(${artifact.files.length} files).`,
      );
    }

    const consumerDirectory = `${temporaryDirectory}/consumer`;
    await runNpm([
      "--silent",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--prefix",
      consumerDirectory,
      ...packages.map((packageInfo) => packageInfo.path),
    ]);

    await runInConsumer(consumerDirectory, [
      "node",
      "--input-type=module",
      "--eval",
      [
        'const runtime = await import("@zimme/bunny-ddns-edge-script");',
        'if (typeof runtime.createBunnyDdnsHandler !== "function")',
        '  throw new Error("Missing createBunnyDdnsHandler export");',
        'if (typeof runtime.readBunnyDdnsConfigFromEnv !== "function")',
        '  throw new Error("Missing readBunnyDdnsConfigFromEnv export");',
      ].join("\n"),
    ]);

    const dryRunDirectory = `${temporaryDirectory}/generator-dry-run`;
    await runInConsumer(consumerDirectory, [
      "create-bunny-ddns",
      "--dry-run",
      "--yes",
      "--dir",
      dryRunDirectory,
    ]);
    await runNode([
      "--eval",
      [
        'const fs = require("node:fs");',
        "if (fs.existsSync(process.argv[1])) {",
        '  throw new Error("Generator dry run wrote to the filesystem.");',
        "}",
      ].join("\n"),
      dryRunDirectory,
    ]);

    console.log("Isolated npm package installation and smoke checks passed.");
    return await operation(packages);
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

export function parsePackOutput(output: string): PackArtifact {
  const start = output.lastIndexOf("\n[");
  const json = start >= 0
    ? output.slice(start + 1)
    : output.trimStart().startsWith("[")
    ? output.trimStart()
    : "";
  if (!json) {
    throw new Error("npm pack did not produce a JSON artifact manifest.");
  }

  const artifacts = JSON.parse(json) as unknown;
  if (!Array.isArray(artifacts) || artifacts.length !== 1) {
    throw new Error("npm pack must produce exactly one artifact.");
  }
  const artifact = artifacts[0] as Partial<PackArtifact>;
  if (
    typeof artifact.filename !== "string" ||
    !Array.isArray(artifact.files) ||
    typeof artifact.name !== "string" ||
    typeof artifact.version !== "string"
  ) {
    throw new Error("npm pack produced an invalid artifact manifest.");
  }
  return artifact as PackArtifact;
}

export function assertPackageArtifact(
  artifact: PackArtifact,
  expectation: PackageExpectation,
): void {
  if (artifact.name !== expectation.name) {
    throw new Error(
      `Expected npm package ${expectation.name}, received ${artifact.name}.`,
    );
  }
  if (
    artifact.filename.includes("/") || artifact.filename.includes("\\") ||
    !artifact.filename.endsWith(".tgz")
  ) {
    throw new Error(`Unsafe npm artifact filename: ${artifact.filename}`);
  }

  const actualFiles = artifact.files.map((file) => file.path).sort();
  const expectedFiles = [...expectation.files].sort();
  if (actualFiles.join("\n") !== expectedFiles.join("\n")) {
    throw new Error(
      `${artifact.name} npm artifact contents differ from the allowlist.\n` +
        `Expected:\n${expectedFiles.join("\n")}\n` +
        `Actual:\n${actualFiles.join("\n")}`,
    );
  }

  for (const path of expectation.executablePaths ?? []) {
    const file = artifact.files.find((candidate) => candidate.path === path);
    if (!file || (file.mode & 0o111) === 0) {
      throw new Error(`${artifact.name} must publish executable ${path}.`);
    }
  }
}

async function createTemporaryDirectory(): Promise<string> {
  return (await runNode([
    "--eval",
    [
      'const fs = require("node:fs");',
      'const os = require("node:os");',
      'const path = require("node:path");',
      'process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(), "bunny-npm-")));',
    ].join("\n"),
  ], true)).trim();
}

async function removeTemporaryDirectory(path: string): Promise<void> {
  await runNode([
    "--eval",
    'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })',
    path,
  ]);
}

async function runInConsumer(
  consumerDirectory: string,
  command: string[],
): Promise<void> {
  await runNpm([
    "exec",
    "--offline",
    "--",
    ...command,
  ], { cwd: consumerDirectory });
}

async function runNode(
  args: string[],
  captureOutput = false,
): Promise<string> {
  return await runNpm([
    "--silent",
    "exec",
    "--offline",
    "--",
    "node",
    ...args,
  ], { captureOutput });
}

async function runNpm(
  args: string[],
  options: { captureOutput?: boolean; cwd?: string } = {},
): Promise<string> {
  const output = await new Deno.Command("npm", {
    args,
    cwd: options.cwd,
    env: {
      npm_config_cache: `${Deno.cwd()}/.npm-cache`,
    },
    stderr: "inherit",
    stdout: options.captureOutput ? "piped" : "inherit",
  }).output();
  if (!output.success) {
    throw new Error(`npm ${args.join(" ")} failed.`);
  }
  return options.captureOutput ? new TextDecoder().decode(output.stdout) : "";
}
