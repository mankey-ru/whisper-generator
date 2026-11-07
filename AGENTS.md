# whisper-generator agent rules

Shared rules live in `~/.claude` (my-global-agent-rules). This file holds only
the rules of this repo that fit no topic; topic additions are in
`AGENTS_INCLUDES/`.

- [README.md](README.md) is the full doc here, there is no `ARCHITECTURE.md`:
  features, `config.js` model fields, CLI options, pipeline and packing rules,
  project layout. Read it before changing CLI options, the `config.js` schema,
  pipeline stages or output format; update it in the same commit when behavior
  it describes changes. Overrides global: no "keep it short" for this README.
