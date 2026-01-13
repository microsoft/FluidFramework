/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

/**
 * Rules from recommended.js.
 */
export const recommendedRules: Linter.RulesRecord = {
	"@rushstack/no-new-null": "error",
	"no-void": "error",
	"require-atomic-updates": "error",

	// Unicorn rule overrides (from recommended.js)
	"unicorn/consistent-function-scoping": "warn",
	"unicorn/import-style": "off",
	"unicorn/no-array-push-push": "off",
	"unicorn/no-array-callback-reference": "off",
	"unicorn/empty-brace-spaces": "off",
	"unicorn/no-for-loop": "off",
	"unicorn/no-nested-ternary": "off",
	"unicorn/no-useless-spread": "off",
	"unicorn/no-useless-undefined": "off",
	"unicorn/numeric-separators-style": ["error", { onlyIfContainsSeparator: true }],
	"unicorn/prevent-abbreviations": "off",
	"unicorn/prefer-at": "warn",
	"unicorn/prefer-event-target": "off",
	"unicorn/prefer-string-raw": "warn",
	"unicorn/prefer-string-replace-all": "warn",
	"unicorn/prefer-structured-clone": "warn",
	"unicorn/template-indent": "off",
	"unicorn/number-literal-case": "off",
	"unicorn/expiring-todo-comments": "off",

	// @typescript-eslint rules (from recommended.js)
	"@typescript-eslint/no-explicit-any": [
		"error",
		{
			ignoreRestArgs: true,
		},
	],
	"@typescript-eslint/explicit-module-boundary-types": "error",
	"@typescript-eslint/no-unsafe-argument": "error",
	"@typescript-eslint/no-unsafe-assignment": "error",
	"@typescript-eslint/no-unsafe-call": "error",
	"@typescript-eslint/no-unsafe-member-access": "error",
	"@typescript-eslint/no-unsafe-return": "error",

	// JSDoc rules (from recommended.js)
	"jsdoc/require-description": ["error", { checkConstructors: false }],

	// Consistent type imports/exports (from recommended.js)
	"@typescript-eslint/consistent-type-exports": [
		"error",
		{
			fixMixedExportsWithInlineTypeSpecifier: true,
		},
	],
	"@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
};
