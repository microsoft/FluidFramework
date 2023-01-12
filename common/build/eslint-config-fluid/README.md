# @fluidframework/eslint-config-fluid

This package contains a shared ESLint config used by all the packages in the Fluid Framework repo.

It exports the following shared ESLint configs:

## Configurations

### Minimal

This is the minimal config for use in Fluid Framework libraries, only intended for internal-only packages, test libraries, etc.
Whenever possible, the [recommended](#recommended) or [strict](#strict) configs should be used instead.

This configuration should never be used in published packages.
It is only suitable for early prototyping and repository-internal testing libraries.

Imported via `@fluidframework/eslint-config-fluid/minimal`.

### Recommended

This is the standard config for use in Fluid Framework libraries.
It is also the default library export.

This configuration is recommended for all libraries in the repository, though use of the [strict](#strict) config is preferred whenever reasonable.

Imported via `@fluidframework/eslint-config-fluid` (or `@fluidframework/eslint-config-fluid/recommended`).

### Strict

The strictest config for use in Fluid Framework libraries.
Recommended for highest code quality enforcement.

In particular, use of this config is encouraged for libraries with public facing APIs, and those used as external-facing examples (e.g. those mentioned on `fluidframework.com`).

Imported via `@fluidframework/eslint-config-fluid/strict`.

## Changing the lint config

If you want to change the shared lint config (that is, this package), you need to do the following:

1. Make the change in the config.
2. Publish a pre-release package.
3. Update the core packages to use the pre-release lint config.

When updating the lint config (step 1), run `npm run build` and commit any resulting changes.

### Tracking lint config changes over time

One question that comes up often when we make changes to our lint config is, "what changed?" This applies even when we
don't make any changes other than upgrading deps, because the dependency upgrade might include a new rule.

ESLint provides a way to print the config that would apply to a file (`--print-config`), so we use this capability to
print out the applied config as a JSON file. As we make changes to the config, we can print out the config again and get
a diff to review as part of a PR -- just like we do with API reports for code changes.

<!-- AUTO-GENERATED-CONTENT:START (SCRIPTS) -->

## Scripts

| Script                     | Description                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `build`                    | `npm run print-config`                                                                                        |
| `cleanup-printed-configs`  | Clean up the printed configs. Removes the `parser` property and sorts the JSON.                               |
| `format`                   | `npm run prettier:fix`                                                                                        |
| `lint`                     | `npm run prettier`                                                                                            |
| `lint:fix`                 | `npm run prettier:fix`                                                                                        |
| `prettier`                 | `prettier --check .`                                                                                          |
| `prettier:fix`             | `prettier --write .`                                                                                          |
| `print-config`             | Print all the eslint configs.                                                                                 |
| `print-config:default`     | Print the eslint config for regular TypeScript files (`eslint --config index.js --print-config src/file.ts`). |
| `print-config:minimal`     | `eslint --config ./minimal.js --print-config ./src/file.ts > ./printed-configs/minimal.json`                  |
| `print-config:recommended` | `eslint --config ./recommended.js --print-config ./src/file.ts > ./printed-configs/recommended.json`          |
| `print-config:strict`      | `eslint --config ./strict.js --print-config ./src/file.ts > ./printed-configs/strict.json`                    |
| `print-config:test`        | Print the eslint config for test files (`eslint --config index.js --print-config src/test/file.ts`).          |

<!-- AUTO-GENERATED-CONTENT:END -->

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
