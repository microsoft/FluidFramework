# @fluid-internal/eslint-plugin-fluid

This package contains custom ESLint rules specific for Fluid Framework. It is consumed by the `@fluidframework/eslint-config-fluid` package as a custom plugin (check `minimal.js`'s `plugins` array).

An ESLint Plugin is an extension for ESLint that adds additional custom rules and configuration options.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins) for more details.

## Background

The `@fluid-internal/eslint-plugin-fluid` is directly consumed by the `@fluidframework/eslint-config-fluid` package. Although, it is a best practice to avoid multiple packages which serve similar purpose, this decision was inevitably induced by the `ESLint`'s requirements which enforce:

-   Each plugin to be an npm module with a name in the format of `eslint-plugin-foo` or `@scope/eslint-plugin-foo`.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins#name-a-plugin) for more details. If there is a development in unifying the separate package structure, it should be done to ensure stronger package maintainability.

## Rules

Browser `src/rules` to check more information on the individual rules.
