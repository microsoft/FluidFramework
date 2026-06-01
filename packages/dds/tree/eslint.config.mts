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
			// Importing the `Type` value from `@sinclair/typebox` defeats tree-shaking
			// because it is a runtime namespace object that pulls in every TypeBox builder.
			// Use the local `Type` subset re-exported from `src/util/typebox.ts` (via `src/util/index.ts`)
			// instead. Type-only imports do not affect the bundle, but are routed through the same
			// barrel for consistency and to keep `@sinclair/typebox` as a single, replaceable dependency.
			// The single allowed entry point disables this rule via an inline override.
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@sinclair/typebox",
							message:
								"Import `Type` and TypeBox types from the tree util barrel (`util/index.js`) instead. The local `util/typebox.ts` re-exports only the subset of TypeBox used by this package; importing the full `Type` namespace defeats tree-shaking. Type-only imports are routed through the barrel for consistency. If you need a TypeBox kind not yet re-exported, add it to `util/typebox.ts`.",
						},
					],
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
