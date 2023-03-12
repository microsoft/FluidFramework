/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * "Strict" eslint configuration.
 *
 * This configuration is recommended, in particular, for packages whose APIs are expected to be used externally.
 * It is additionally recommended for the following scenarios:
 *
 * * Critical libraries - those where particular attention to code quality might prevent severe issues.
 *
 * * Publicized examples - any libraries, sample applications, etc. we expect external consumers to use for reference.
 */
module.exports = {
	extends: ["./recommended.js"],
	rules: {
		/**
		 * Require jsdoc/tsdoc comments on public/exported API items.
		 */
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
					"VariableDeclaration",
				],
			},
		],
	},
	overrides: [
		{
			// Rules only for TypeScript files
			files: ["*.ts", "*.tsx"],
			rules: {
				"@typescript-eslint/explicit-member-accessibility": [
					"error",
					{
						accessibility: "explicit",
						overrides: {
							accessors: "explicit",
							constructors: "explicit",
							methods: "explicit",
							properties: "explicit",
							parameterProperties: "explicit",
						},
					},
				],

				// Parameter properties can be confusing to those new to TypeScript as they are less explicit than other
				// ways of declaring and initializing class members.
				"@typescript-eslint/no-parameter-properties": [
					"warn",
					{
						allows: ["private", "private readonly", "public readonly", "readonly"],
					},
				],
			},
		},
	],
};
