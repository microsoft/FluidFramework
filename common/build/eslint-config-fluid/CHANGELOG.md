# @fluidframework/eslint-config-fluid Changelog

## [5.4.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v5.4.0)

### Disabled rules

The following rules have been disabled in all configs because they conflict with formatter settings:

-   [@typescript-eslint/brace-style](https://typescript-eslint.io/rules/brace-style)
-   [unicorn/number-literal-case](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/v48.0.1/docs/rules/number-literal-case.md)

### @typescript-eslint/explicit-function-return-type changes

The [allowExpressions](https://typescript-eslint.io/rules/explicit-function-return-type/#allowexpressions) option for
the @typescript-eslint/explicit-function-return-type rule has been set to `true`.

### @typescript-eslint/no-explicit-any changes

The [ignoreRestArgs](https://typescript-eslint.io/rules/no-explicit-any#ignorerestargs) option for
the @typescript-eslint/no-explicit-any rule has been set to `true`.

### import/no-internal-modules changes

All imports from @fluid-experimental packages are now permitted.

## [5.3.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-config-fluid_v5.3.0)

The import/order rule is enabled with the following settings:

```json
[
	"error",
	{
		"newlines-between": "always",
		"alphabetize": {
			"order": "asc",
			"caseInsensitive": false
		}
	}
]
```

### eslint-import-resolver-typescript preferred over node

Lint configurations previously specified both the `node` and `typescript` [resolvers](https://github.com/import-js/eslint-plugin-import?tab=readme-ov-file#resolvers), with the `node` resolver taking precedence.

The precedence has been reversed in this release: [eslint-import-resolver-typescript](https://github.com/import-js/eslint-import-resolver-typescript) is now the preferred resolver.

This may result in lint rules dependent on imported _types_ (rather than values) to correctly apply, e.g. `import/no-deprecated`.

### allow-ff-test-exports condition enabled

The typescript import resolver now enables the "allow-ff-test-exports" condition, which adds support for linting files which reference FluidFramework test-only exports,
such as id-compressor and merge-tree.

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
