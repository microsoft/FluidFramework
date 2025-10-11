/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base flat configuration from which all of our exported flat configs extend.
 */
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintCommentsPlugin from "eslint-plugin-eslint-comments";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			ecmaVersion: 2018,
			sourceType: "module",
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
				project: "./tsconfig.json",
			},
			globals: {
				Atomics: "readonly",
				SharedArrayBuffer: "readonly",
			},
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		plugins: {
			"eslint-comments": eslintCommentsPlugin,
			"import": importPlugin,
		},
		settings: {
			"import/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			"import/parsers": {
				"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"],
			},
			"import/resolver": {
				node: {
					extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
				},
			},
		},
		rules: {
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
			"@typescript-eslint/brace-style": "off",
			"@typescript-eslint/comma-dangle": ["error", "always-multiline"],
			"@typescript-eslint/comma-spacing": "off",
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
			"@typescript-eslint/func-call-spacing": "off",
			"@typescript-eslint/keyword-spacing": "off",
			"@typescript-eslint/member-delimiter-style": "off",
			"@typescript-eslint/no-dynamic-delete": "error",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-empty-object-type": "error",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-extra-semi": "error",
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
			"@typescript-eslint/no-throw-literal": "error",
			"@typescript-eslint/no-unused-expressions": "error",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-unnecessary-qualifier": "error",
			"@typescript-eslint/no-unnecessary-type-arguments": "error",
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			"@typescript-eslint/no-unsafe-function-type": "error",
			"@typescript-eslint/no-var-requires": "error",
			"@typescript-eslint/object-curly-spacing": "off",
			"@typescript-eslint/prefer-for-of": "error",
			"@typescript-eslint/prefer-function-type": "error",
			"@typescript-eslint/prefer-namespace-keyword": "error",
			"@typescript-eslint/prefer-readonly": "error",
			"@typescript-eslint/promise-function-async": "error",
			"@typescript-eslint/quotes": [
				"error",
				"double",
				{
					allowTemplateLiterals: true,
					avoidEscape: true,
				},
			],
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/restrict-plus-operands": "error",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/return-await": "error",
			"@typescript-eslint/semi": ["error", "always"],
			"@typescript-eslint/space-infix-ops": "error",
			"@typescript-eslint/space-before-function-paren": [
				"error",
				{
					anonymous: "never",
					asyncArrow: "always",
					named: "never",
				},
			],
			"@typescript-eslint/strict-boolean-expressions": "error",
			"@typescript-eslint/triple-slash-reference": "error",
			"@typescript-eslint/type-annotation-spacing": "error",
			"@typescript-eslint/unbound-method": [
				"error",
				{
					ignoreStatic: true,
				},
			],
			"@typescript-eslint/unified-signatures": "error",
			"@typescript-eslint/no-wrapper-object-types": "error",

			// #endregion

			// eslint-plugin-eslint-comments
			"eslint-comments/disable-enable-pair": [
				"error",
				{
					allowWholeFile: true,
				},
			],

			// #region eslint-plugin-import

			"import/no-default-export": "error",
			"import/no-deprecated": "off",
			"import/no-extraneous-dependencies": "error",
			"import/no-internal-modules": "error",
			"import/no-unassigned-import": "error",
			"import/no-unresolved": [
				"error",
				{
					caseSensitive: true,
				},
			],
			"import/no-unused-modules": "error",
			"import/order": [
				"error",
				{
					"newlines-between": "always",
					"alphabetize": {
						order: "asc",
						caseInsensitive: false,
					},
				},
			],

			// #endregion

			// eslint
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
		},
	},
	{
		// Rules only for TypeScript files
		files: ["**/*.ts", "**/*.tsx"],
		rules: {
			"@typescript-eslint/indent": "off",
			"func-call-spacing": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
		},
	},
	{
		// Rules only for type validation files
		files: ["**/types/*validate*Previous*.ts"],
		rules: {
			"@typescript-eslint/comma-spacing": "off",
		},
	},
);
