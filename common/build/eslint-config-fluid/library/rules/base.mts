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
	// #region Fluid Custom Rules (from base.js)
	"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "error",
	"@fluid-internal/fluid/no-file-path-links-in-jsdoc": "error",
	"@fluid-internal/fluid/no-markdown-links-in-jsdoc": "error",

	// #region @typescript-eslint (from base.js)
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

	// @eslint-community/eslint-plugin-eslint-comments
	"@eslint-community/eslint-comments/disable-enable-pair": [
		"error",
		{
			allowWholeFile: true,
		},
	],

	// #region eslint-plugin-import-x (from base.js)
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
				caseInsensitive: false,
			},
		},
	],

	// eslint-plugin-unicorn (from base.js)
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
	"unicorn/no-for-loop": "off",
	"unicorn/no-new-buffer": "error",
	"unicorn/expiring-todo-comments": "off",

	// eslint core rules (from base.js)
	"arrow-body-style": "off",
	"arrow-parens": ["error", "always"],
	"camelcase": "off",
	"brace-style": "off",
	"capitalized-comments": "off",
	"comma-dangle": "off",
	"comma-spacing": "off",
	"complexity": "off",
	"constructor-super": "error",
	"curly": "error",
	"default-case": "error",
	"dot-notation": "off",
	"eol-last": "error",
	"eqeqeq": ["error", "smart"],
	"func-call-spacing": "off",
	"guard-for-in": "error",
	"id-match": "error",
	"linebreak-style": "off",
	"keyword-spacing": "off",
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
	"no-duplicate-imports": "off",
	"no-empty": "off",
	"no-eval": "error",
	"no-extra-semi": "off",
	"no-fallthrough": "off",
	"no-invalid-regexp": "error",
	"no-invalid-this": "off",
	"no-irregular-whitespace": "error",
	"no-magic-numbers": "off",
	"no-multi-str": "off",
	"no-multiple-empty-lines": [
		"error",
		{
			max: 1,
			maxBOF: 0,
			maxEOF: 0,
		},
	],
	"no-nested-ternary": "off",
	"no-new-func": "error",
	"no-new-wrappers": "error",
	"no-octal": "error",
	"no-octal-escape": "error",
	"no-param-reassign": "error",
	"no-redeclare": "off",
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
	"no-shadow": "off",
	"no-sparse-arrays": "error",
	"no-template-curly-in-string": "error",
	"no-throw-literal": "off",
	"no-trailing-spaces": "error",
	"no-undef-init": "error",
	"no-underscore-dangle": "off",
	"no-unsafe-finally": "error",
	"no-unused-expressions": "off",
	"no-unused-labels": "error",
	"no-unused-vars": "off",
	"no-var": "error",
	"no-void": "off",
	"no-whitespace-before-property": "error",
	"object-curly-spacing": "off",
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
	"quotes": "off",
	"radix": "error",
	"require-await": "off",
	"semi": "off",
	"semi-spacing": "error",
	"space-before-blocks": "error",
	"space-before-function-paren": "off",
	"space-infix-ops": "off",
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
