import {
  assertPackageArtifact,
  type PackageExpectation,
  parsePackOutput,
} from "./verify_npm_packages.ts";

const expectation: PackageExpectation = {
  name: "@zimme/example",
  files: ["LICENSE", "dist/main.js", "package.json"],
  executablePaths: ["dist/main.js"],
};

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    filename: "zimme-example-1.0.0.tgz",
    files: [
      { path: "LICENSE", mode: 0o644 },
      { path: "dist/main.js", mode: 0o755 },
      { path: "package.json", mode: 0o644 },
    ],
    name: "@zimme/example",
    version: "1.0.0",
    ...overrides,
  };
}

Deno.test("parses a single npm pack manifest after lifecycle output", () => {
  const parsed = parsePackOutput(
    `build output\n${JSON.stringify([artifact()])}\n`,
  );
  if (
    parsed.name !== "@zimme/example" ||
    parsed.filename !== "zimme-example-1.0.0.tgz"
  ) {
    throw new Error("Expected npm pack metadata to be retained.");
  }
});

Deno.test("accepts exactly allowlisted npm artifact contents", () => {
  assertPackageArtifact(artifact(), expectation);
});

Deno.test("rejects unexpected npm artifact contents", () => {
  assertThrows(() =>
    assertPackageArtifact(
      artifact({
        files: [
          ...artifact().files,
          { path: "secret.env", mode: 0o644 },
        ],
      }),
      expectation,
    )
  );
});

Deno.test("rejects a non-executable npm bin", () => {
  assertThrows(() =>
    assertPackageArtifact(
      artifact({
        files: [
          { path: "LICENSE", mode: 0o644 },
          { path: "dist/main.js", mode: 0o644 },
          { path: "package.json", mode: 0o644 },
        ],
      }),
      expectation,
    )
  );
});

Deno.test("rejects unsafe npm artifact filenames", () => {
  assertThrows(() =>
    assertPackageArtifact(
      artifact({ filename: "../zimme-example-1.0.0.tgz" }),
      expectation,
    )
  );
});

function assertThrows(callback: () => void): void {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error("Expected callback to throw.");
}
