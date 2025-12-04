# @fluidframework/eslint-config-fluid

This package contains a shared ESLint config used by all the packages in the Fluid Framework repo.

It exports the following shared ESLint configs:

## ESLint 9 Flat Config Support

This package supports **ESLint 9 flat config format** via the `flat.mjs` export. Packages can use `eslint.config.mjs` files that import from this module.

For flat config (ESLint 9), import from `@fluidframework/eslint-config-fluid/flat.mjs`:

```javascript
// eslint.config.mjs
import { strict } from "@fluidframework/eslint-config-fluid/flat.mjs";
export default [...strict];
```

The flat config exports use `FlatCompat` to wrap the legacy configs and add necessary overrides for type-aware parsing in JavaScript files and test files.

## Configurations

### Recommended

This is the standard config for use in Fluid Framework libraries.
It is also the default library export.

This configuration is recommended for all libraries in the repository, though use of the [strict](#strict) config is preferred whenever reasonable.

**Legacy format:** Imported via `@fluidframework/eslint-config-fluid` (or `@fluidframework/eslint-config-fluid/recommended`).
**Flat config:** Import `recommended` from `@fluidframework/eslint-config-fluid/flat.mjs`.

### Strict

The strictest config for use in Fluid Framework libraries.
Recommended for highest code quality enforcement.

In particular, use of this config is encouraged for libraries with public facing APIs, and those used as external-facing examples (e.g. those mentioned on `fluidframework.com`).

**Legacy format:** Imported via `@fluidframework/eslint-config-fluid/strict`.
**Flat config:** Import `strict` from `@fluidframework/eslint-config-fluid/flat.mjs`.

### Strict-Biome

A version of the "strict" config that disables rules that are supported by Biome's "recommended" lint config.
This config is intended to be used in projects that use both eslint and Biome for linting.
This config is considered experimental.

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

<!-- AUTO-GENERATED-CONTENT:START (PACKAGE_SCRIPTS) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Scripts

| Script | Description |
|--------|-------------|
| `build` | `npm run print-config` |
| `build:readme:disabled` | `markdown-magic --files "**/*.md"` |
| `clean` | `rimraf --glob dist` |
| `format` | `npm run prettier:fix` |
| `prettier` | `prettier --check .` |
| `prettier:fix` | `prettier --write .` |
| `print-configs` | `tsx scripts/print-configs.ts printed-configs` |
| `test` | `echo TODO: add tests in @fluidframework/eslint-config-fluid` |

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
