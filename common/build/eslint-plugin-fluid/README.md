# @fluid-internal/eslint-plugin-fluid

This package contains custom ESLint rules specific for Fluid Framework. It is consumed by the `@fluidframework/eslint-config-fluid` package as a custom plugin (check `minimal.js`'s `plugins` array).

An ESLint Plugin is an extension for ESLint that adds additional custom rules and configuration options.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins) for more details.

## Background

The `@fluid-internal/eslint-plugin-fluid` is directly consumed by the `@fluidframework/eslint-config-fluid` package. Although, it is a best practice to avoid multiple packages which serve similar purpose, this decision was inevitably induced by the `ESLint`'s requirements which enforce:

-   Each plugin to be an npm module with a name in the format of `eslint-plugin-foo` or `@scope/eslint-plugin-foo`.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins#name-a-plugin) for more details. If there is a development in unifying the separate package structure, it should be done to ensure stronger package maintainability.

## Rules

Currently there are two custom rules within the package:

-   `no-restricted-tags-imports`: Restrict imports of `@internal` tagged items.
-   `no-member-release-tags`: Prevent use of release tags on member properties of classes and interfaces, where they are not valid.

## Applying the Custom Rules

To begin enforcing a new custom rule, make sure to include it in the `rules` field of the appropriate config module (`minimal.js`, `recommended.js`, or `strict.js`).

Since `@fluid-internal/eslint-plugin-fluid` is a dependency of `@fluidframework/eslint-config-fluid` package, any package using `@fluidframework/eslint-config-fluid` as its `devDependencies` will be able to apply the custom rules.
