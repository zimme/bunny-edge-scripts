import { parse } from "yaml";

const expectedSkills = [
  "change-bunny-dns-api",
  "change-ddns-behavior",
  "change-deployment",
  "change-security-configuration",
  "change-tunnel-runtime",
  "setup-bunny-ddns",
];

const imports = new Map([
  ["CLAUDE.md", "@AGENTS.md"],
  ["GEMINI.md", "@./AGENTS.md"],
]);

for (const [path, expected] of imports) {
  const actual = (await Deno.readTextFile(path)).trim();
  if (actual !== expected) {
    throw new Error(`${path} must contain only ${expected}`);
  }
}

const copilotInstructions = await Deno.readTextFile(
  ".github/copilot-instructions.md",
);
if (!copilotInstructions.includes("`AGENTS.md`")) {
  throw new Error("Copilot instructions must identify AGENTS.md as canonical");
}

for (
  const [path, target] of [
    [".claude/skills", "../.agents/skills"],
    [".gemini/skills", "../.agents/skills"],
  ]
) {
  const info = await Deno.lstat(path);
  if (!info.isSymlink || await Deno.readLink(path) !== target) {
    throw new Error(`${path} must link to ${target}`);
  }
}

const actualSkills: string[] = [];
for await (const entry of Deno.readDir(".agents/skills")) {
  if (entry.isDirectory) actualSkills.push(entry.name);
}
actualSkills.sort();

if (actualSkills.join("\n") !== expectedSkills.join("\n")) {
  throw new Error(
    `Unexpected Agent Skills:\n${actualSkills.join("\n")}`,
  );
}

for (const name of actualSkills) {
  const path = `.agents/skills/${name}/SKILL.md`;
  const source = await Deno.readTextFile(path);
  const frontmatter = source.match(/^---\n([\s\S]+?)\n---\n/);
  if (!frontmatter) throw new Error(`${path} has no YAML frontmatter`);

  const metadata = parse(frontmatter[1]) as Record<string, unknown>;
  if (metadata.name !== name) {
    throw new Error(`${path} declares name ${metadata.name}; expected ${name}`);
  }
  const description = metadata.description;
  if (typeof description !== "string" || description.length > 1024) {
    throw new Error(`${path} needs a description of at most 1024 characters`);
  }
  const unsupported = Object.keys(metadata).filter((key) =>
    !["name", "description", "license"].includes(key)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `${path} has unsupported metadata: ${unsupported.join(", ")}`,
    );
  }

  const openaiPath = `.agents/skills/${name}/agents/openai.yaml`;
  const openai = parse(await Deno.readTextFile(openaiPath)) as {
    interface?: Record<string, unknown>;
  };
  const ui = openai.interface;
  if (!ui || typeof ui.display_name !== "string") {
    throw new Error(`${openaiPath} needs interface.display_name`);
  }
  if (
    typeof ui.short_description !== "string" ||
    ui.short_description.length < 25 ||
    ui.short_description.length > 64
  ) {
    throw new Error(`${openaiPath} needs a 25-64 character short_description`);
  }
  if (
    typeof ui.default_prompt !== "string" ||
    !ui.default_prompt.includes(`$${name}`)
  ) {
    throw new Error(`${openaiPath} default_prompt must mention $${name}`);
  }
}

console.log(`Agent configuration is valid (${actualSkills.length} skills).`);
