# GitHub Copilot instructions

- Treat the repository-root `AGENTS.md` as the canonical project instructions.
- Use the applicable Agent Skill from `.agents/skills/` for specialized work.
- The setup workflow prepares the Dev Container. Run repository commands with
  `deno task devcontainer:exec <command>` when the agent is outside it.
- Keep this file Copilot-specific and concise; do not duplicate `AGENTS.md`.
