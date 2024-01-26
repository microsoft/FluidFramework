/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// Override base rules due to false-positives being reported in this package.
		"jsdoc/require-jsdoc": [
			"error",
			{
				// Indicates that only module exports should be flagged for lacking jsdoc comments
				publicOnly: true,
				// Prevents eslint from adding empty comment blocks when run with `--fix`
				enableFixer: false,
				require: {
					ArrowFunctionExpression: true,
					ClassDeclaration: true,
					ClassExpression: true,
					FunctionDeclaration: true,
					FunctionExpression: true,

					// Will report for *any* methods on exported classes, regardless of whether or not they are public
					MethodDefinition: false,
				},
				contexts: [
					"TSEnumDeclaration",
					"TSInterfaceDeclaration",
					"TSTypeAliasDeclaration",

					// Yields many false positives in this package.
					// "VariableDeclaration",
				],
			},
		],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"import/no-nodejs-modules": [
					"error",
					{ allow: ["node:assert", "node:fs", "node:path"] },
				],
				"unicorn/prefer-module": "off",
			},
		},
	],
};
