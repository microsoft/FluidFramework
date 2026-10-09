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
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						"@fluidframework/*/internal{,/**}",
						"@fluid-experimental/**",
						"@fluid-internal/**",
						"typebox/compile",
						"typebox/error",
						"typebox/format",
						"typebox/guard",
						"typebox/schema",
						"typebox/system",
						"typebox/type",
						"typebox/value",
						"*/index.js",
					],
				},
			],
			"jsdoc/require-description": "warn",
			"no-restricted-syntax": [
				"error",
				{
					selector: "ExportAllDeclaration",
					message:
						"Exporting * is not permitted. You should export only named items you intend to export.",
				},
				"ForInStatement",
				// This mirrors eslint-config-fluid 15 until Tree consumes the published package:
				// named type imports come from `typebox`, while runtime schema builders use
				// `import * as Type from "typebox/type"`.
				{
					selector: 'ImportDeclaration[source.value="typebox"] > ImportNamespaceSpecifier',
					message:
						"Import TypeBox types by name with `import type` from `typebox`, and import the runtime namespace from `typebox/type`.",
				},
				{
					selector: 'ImportDeclaration[source.value="typebox"] > ImportDefaultSpecifier',
					message:
						"Do not use the TypeBox aggregate. Import the runtime namespace from `typebox/type`.",
				},
				{
					selector: 'ImportDeclaration[source.value="typebox/type"] > ImportDefaultSpecifier',
					message: 'Import the TypeBox runtime with `import * as Type from "typebox/type"`.',
				},
				{
					selector: 'ImportDeclaration[source.value="typebox/type"] > ImportSpecifier',
					message:
						'Import the TypeBox runtime with `import * as Type from "typebox/type"`; import types by name from `typebox`.',
				},
				{
					selector:
						'ImportDeclaration[source.value="typebox"]:not([importKind="type"]) > ImportSpecifier:not([importKind="type"])',
					message:
						'Runtime TypeBox imports must use `import * as Type from "typebox/type"`; only type imports may come from `typebox`.',
				},
				{
					// The import policy above reserves `Type` for the TypeBox runtime namespace.
					selector:
						'CallExpression[callee.object.name="Type"][callee.property.name=/^(Interface|Optional|Readonly|Record)$/]',
					message:
						"Use the specialized helpers in `src/util/typebox.ts`; these general TypeBox builders load the type-instantiation engine.",
				},
			],
			"unicorn/no-null": "off",
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
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						"@fluid*/**",
						"@fluidframework/*/internal{,/**}",
						"@fluid-experimental/**",
						"@fluid-internal/**",
						"typebox/compile",
						"typebox/error",
						"typebox/format",
						"typebox/guard",
						"typebox/schema",
						"typebox/system",
						"typebox/type",
						"typebox/value",
						"*/index.js",
					],
				},
			],
			// Regex optimization suggestions are not important for test code paths.
			"unicorn/better-regex": "warn",
			// #endregion
		},
	},
];

export default config;
