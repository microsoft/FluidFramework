/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig, chaiFriendlyConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	// Ignore test data files and test fixtures across all sub-projects
	{
		ignores: ["src/*/test/data/**", "src/*/test/**/fixtures/**"],
	},
	{
		rules: {
			// build-tools uses some template-like tokens for use in configs
			"no-template-curly-in-string": "off",

			// TODO: AB#58049 Enable these type-safety rules ASAP and fix violations
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",

			// Allow empty object types for extending interfaces
			"@typescript-eslint/no-empty-object-type": "off",

			// Allow require imports for dynamic loading
			"@typescript-eslint/no-require-imports": "off",

			// TODO: AB#58050 These rules require code changes - enable and fix violations
			"@typescript-eslint/class-literal-property-style": "off",
			"@typescript-eslint/return-await": "off",
			"@typescript-eslint/dot-notation": "off",
			"@typescript-eslint/no-restricted-imports": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/await-thenable": "off",
			"@typescript-eslint/prefer-string-starts-ends-with": "off",
			"@typescript-eslint/prefer-includes": "off",
			"@typescript-eslint/no-dynamic-delete": "off",
			"@typescript-eslint/prefer-for-of": "off",
			"@typescript-eslint/only-throw-error": "off",
			"@typescript-eslint/restrict-plus-operands": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"unicorn/prefer-ternary": "off",
			"unicorn/better-regex": "off",
			"jsdoc/check-indentation": "off",
			"@eslint-community/eslint-comments/no-unused-disable": "off",
			"@eslint-community/eslint-comments/no-unlimited-disable": "off",

			// TODO: AB#58051 Base ESLint rules that require code changes - enable and fix violations
			"guard-for-in": "off",
			"no-restricted-syntax": "off",
			"eqeqeq": "off",
			"no-param-reassign": "off",
			"no-undef-init": "off",
			"default-case": "off",
			"radix": "off",

			// Some CJS modules (fs-extra, json5, yaml) don't have proper default exports
			// but are imported with `import X from "module"`. This is handled by esModuleInterop.
			"import-x/default": "off",
		},
	},
	// Enable switch-exhaustiveness-check only for core TS files (not .d.ts which lack type info)
	// Scoped to src/core/ since other sub-projects did not previously have this rule.
	{
		files: ["src/core/**/*.ts", "src/core/**/*.tsx", "src/core/**/*.mts", "src/core/**/*.cts"],
		ignores: ["**/*.d.ts"],
		rules: {
			"@typescript-eslint/switch-exhaustiveness-check": "error",
		},
	},
	// Enforce no-non-null-assertion only in core (original build-tools scope)
	{
		files: ["src/core/**"],
		rules: {
			"@typescript-eslint/no-non-null-assertion": "error",
		},
	},
	// build-cli specific overrides
	{
		files: ["src/build-cli/**"],
		rules: {
			// This rule is often triggered when using custom Flags, so disabling.
			"object-shorthand": "off",
			// The default for this rule is 4, but 5 is better for build-cli.
			// TODO: AB#58055 Consider lowering this limit and simplifying build-tools code accordingly.
			"max-params": ["warn", 5],
		},
	},
	// Chai-friendly rules for build-infrastructure test files
	{
		files: ["src/build-infrastructure/**/*.spec.ts", "src/build-infrastructure/test/**"],
		...chaiFriendlyConfig,
	},
];
