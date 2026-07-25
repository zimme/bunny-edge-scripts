# GitHub Copilot instructions

- Treat the repository-root `AGENTS.md` as the canonical project instructions.
- Use the applicable Agent Skill from `.agents/skills/` for specialized work.
- The setup workflow prepares the Compose-native `development` service. Run
  repository commands with
  `docker compose -f .devcontainer/compose.yaml exec
  development <command>`
  when the agent is outside it.
- Keep this file Copilot-specific and concise; do not duplicate `AGENTS.md`.
