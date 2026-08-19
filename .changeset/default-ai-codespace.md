---
"@fluid-tools/build-cli": minor
"__section": feature
---
Configure AI launcher assets from an explicit directory

`flub ai` now accepts an `--assetDirectory` option and `FLUB_AI_ASSET_DIRECTORY` environment variable for locating its launcher assets.
This decouples the CLI from a specific repository layout while retaining fallback support for current and previous Codespace layouts when no directory is configured.
