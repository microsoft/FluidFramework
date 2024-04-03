# @fluidframework/eslint-config-fluid Changelog

## [5.2.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v5.2.0)

The import/order rule is now disabled in all configs.

## [5.1.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v5.1.0)

Enables new API trimming rules.

## [5.0.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v5.0.0)

Adds eslint-plugin-fluid to eslint-config-fluid. This new dependency adds new Fluid-specific rules.

## [4.0.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v4.0.0)

Deprecates this package's `minimal` configuration.
Consumers of that configuration will need to update their imports to refer to the renamed module: `minimal-deprecated.js`.

## [3.0.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v3.0.0)

### Update eslint-related dependencies

eslint has been updated to version ~8.49.0. eslint plugins have also been updated to the latest version.

### Update prettier

prettier has been updated to version ~3.0.3.

### Update #16699 typescript-eslint

typescript-eslint has been updated to version ~6.7.2.

## [2.1.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v2.1.0)

### Enable the import-no-deprecated rule

The [import/no-deprecated](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-deprecated.md) rule
is now enabled for all configs except test files.
