/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

/**
 * Rules from strict.js.
 */
export const strictRules: Linter.RulesRecord = {
	"jsdoc/require-jsdoc": [
		"error",
		{
			publicOnly: true,
			enableFixer: false,
			require: {
				ArrowFunctionExpression: true,
				ClassDeclaration: true,
				ClassExpression: true,
				FunctionDeclaration: true,
				FunctionExpression: true,
				MethodDefinition: false,
			},
			contexts: [
				"TSEnumDeclaration",
				"TSInterfaceDeclaration",
				"TSTypeAliasDeclaration",
				"ExportNamedDeclaration > VariableDeclaration",
			],
			skipInterveningOverloadedDeclarations: false,
			exemptOverloadedImplementations: true,
		},
	],
};

/**
 * TypeScript-specific strict rules from strict.js.
 */
export const strictTsRules: Linter.RulesRecord = {
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
	"@typescript-eslint/consistent-indexed-object-style": "error",
	"@typescript-eslint/no-unsafe-enum-comparison": "error",
	"@typescript-eslint/consistent-generic-constructors": "error",
	"@typescript-eslint/no-redundant-type-constituents": "error",
};
