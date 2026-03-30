# Dossier — Project Rules

## Memory access
- **Don't proactively read** `reference_narrative_ledger.md` or `project_game_world.md` unless the task involves story, world, or character content, or the user directs you to.
- These files exist so you *can* reference them when needed — just don't load them for routine code tasks.

## General
- Dossier is a creative project. Respect authorial intent — when in doubt about narrative decisions, ask.
- Keep `SEED_DATA` in sync with the user's current vision. Clear localStorage to pick up seed changes.

## What is Dossier? (& terminology)
- Dossier is a noir TTRPG/video game RPG tool for tracking design or interpretation of People, Factions, and Locations.
- Dossier's Imaginative Mode prompts the app's users with suggestions informed by a system of tags.
- Dossier has a "developer" mode (used by the user you work with) for taking notes which tend to be for ideation about People, Factions, and Locations.
- Dossier has a "player" mode (used by the user you work with and future playerbase) for suggesting moods about People, Factions, and Locations.
- To support the subtle differences in use cases for developer and player mode, developers and players draw from the same prompt pools, but with different restrictions.
- Players have a prompt budget per Dossier usage "sitting". (Not "session".)

## Current technical goals
- Prompting: improve the mood, atmosphere, and utility of Imaginative Mode's prompts as the user develops narrative and worldbuilding foundations.
- Stylistic: develop realistic and appealing animation styles for rendering text and basic shapes ("eye-candy")

## Future technical goals
- Stylistic: even more realistic appearance for player-mode Dossier (paper flutter, coffee stains, and more complicated doodles)
- Simulation/numerical: learning and developing heuristics, rules, shaders, etc. to support Dossier's "real paper" stylistic goals.
* Paper texture
* Ink physics
* Motion-planning for animated writing and doodling

## Narrative goals
- You won't usually be giving input on these, but when it's time and the user prompts you, `reference_narrative_ledger.md`, `project_game_world.md`, and `dossier-state.json` are good sources of information you should refer to.
