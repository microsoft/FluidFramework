# @fluidframework/eslint-config-fluid

This package contains a shared ESLint config used by all the packages in the Fluid Framework repo.

## Requirements

- **ESLint 9** (recommended), or
- **ESLint 8.21+** with `ESLINT_USE_FLAT_CONFIG=true` environment variable

This package uses ESLint's flat config format exclusively. Legacy `.eslintrc` format is not supported.

## Usage

Import the desired configuration and spread it into your `eslint.config.mjs`:

```javascript
// eslint.config.mjs
import { strict } from "@fluidframework/eslint-config-fluid";
export default [...strict];
```

### ESLint 8.21+ Users

If you're using ESLint 8.21-8.x, you must enable flat config support via environment variable:

```bash
ESLINT_USE_FLAT_CONFIG=true eslint .
```

Or in your npm scripts:

```json
{
	"scripts": {
		"lint": "cross-env ESLINT_USE_FLAT_CONFIG=true eslint ."
	}
}
```

**Note:** ESLint 8.x flat config support was experimental. We recommend upgrading to ESLint 9 for the best experience.

## Package Structure

The config is organized into a modular structure for maintainability:

```
eslint-config-fluid/
├── flat.mts                    # Main entry point
├── library/
│   ├── constants.mts           # Shared constants (ignores, file patterns, import restrictions)
│   ├── settings.mts            # Plugin settings (import-x, jsdoc)
│   ├── rules/
│   │   ├── base.mts            # Base rules from eslint:recommended, typescript-eslint, etc.
│   │   ├── minimal-deprecated.mts  # Additional rules for minimal-deprecated config
│   │   ├── recommended.mts     # Rules for recommended config (unicorn, type safety)
│   │   └── strict.mts          # Rules for strict config (jsdoc requirements, explicit access)
│   └── configs/
│       ├── base.mts            # Base config with all plugins
│       ├── overrides.mts       # Shared overrides (test files, React, JS files)
│       └── factory.mts         # Config definitions and factory functions
```

## Configurations

### Recommended

The standard config for use in Fluid Framework libraries. This is the default export.

```javascript
import { recommended } from "@fluidframework/eslint-config-fluid";
export default [...recommended];
```

This configuration is recommended for all libraries in the repository, though use of the [strict](#strict) config is preferred whenever reasonable.

### Strict

The strictest config for use in Fluid Framework libraries. Recommended for highest code quality enforcement.

```javascript
import { strict } from "@fluidframework/eslint-config-fluid";
export default [...strict];
```

Use of this config is encouraged for libraries with public facing APIs, and those used as external-facing examples (e.g. those mentioned on `fluidframework.com`).

### Strict-Biome

A version of the "strict" config that disables rules covered by Biome's "recommended" lint config. Intended for projects using both ESLint and Biome.

```javascript
import { strictBiome } from "@fluidframework/eslint-config-fluid";
export default [...strictBiome];
```

### Minimal-Deprecated

A lighter config that serves as the base for recommended and strict. Not recommended for general use.

```javascript
import { minimalDeprecated } from "@fluidframework/eslint-config-fluid";
export default [...minimalDeprecated];
```

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
