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

import {
	restrictedImportPaths,
	restrictedImportPatternsForProductionCode,
	permittedImports,
} from "../constants.mjs";

/**
 * Base rules.
 *
 * Includes rules from eslint:recommended, @typescript-eslint/recommended-type-checked,
 * @typescript-eslint/stylistic-type-checked, import-x/recommended, import-x/typescript,
 * and the former minimal-deprecated rules (TypeScript, JSDoc/TSDoc, import restrictions,
 * Fluid-specific custom rules).
 */
export const baseRules = {
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
	// In some cases, type inference can be wrong, and this can cause a "flip-flop" of type changes in our
	// API documentation. For example, type inference might decide a function returns a concrete type
	// instead of an interface. This has no runtime impact, but would cause compilation problems.
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
	"@typescript-eslint/no-dynamic-delete": "error",
	"@typescript-eslint/no-empty-function": "off",
	"@typescript-eslint/no-empty-object-type": [
		"error",
		{ allowInterfaces: "with-single-extends" },
	],
	"@typescript-eslint/no-explicit-any": [
		"warn",
		{
			ignoreRestArgs: true,
		},
	],
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
	"@typescript-eslint/no-unsafe-argument": "warn",
	"@typescript-eslint/no-unsafe-assignment": "warn",
	"@typescript-eslint/no-unsafe-call": "warn",
	"@typescript-eslint/no-unsafe-member-access": "warn",
	"@typescript-eslint/no-unsafe-return": "warn",
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

	/**
	 * Requires explicit typing for anything exported from a module.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/explicit-module-boundary-types": "warn",

	/**
	 * Note: will be promoted to an error in the future.
	 */
	"@typescript-eslint/consistent-type-exports": [
		"warn",
		{
			fixMixedExportsWithInlineTypeSpecifier: true,
		},
	],

	/**
	 * Enforces consistent usage of `import type` for type-only imports.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],

	/**
	 * Ensures that type-only import statements do not result in runtime side-effects.
	 */
	"@typescript-eslint/no-import-type-side-effects": "error",

	"@typescript-eslint/no-restricted-imports": [
		"error",
		{
			paths: restrictedImportPaths,
			patterns: restrictedImportPatternsForProductionCode,
		},
	],

	/**
	 * RATIONALE: Harmless.
	 *
	 * Our guideline is to only use leading underscores on private members when required to avoid a conflict
	 * between private fields and a public property.
	 */
	"@typescript-eslint/naming-convention": [
		"error",
		{
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
		},
	],

	"@typescript-eslint/explicit-member-accessibility": "off",
	"@typescript-eslint/member-ordering": "off",
	"@typescript-eslint/no-use-before-define": "off",
	"@typescript-eslint/typedef": "off",

	/**
	 * Disabled because we want to encourage documenting different events separately.
	 */
	"@typescript-eslint/unified-signatures": "off",

	// Requires a lot of changes
	"@typescript-eslint/no-duplicate-type-constituents": "off",

	// Lots of false positives
	"@typescript-eslint/non-nullable-type-assertion-style": "off",

	// Requires breaking changes; enabled in the strict config
	"@typescript-eslint/consistent-indexed-object-style": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/no-unsafe-enum-comparison": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/no-redundant-type-constituents": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/consistent-generic-constructors": "off",

	/**
	 * Disabled because we don't require that all variable declarations be explicitly typed.
	 */
	"@rushstack/typedef-var": "off",

	/**
	 * The @rushstack rules are documented in the package README:
	 * {@link https://www.npmjs.com/package/@rushstack/eslint-plugin}
	 */
	"@rushstack/no-new-null": "warn",

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
	"import-x/no-deprecated": "error",
	"import-x/no-extraneous-dependencies": "error",
	/**
	 * Allow Fluid Framework to import from its own internal packages.
	 * https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-internal-modules.md
	 */
	"import-x/no-internal-modules": [
		"error",
		{
			allow: permittedImports,
		},
	],
	/**
	 * By default, libraries should not take dependencies on node libraries.
	 * This rule can be disabled at the project level for libraries that are intended to be used only in node.
	 */
	"import-x/no-nodejs-modules": ["error"],
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
	/**
	 * Warns if separators are inconsistent in number literals that contain separators.
	 */
	"unicorn/numeric-separators-style": ["warn", { onlyIfContainsSeparator: true }],
	"unicorn/prefer-switch": "error",
	"unicorn/prefer-ternary": "error",
	"unicorn/prefer-type-error": "error",
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
	/**
	 * Disabled as it conflicts with biome formatting.
	 */
	"max-len": "off",
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
	"no-empty": "error",
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
	"no-multi-spaces": [
		"error",
		{
			ignoreEOLComments: true,
		},
	],
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
	"no-void": "warn",
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
	"require-atomic-updates": "warn",
	"use-isnan": "error",
	"valid-typeof": "error",
	"yoda": "off",

	// #endregion

	// #region unused-imports

	/**
	 * Note: this can be replaced altogether by `@typescript-eslint/no-unused-vars`,
	 * but that rule covers many more scenarios than this one does, and there are many violations
	 * currently in the repository, so it has not been enabled yet.
	 */
	"unused-imports/no-unused-imports": "error",

	// #endregion

	// #region promise

	/**
	 * Catches a common coding mistake where "resolve" and "reject" are confused.
	 */
	"promise/param-names": "warn",

	// #endregion

	// #region tsdoc/jsdoc

	/**
	 * This rule ensures that our Intellisense looks good by verifying the TSDoc syntax.
	 */
	"tsdoc/syntax": "error",

	/**
	 * Ensures that conflicting access tags don't exist in the same comment.
	 */
	"jsdoc/check-access": "error",

	/**
	 * Ensures consistent line formatting in JSDoc/TSDoc comments.
	 * TODO: This is temporarily set to "warn" because there are a lot of false positives with code blocks.
	 */
	"jsdoc/check-line-alignment": "warn",

	/**
	 * The syntax this validates does not accommodate the syntax used by API-Extractor.
	 */
	"jsdoc/check-examples": "off",

	/**
	 * Ensures correct indentation within JSDoc/TSDoc comment body.
	 */
	"jsdoc/check-indentation": "error",

	/**
	 * Covered by `tsdoc/syntax`.
	 */
	"jsdoc/check-tag-names": "off",

	/**
	 * Ensures that JSDoc/TSDoc "modifier" tags are empty.
	 */
	"jsdoc/empty-tags": "error",

	/**
	 * Ensures JSDoc/TSDoc comments use consistent formatting.
	 */
	"jsdoc/multiline-blocks": ["error"],

	/**
	 * Ensures multi-line formatting meets JSDoc/TSDoc requirements.
	 */
	"jsdoc/no-bad-blocks": "error",

	/**
	 * Requires that each line in a JSDoc/TSDoc comment starts with a `*`.
	 */
	"jsdoc/require-asterisk-prefix": "error",

	/**
	 * Ensure function/method parameter comments include a `-` between name and description.
	 */
	"jsdoc/require-hyphen-before-param-description": "error",

	/**
	 * Require `@param` tags be non-empty.
	 */
	"jsdoc/require-param-description": "error",

	/**
	 * Requires `@returns` tags to be non-empty.
	 */
	"jsdoc/require-returns-description": "error",

	// #endregion

	// #region Fluid Custom Rules

	// #endregion
} as const satisfies Linter.RulesRecord;

/**
 * eslint-comments/recommended rules.
 */
export const eslintCommentsRecommendedRules = {
	"@eslint-community/eslint-comments/disable-enable-pair": "error",
	"@eslint-community/eslint-comments/no-aggregating-enable": "error",
	"@eslint-community/eslint-comments/no-duplicate-disable": "error",
	"@eslint-community/eslint-comments/no-unlimited-disable": "error",
	"@eslint-community/eslint-comments/no-unused-enable": "error",
} as const satisfies Linter.RulesRecord;
