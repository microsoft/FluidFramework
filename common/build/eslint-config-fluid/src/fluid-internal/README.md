# eslint-plugin-fluid-internal

This package contains custom ESLint rules specific for Fluid Framework. It is a separate local module which is exported as a plugin to the `@fluidframework/eslint-config-fluid` package (consumed in `minimal.js`'s `plugins` array).

An ESLint Plugin is an extension for ESLint that adds additional custom rules and configuration options.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins) for more details.

## Background

The `eslint-plugin-fluid-internal` is a nested package living inside the `@fluidframework/eslint-config-fluid` package. This structure is induced by the `ESLint`'s requirements which enforce:

-   Each plugin to be an npm module with a name in the format of `eslint-plugin-foo` or `@scope/eslint-plugin-foo`.

See [ESLint: Name a Plugin](https://eslint.org/docs/latest/extend/plugins#name-a-plugin) for more details.

## Rules

Currently there are two custom rules within the package:

-   `no-restricted-tags-imports`: Restrict imports of `@internal` tagged items.
-   `no-member-release-tags`: Restrict inclusion of any release tags inside the member of the class, function, interface, type, and enums.

## Applying the Custom Rules

Once creating a new custom rule, make sure to include the new rule in `minimal.js`'s `rules` field.

Since `eslint-plugin-fluid-internal` is a dependency of `@fluidframework/eslint-config-fluid` package, any package using `@fluidframework/eslint-config-fluid` as its `devDependencies` will be able to apply the custom rules.

Note, until the next release of the `@fluidframework/eslint-config-fluid`, in order to have custom rules working, install the local version of the package using `"@fluidframework/eslint-config-fluid": "file:relative-path"` (Check `@fluid-tools/api-markdown-documenter` as an reference).
