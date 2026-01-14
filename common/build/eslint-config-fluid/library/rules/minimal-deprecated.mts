/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal-deprecated ESLint rules.
 *
 * This module contains rules that extend the base configuration. The "minimal-deprecated"
 * configuration is the lightest recommended config and serves as the foundation for
 * the recommended and strict configs. It includes additional TypeScript rules, JSDoc/TSDoc
 * validation, import restrictions, and Fluid-specific custom rules.
 */

import type { Linter } from "eslint";

import {
	restrictedImportPaths,
	restrictedImportPatternsForProductionCode,
	permittedImports,
} from "../constants.mjs";

/**
 * Rules from minimal-deprecated.js.
 */
export const minimalDeprecatedRules: Linter.RulesRecord = {
	// Disable max-len as it conflicts with biome formatting
	"max-len": "off",

	// Fluid custom rules
	"@fluid-internal/fluid/no-member-release-tags": "error",
	"@fluid-internal/fluid/no-unchecked-record-access": "error",

	// @rushstack rules
	"@rushstack/no-new-null": "warn",

	// @typescript-eslint rules (from minimal-deprecated.js)
	"@typescript-eslint/naming-convention": [
		"error",
		{
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
		},
	],
	"@typescript-eslint/dot-notation": "error",
	"@typescript-eslint/no-non-null-assertion": "error",
	"@typescript-eslint/no-unnecessary-type-assertion": "error",
	"@typescript-eslint/explicit-function-return-type": [
		"error",
		{
			allowExpressions: true,
			allowTypedFunctionExpressions: true,
			allowHigherOrderFunctions: true,
			allowDirectConstAssertionInArrowFunctions: true,
			allowConciseArrowFunctionExpressionsStartingWithVoid: false,
		},
	],
	"@typescript-eslint/no-restricted-imports": [
		"error",
		{
			paths: restrictedImportPaths,
			patterns: restrictedImportPatternsForProductionCode,
		},
	],

	"no-empty": "error",
	"no-multi-spaces": [
		"error",
		{
			ignoreEOLComments: true,
		},
	],

	"unused-imports/no-unused-imports": "error",
	"valid-typeof": "error",
	"promise/param-names": "warn",

	"unicorn/prefer-switch": "error",
	"unicorn/prefer-ternary": "error",
	"unicorn/prefer-type-error": "error",

	// Rules enabled with warn severity (from minimal-deprecated.js)
	// Note: these will be promoted to "error" in future releases
	"@typescript-eslint/consistent-type-exports": [
		"warn",
		{
			fixMixedExportsWithInlineTypeSpecifier: true,
		},
	],
	"@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
	"@typescript-eslint/explicit-module-boundary-types": "warn",
	"@typescript-eslint/no-explicit-any": [
		"warn",
		{
			ignoreRestArgs: true,
		},
	],
	"@typescript-eslint/no-unsafe-argument": "warn",
	"@typescript-eslint/no-unsafe-assignment": "warn",
	"@typescript-eslint/no-unsafe-call": "warn",
	"@typescript-eslint/no-unsafe-member-access": "warn",
	"@typescript-eslint/no-unsafe-return": "warn",
	"no-void": "warn",
	"require-atomic-updates": "warn",
	"unicorn/numeric-separators-style": ["warn", { onlyIfContainsSeparator: true }],

	// Disabled intentionally (from minimal-deprecated.js)
	"@rushstack/typedef-var": "off",
	"@typescript-eslint/explicit-member-accessibility": "off",
	"@typescript-eslint/member-ordering": "off",
	"@typescript-eslint/no-unused-vars": "off",
	"@typescript-eslint/no-use-before-define": "off",
	"@typescript-eslint/typedef": "off",
	"@typescript-eslint/unified-signatures": "off",
	"@typescript-eslint/no-duplicate-type-constituents": "off",
	"@typescript-eslint/non-nullable-type-assertion-style": "off",
	"@typescript-eslint/consistent-indexed-object-style": "off",
	"@typescript-eslint/no-unsafe-enum-comparison": "off",
	"@typescript-eslint/no-redundant-type-constituents": "off",
	"@typescript-eslint/consistent-generic-constructors": "off",
	"func-call-spacing": "off",
	"dot-notation": "off",
	"no-unused-expressions": "off",

	// Deprecated formatting rules (from minimal-deprecated.js)
	"array-bracket-spacing": "off",
	"arrow-spacing": "off",
	"block-spacing": "off",
	"dot-location": "off",
	"jsx-quotes": "off",
	"key-spacing": "off",
	"space-unary-ops": "off",
	"switch-colon-spacing": "off",

	// TSDoc/JSDoc rules (from minimal-deprecated.js)
	"tsdoc/syntax": "error",
	"jsdoc/check-access": "error",
	"jsdoc/check-line-alignment": "warn",
	"jsdoc/check-examples": "off",
	"jsdoc/check-indentation": "error",
	"jsdoc/check-tag-names": "off",
	"jsdoc/empty-tags": "error",
	"jsdoc/multiline-blocks": ["error"],
	"jsdoc/no-bad-blocks": "error",
	"jsdoc/require-asterisk-prefix": "error",
	"jsdoc/require-hyphen-before-param-description": "error",
	"jsdoc/require-param-description": "error",
	"jsdoc/require-returns-description": "error",

	// Additional @typescript-eslint rules (from minimal-deprecated.js)
	"@typescript-eslint/no-import-type-side-effects": "error",
	"@typescript-eslint/prefer-includes": "error",
	"@typescript-eslint/prefer-nullish-coalescing": "error",
	"@typescript-eslint/prefer-optional-chain": "error",

	// import-x rules (from minimal-deprecated.js)
	"import-x/no-nodejs-modules": ["error"],
	"import-x/no-deprecated": "error",
	"import-x/no-internal-modules": [
		"error",
		{
			allow: permittedImports,
		},
	],
};
