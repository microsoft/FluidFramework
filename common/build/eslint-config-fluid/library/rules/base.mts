/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base ESLint rules.
 *
 * This module contains the foundational rules applied by the base configuration.
 * These rules are inherited by all higher-level configs (minimal-deprecated, recommended, strict).
 * Rules are organized by plugin/source and include custom Fluid rules, TypeScript rules,
 * import-x rules, unicorn rules, and core ESLint rules.
 */

import type { Linter } from "eslint";

/**
 * Base rules from base.js.
 * Rules from eslint:recommended, @typescript-eslint/recommended-type-checked,
 * @typescript-eslint/stylistic-type-checked, import-x/recommended, import-x/typescript.
 */
export const baseRules: Linter.RulesRecord = {
	// Please keep entries alphabetized within a group

	// #region Fluid Custom Rules

	/**
	 * Disallow `-` immediately following a JSDoc/TSDoc tag (e.g. `@deprecated - foo`).
	 */
	"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "error",

	/**
	 * Disallow file path based links in JSDoc/TSDoc comments.
	 */
	"@fluid-internal/fluid/no-file-path-links-in-jsdoc": "error",

	/**
	 * Disallow the use of Markdown-syntax links in JSDoc/TSDoc comments.
	 */
	"@fluid-internal/fluid/no-markdown-links-in-jsdoc": "error",

	// #endregion

	// #region @typescript-eslint

	"@typescript-eslint/adjacent-overload-signatures": "error",
	"@typescript-eslint/array-type": "error",
	"@typescript-eslint/await-thenable": "error",
	"@typescript-eslint/consistent-type-assertions": [
		"error",
		{
			assertionStyle: "as",
			objectLiteralTypeAssertions: "never",
		},
	],
	"@typescript-eslint/consistent-type-definitions": "error",
	"@typescript-eslint/dot-notation": "error",
	"@typescript-eslint/explicit-function-return-type": "off",
	"@typescript-eslint/no-dynamic-delete": "error",
	"@typescript-eslint/no-empty-function": "off",
	"@typescript-eslint/no-empty-object-type": "error",
	"@typescript-eslint/no-explicit-any": "off",
	"@typescript-eslint/no-extraneous-class": "error",
	"@typescript-eslint/no-floating-promises": "error",
	"@typescript-eslint/no-for-in-array": "error",
	"@typescript-eslint/no-inferrable-types": "off",
	"@typescript-eslint/no-invalid-this": "off",
	"@typescript-eslint/no-magic-numbers": "off",
	"@typescript-eslint/no-misused-new": "error",
	"@typescript-eslint/no-non-null-assertion": "error",
	"@typescript-eslint/no-require-imports": "error",
	"@typescript-eslint/no-shadow": [
		"error",
		{
			hoist: "all",
			ignoreTypeValueShadow: true,
		},
	],
	"@typescript-eslint/no-this-alias": "error",
	"@typescript-eslint/no-unused-expressions": "error",
	"@typescript-eslint/no-unused-vars": "off",
	"@typescript-eslint/no-unnecessary-qualifier": "error",
	"@typescript-eslint/no-unnecessary-type-arguments": "error",
	"@typescript-eslint/no-unnecessary-type-assertion": "error",
	"@typescript-eslint/no-unsafe-function-type": "error",
	"@typescript-eslint/only-throw-error": "error",
	"@typescript-eslint/prefer-for-of": "error",
	"@typescript-eslint/prefer-function-type": "error",
	"@typescript-eslint/prefer-namespace-keyword": "error",
	"@typescript-eslint/prefer-readonly": "error",
	"@typescript-eslint/promise-function-async": "error",
	"@typescript-eslint/require-await": "off",
	"@typescript-eslint/restrict-plus-operands": "error",
	"@typescript-eslint/restrict-template-expressions": "off",
	"@typescript-eslint/return-await": "error",
	"@typescript-eslint/strict-boolean-expressions": "error",
	"@typescript-eslint/triple-slash-reference": "error",
	"@typescript-eslint/unbound-method": [
		"error",
		{
			ignoreStatic: true,
		},
	],
	"@typescript-eslint/unified-signatures": "error",
	"@typescript-eslint/no-wrapper-object-types": "error",

	// #endregion

	// #region @eslint-community/eslint-plugin-eslint-comments
	"@eslint-community/eslint-comments/disable-enable-pair": [
		"error",
		{
			allowWholeFile: true,
		},
	],

	// #endregion

	// #region eslint-plugin-import-x
	// Note: Additional import-x settings are in the settings.mts module

	"import-x/no-default-export": "error",
	"import-x/no-deprecated": "off",
	"import-x/no-extraneous-dependencies": "error",
	"import-x/no-internal-modules": "error",
	"import-x/no-unassigned-import": "error",
	"import-x/no-unresolved": [
		"error",
		{
			caseSensitive: true,
		},
	],
	"import-x/no-unused-modules": "error",
	"import-x/order": [
		"error",
		{
			"groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
			"newlines-between": "always",
			"alphabetize": {
				order: "asc",
				// Sorting is case-sensitive by default, which is the same as Biome. To avoid
				// another huge set of changes to order things case-insensitively, we'll just
				// use the rule with this config for now. This decision should be considered
				// pragmatic and not a statement of preference, and we should revisit this.
				caseInsensitive: false,
			},
		},
	],

	// #endregion

	// #region eslint-plugin-unicorn

	"unicorn/better-regex": "error",
	"unicorn/filename-case": [
		"error",
		{
			cases: {
				camelCase: true,
				pascalCase: true,
			},
		},
	],
	// Rationale: Destructuring of `Array.entries()` in order to get the index variable results in a
	// significant performance regression [node 14 x64].
	"unicorn/no-for-loop": "off",
	"unicorn/no-new-buffer": "error",
	// The rule seems to crash on some of our code
	"unicorn/expiring-todo-comments": "off",

	// #endregion

	// #region eslint core rules

	"arrow-body-style": "off",
	"arrow-parens": ["error", "always"],
	"camelcase": "off", // Superseded by @typescript-eslint/naming-convention
	"brace-style": "off", // Superseded by @typescript-eslint/brace-style
	"capitalized-comments": "off",
	"comma-dangle": "off", // Superseded by @typescript-eslint/comma-dangle
	"comma-spacing": "off", // Superseded by @typescript-eslint/comma-spacing
	"complexity": "off",
	"constructor-super": "error",
	"curly": "error",
	"default-case": "error",
	"dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
	"eol-last": "error",
	"eqeqeq": ["error", "smart"],
	"func-call-spacing": "off", // Superseded by @typescript-eslint/func-call-spacing
	"guard-for-in": "error",
	"id-match": "error",
	"linebreak-style": "off",
	"keyword-spacing": "off", // Superseded by @typescript-eslint/keyword-spacing
	"max-classes-per-file": "off",
	"max-len": [
		"error",
		{
			ignoreRegExpLiterals: false,
			ignoreStrings: false,
			code: 120,
		},
	],
	"max-lines": "off",
	"new-parens": "error",
	"newline-per-chained-call": "off",
	"no-bitwise": "error",
	"no-caller": "error",
	"no-cond-assign": "error",
	"no-constant-condition": "error",
	"no-control-regex": "error",
	"no-debugger": "off",
	"no-duplicate-case": "error",
	"no-duplicate-imports": "off", // Doesn't work with TypeScript
	"no-empty": "off",
	"no-eval": "error",
	"no-extra-semi": "off", // Superseded by @typescript-eslint/no-extra-semi
	"no-fallthrough": "off",
	"no-invalid-regexp": "error",
	"no-invalid-this": "off", // Superseded by @typescript-eslint/no-invalid-this
	"no-irregular-whitespace": "error",
	"no-magic-numbers": "off", // Superseded by @typescript-eslint/no-magic-numbers
	"no-multi-str": "off",
	"no-multiple-empty-lines": [
		"error",
		{
			max: 1,
			maxBOF: 0,
			maxEOF: 0,
		},
	],
	"no-nested-ternary": "off", // Superseded by unicorn/no-nested-ternary
	"no-new-func": "error",
	"no-new-wrappers": "error",
	"no-octal": "error",
	"no-octal-escape": "error",
	"no-param-reassign": "error",
	"no-redeclare": "off", // Superseded by @typescript-eslint/no-redeclare
	"no-regex-spaces": "error",
	"no-restricted-syntax": [
		"error",
		{
			selector: "ExportAllDeclaration",
			message:
				"Exporting * is not permitted. You should export only named items you intend to export.",
		},
		"ForInStatement",
	],
	"no-sequences": "error",
	"no-shadow": "off", // Superseded by @typescript-eslint/no-shadow
	"no-sparse-arrays": "error",
	"no-template-curly-in-string": "error",
	"no-throw-literal": "off", // Superseded by @typescript-eslint/only-throw-error
	"no-trailing-spaces": "error",
	"no-undef-init": "error",
	"no-underscore-dangle": "off",
	"no-unsafe-finally": "error",
	"no-unused-expressions": "off", // Superseded by @typescript-eslint/no-unused-expressions
	"no-unused-labels": "error",
	"no-unused-vars": "off", // Superseded by @typescript-eslint/no-unused-vars
	"no-var": "error",
	"no-void": "off",
	"no-whitespace-before-property": "error",
	"object-curly-spacing": "off", // Superseded by @typescript-eslint/object-curly-spacing
	"object-shorthand": "error",
	"one-var": ["error", "never"],
	"padded-blocks": ["error", "never"],
	"padding-line-between-statements": [
		"off",
		{
			blankLine: "always",
			prev: "*",
			next: "return",
		},
	],
	"prefer-arrow-callback": "error",
	"prefer-const": "error",
	"prefer-object-spread": "error",
	"prefer-promise-reject-errors": "error",
	"prefer-template": "error",
	"quote-props": ["error", "consistent-as-needed"],
	"quotes": "off", // Superseded by @typescript-eslint/quotes
	"radix": "error",
	"require-await": "off", // Superseded by @typescript-eslint/require-await
	"semi": "off", // Superseded by @typescript-eslint/semi
	"semi-spacing": "error",
	"space-before-blocks": "error",
	"space-before-function-paren": "off", // Superseded by @typescript-eslint/space-before-function-paren
	"space-infix-ops": "off", // Superseded by @typescript-eslint/space-infix-ops
	"space-in-parens": ["error", "never"],
	"spaced-comment": [
		"error",
		"always",
		{
			block: {
				markers: ["!"],
				balanced: true,
			},
		},
	],
	"use-isnan": "error",
	"valid-typeof": "off",
	"yoda": "off",

	// #endregion
};

/**
 * eslint-comments/recommended rules.
 */
export const eslintCommentsRecommendedRules: Linter.RulesRecord = {
	"@eslint-community/eslint-comments/disable-enable-pair": "error",
	"@eslint-community/eslint-comments/no-aggregating-enable": "error",
	"@eslint-community/eslint-comments/no-duplicate-disable": "error",
	"@eslint-community/eslint-comments/no-unlimited-disable": "error",
	"@eslint-community/eslint-comments/no-unused-enable": "error",
};
