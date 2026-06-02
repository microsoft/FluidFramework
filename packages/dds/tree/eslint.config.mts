/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		ignores: ["./src/entrypoints/**"],
	},
	{
		rules: {
			"@typescript-eslint/no-empty-object-type": [
				"error",
				{
					allowInterfaces: "with-single-extends",
					allowObjectTypes: "always",
				},
			],
			"@typescript-eslint/no-namespace": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^",
					"varsIgnorePattern": "^_",
					"caughtErrorsIgnorePattern": "^_",
				},
			],
			"@typescript-eslint/explicit-member-accessibility": "error",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"jsdoc/require-description": "warn",
			"unicorn/no-null": "off",
			// ESLint applies a single `no-restricted-syntax` configuration per file rather
			// than combining several, so this list must contain every selector for this
			// package: the general selectors plus the tree-specific TypeBox selector.
			"no-restricted-syntax": [
				"error",
				{
					selector: "ExportAllDeclaration",
					message:
						"Exporting * is not permitted. You should export only named items you intend to export.",
				},
				"ForInStatement",
				// Enforce the granular TypeBox import pattern. The named `Type` export of
				// `@sinclair/typebox` is the monolithic `TypeBuilder` aggregate; importing
				// it (`import { Type } from "@sinclair/typebox"`) pulls in every builder
				// and defeats tree-shaking. Instead, bind the namespace with
				// `import * as Type from "@sinclair/typebox"` so member access like
				// `Type.Object(...)` lets the bundler prune unused builders. This can't be
				// expressed with `no-restricted-imports`/`importNames`, since that also
				// reports the desired `import * as Type` namespace form; a syntax selector
				// targets only the named specifier.
				{
					selector:
						'ImportDeclaration[source.value="@sinclair/typebox"] > ImportSpecifier[imported.name="Type"]',
					message:
						'Import the TypeBox `Type` namespace via `import * as Type from "@sinclair/typebox"` instead of the named `Type` value export, which pulls in the entire builder and defeats tree-shaking.',
				},
			],
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"@typescript-eslint/no-unused-vars": ["off"],
			"@typescript-eslint/explicit-function-return-type": "off",
			// Test files commonly define helper functions inside describe blocks for better readability
			"unicorn/consistent-function-scoping": "off",
			// Test files frequently use `as any` casts to access internal/hidden properties for testing
			"@typescript-eslint/no-unsafe-member-access": "off",

			// #region Lints disabled due to being slow and low value for tests
			// Since our build ignores "warn" level lints, but they might be useful to devs interactively (and thats not where we have perf issues),
			// these are kept as "warn" instead of simply "off".
			// Promise lint rules are useful in production paths but are disproportionately expensive in tests.
			"@typescript-eslint/no-misused-promises": "warn",
			"@typescript-eslint/no-floating-promises": "warn",
			// This is currently the largest lint hotspot in test files and adds limited value there.
			"@typescript-eslint/strict-boolean-expressions": "warn",
			// Import namespace validation is also expensive and low-value for test-only imports.
			"import-x/namespace": "warn",
			// Regex optimization suggestions are not important for test code paths.
			"unicorn/better-regex": "warn",
			// #endregion
		},
	},
];

export default config;
