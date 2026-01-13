/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Native ESLint 9 flat config implementation.
 *
 * This configuration imports plugins directly (without FlatCompat) and copies rules
 * verbatim from the legacy config files to ensure functional equivalence.
 *
 * Reference files:
 * - base.js (lower-level rules, settings)
 * - minimal-deprecated.js (extends base, adds more rules)
 * - recommended.js (extends minimal-deprecated, adds unicorn/recommended and more rules)
 * - strict.js (extends recommended, adds stricter rules)
 */

import eslintJs from "@eslint/js";
import eslintCommentsPlugin from "@eslint-community/eslint-plugin-eslint-comments";
import fluidPlugin from "@fluid-internal/eslint-plugin-fluid";
import rushstackPlugin from "@rushstack/eslint-plugin";
import tseslint from "typescript-eslint";
import dependPlugin from "eslint-plugin-depend";
import importXPlugin from "eslint-plugin-import-x";
import jsdocPlugin from "eslint-plugin-jsdoc";
import promisePlugin from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tsdocPlugin from "eslint-plugin-tsdoc";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import prettierConfig from "eslint-config-prettier";
import biomeConfig from "eslint-config-biome";
import type { Linter } from "eslint";

type FlatConfigArray = Linter.Config[];

// =============================================================================
// SHARED CONSTANTS (from minimal-deprecated.js)
// =============================================================================

/**
 * Shared list of permitted imports for configuring the `import-x/no-internal-modules` rule.
 */
const permittedImports = [
	// Within Fluid Framework allow import of '/internal' from other FF packages.
	"@fluid-example/*/internal",
	"@fluid-experimental/*/internal",
	"@fluid-internal/*/internal",
	"@fluid-private/*/internal",
	"@fluid-tools/*/internal",
	"@fluidframework/*/internal",

	// Allow /legacy imports for backwards compatibility during API transition
	"@fluid-example/*/legacy",
	"@fluid-experimental/*/legacy",
	"@fluid-internal/*/legacy",
	"@fluid-private/*/legacy",
	"@fluid-tools/*/legacy",
	"@fluidframework/*/legacy",

	// Experimental package APIs and exports are unknown, so allow any imports from them.
	"@fluid-experimental/**",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",
];

// Restricted import paths for all code (from minimal-deprecated.js)
const restrictedImportPaths = [
	// Prefer strict assertions
	// See: <https://nodejs.org/api/assert.html#strict-assertion-mode>
	{
		name: "assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
	{
		name: "node:assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
];

// Restricted import patterns for production code.
// Not applied to test code.
const restrictedImportPatternsForProductionCode = [
	// Don't import from the parent index file.
	{
		group: ["./index.js", "**/../index.js"],
		message:
			"Importing from a parent index file tends to cause cyclic dependencies. Import from a more specific sibling file instead.",
	},
];

// Test file patterns (from minimal-deprecated.js)
const testFilePatterns = ["*.spec.ts", "*.test.ts", "**/test/**", "**/tests/**"];

// =============================================================================
// GLOBAL IGNORES
// =============================================================================

const globalIgnores: Linter.Config = {
	ignores: [
		// Build output directories
		"**/dist/**",
		"**/lib/**",
		"**/build/**",

		// Dependencies
		"**/node_modules/**",

		// Generated files (from minimal-deprecated.js ignorePatterns)
		"**/packageVersion.ts",
		"**/layerGenerationState.ts",
		"**/*.generated.ts",
		"**/*.generated.js",

		// Common non-source directories
		"**/coverage/**",
		"**/.nyc_output/**",
	],
};

// =============================================================================
// SETTINGS (from base.js)
// =============================================================================

const importXSettings = {
	"import-x/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
	"import-x/parsers": {
		"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts", ".cts", ".mts"],
	},
	"import-x/resolver": {
		typescript: {
			extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			conditionNames: [
				// This supports the test-only conditional export pattern used in merge-tree and id-compressor.
				"allow-ff-test-exports",
				// Default condition names below
				"types",
				"import",
				// APF: https://angular.io/guide/angular-package-format
				"esm2020",
				"es2020",
				"es2015",
				"require",
				"node",
				"node-addons",
				"browser",
				"default",
			],
		},
	},
};

const jsdocSettings = {
	jsdoc: {
		// The following are intended to keep js/jsx JSDoc comments in line with TSDoc syntax used in ts/tsx code.
		tagNamePreference: {
			arg: {
				message: "Please use @param instead of @arg.",
				replacement: "param",
			},
			argument: {
				message: "Please use @param instead of @argument.",
				replacement: "param",
			},
			return: {
				message: "Please use @returns instead of @return.",
				replacement: "returns",
			},
		},
	},
};

// =============================================================================
// BASE RULES (from base.js)
// Rules from eslint:recommended, @typescript-eslint/recommended-type-checked,
// @typescript-eslint/stylistic-type-checked, import-x/recommended, import-x/typescript
// =============================================================================

const baseRules: Linter.RulesRecord = {
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

// =============================================================================
// MINIMAL-DEPRECATED RULES (from minimal-deprecated.js)
// =============================================================================

const minimalDeprecatedRules: Linter.RulesRecord = {
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

	// Disabled intentionally (from minimal-deprecated.js)
	"@rushstack/typedef-var": "off",
	"@typescript-eslint/explicit-member-accessibility": "off",
	"@typescript-eslint/member-ordering": "off",
	"@typescript-eslint/no-explicit-any": "off",
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
	"@typescript-eslint/consistent-type-exports": "off",
	"@typescript-eslint/consistent-type-imports": "off",
	"func-call-spacing": "off",
	"no-void": "off",
	"require-atomic-updates": "off",
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

// =============================================================================
// RECOMMENDED RULES (from recommended.js)
// =============================================================================

const recommendedRules: Linter.RulesRecord = {
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

// =============================================================================
// STRICT RULES (from strict.js)
// =============================================================================

const strictRules: Linter.RulesRecord = {
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

const strictTsRules: Linter.RulesRecord = {
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

// =============================================================================
// eslint-plugin-depend configuration
// =============================================================================

const dependConfig: Linter.Config = {
	plugins: {
		depend: dependPlugin,
	},
	rules: {
		"depend/ban-dependencies": [
			"error",
			{
				allowed: ["axios", "fs-extra"],
			},
		],
	},
};

// =============================================================================
// CONFIG BUILDERS
// =============================================================================

function buildBaseConfig(): FlatConfigArray {
	return [
		globalIgnores,
		// eslint:recommended
		eslintJs.configs.recommended,
		// @typescript-eslint/recommended-type-checked and stylistic-type-checked
		...tseslint.configs.recommendedTypeChecked,
		...tseslint.configs.stylisticTypeChecked,
		// import-x/recommended and import-x/typescript
		importXPlugin.flatConfigs.recommended,
		importXPlugin.flatConfigs.typescript,
		// Base config with all plugins and custom rules
		{
			plugins: {
				"@eslint-community/eslint-comments": eslintCommentsPlugin,
				"@fluid-internal/fluid": fluidPlugin,
				"@rushstack": rushstackPlugin,
				"jsdoc": jsdocPlugin,
				"promise": promisePlugin,
				"tsdoc": tsdocPlugin,
				"unicorn": unicornPlugin,
				"unused-imports": unusedImportsPlugin,
			},
			settings: {
				...importXSettings,
				...jsdocSettings,
			},
			rules: {
				// @eslint-community/eslint-comments/recommended rules
				"@eslint-community/eslint-comments/disable-enable-pair": "error",
				"@eslint-community/eslint-comments/no-aggregating-enable": "error",
				"@eslint-community/eslint-comments/no-duplicate-disable": "error",
				"@eslint-community/eslint-comments/no-unlimited-disable": "error",
				"@eslint-community/eslint-comments/no-unused-enable": "error",
				...baseRules,
			},
		},
		// TypeScript file override from base.js (lines 328-343)
		// These rules are disabled by default but re-enabled in recommended.js
		{
			files: ["**/*.ts", "**/*.tsx"],
			rules: {
				"@typescript-eslint/indent": "off",
				"func-call-spacing": "off",
				// TODO: Enable these ASAP (from base.js)
				"@typescript-eslint/explicit-module-boundary-types": "off",
				"@typescript-eslint/no-unsafe-argument": "off",
				"@typescript-eslint/no-unsafe-assignment": "off",
				"@typescript-eslint/no-unsafe-call": "off",
				"@typescript-eslint/no-unsafe-member-access": "off",
			},
		},
		// Prettier disables conflicting rules - must come after custom rules
		prettierConfig,
	];
}

function buildMinimalDeprecatedConfig(): FlatConfigArray {
	return [
		...buildBaseConfig(),
		{
			rules: minimalDeprecatedRules,
		},
		// TypeScript file override (from minimal-deprecated.js)
		{
			files: ["**/*.ts", "**/*.tsx"],
			rules: {
				"dot-notation": "off",
				"no-unused-expressions": "off",
			},
			settings: {
				jsdoc: {
					mode: "typescript",
				},
			},
		},
		dependConfig,
	];
}

function buildRecommendedConfig(): FlatConfigArray {
	return [
		...buildMinimalDeprecatedConfig(),
		// unicorn/recommended rules (plugin already registered in base)
		{
			rules: unicornPlugin.configs["flat/recommended"].rules,
		},
		{
			rules: recommendedRules,
		},
		// Type validation files override (from recommended.js)
		{
			files: ["**/types/*validate*Previous*.ts"],
			rules: {
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/no-unsafe-argument": "off",
			},
		},
	];
}

function buildStrictConfig(): FlatConfigArray {
	return [
		...buildRecommendedConfig(),
		{
			rules: strictRules,
		},
		// TypeScript file override for strict (from strict.js)
		{
			files: ["**/*.ts", "**/*.tsx"],
			rules: strictTsRules,
		},
	];
}

function buildStrictBiomeConfig(): FlatConfigArray {
	return [...buildStrictConfig(), biomeConfig];
}

// =============================================================================
// SHARED CONFIG ADDITIONS
// These are added to all configs (matching flat.mts behavior)
// =============================================================================

/**
 * Use projectService for automatic tsconfig discovery instead of manual project configuration.
 */
const useProjectService: Linter.Config = {
	files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
	languageOptions: {
		parserOptions: {
			projectService: true,
		},
	},
};

/**
 * Test file configuration with explicit project paths and rule overrides.
 */
const testProjectConfig: Linter.Config = {
	files: ["src/test/**", ...testFilePatterns],
	languageOptions: {
		parserOptions: {
			projectService: false,
			project: ["./tsconfig.json", "./src/test/tsconfig.json"],
		},
	},
	rules: {
		"@typescript-eslint/no-invalid-this": "off",
		"@typescript-eslint/unbound-method": "off",
		"import-x/no-nodejs-modules": "off",
		"import-x/no-deprecated": "off",
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/consistent-type-imports": "off",
		"@typescript-eslint/no-restricted-imports": [
			"error",
			{
				paths: restrictedImportPaths,
			},
		],
		"import-x/no-internal-modules": [
			"error",
			{
				allow: ["@fluid*/*/test*", "@fluid*/*/internal/test*"].concat(permittedImports),
			},
		],
		"import-x/no-extraneous-dependencies": ["error", { devDependencies: true }],
	},
};

/**
 * Override import-x/no-internal-modules for non-test files to include /legacy imports.
 */
const internalModulesConfig: Linter.Config = {
	files: [
		"**/*.ts",
		"**/*.tsx",
		"**/*.mts",
		"**/*.cts",
		"**/*.js",
		"**/*.jsx",
		"**/*.mjs",
		"**/*.cjs",
	],
	ignores: ["src/test/**", ...testFilePatterns],
	rules: {
		"import-x/no-internal-modules": [
			"error",
			{
				allow: permittedImports,
			},
		],
	},
};

/**
 * React rules for ESLint 9 - extends react/recommended and react-hooks/recommended.
 */
const reactConfig: FlatConfigArray = [
	// react/flat.recommended
	{
		files: ["**/*.jsx", "**/*.tsx"],
		...reactPlugin.configs.flat.recommended,
	},
	// react-hooks/recommended rules (from minimal-deprecated.js lines 451)
	{
		files: ["**/*.jsx", "**/*.tsx"],
		plugins: {
			"react-hooks": reactHooksPlugin,
		},
		rules: reactHooksPlugin.configs.recommended.rules,
		settings: {
			react: {
				version: "detect",
			},
		},
	},
	// Custom overrides from minimal-deprecated.js (lines 453-459)
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react-hooks/immutability": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/static-components": "warn",
		},
	},
];

/**
 * CommonJS files can use __dirname and require.
 */
const cjsFileConfig: Linter.Config = {
	files: ["**/*.cts", "**/*.cjs"],
	rules: {
		"unicorn/prefer-module": "off",
	},
};

/**
 * Disable type-aware parsing for JS files and .d.ts files.
 */
const jsNoProject: Linter.Config = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
	languageOptions: { parserOptions: { project: null, projectService: false } },
};

/**
 * Disable type-required @typescript-eslint rules for pure JS files and .d.ts files.
 */
const jsTypeAwareDisable: Linter.Config = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
	rules: {
		"@typescript-eslint/await-thenable": "off",
		"@typescript-eslint/consistent-return": "off",
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/dot-notation": "off",
		"@typescript-eslint/naming-convention": "off",
		"@typescript-eslint/no-array-delete": "off",
		"@typescript-eslint/no-base-to-string": "off",
		"@typescript-eslint/no-confusing-void-expression": "off",
		"@typescript-eslint/no-deprecated": "off",
		"@typescript-eslint/no-duplicate-type-constituents": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-for-in-array": "off",
		"@typescript-eslint/no-implied-eval": "off",
		"@typescript-eslint/no-meaningless-void-operator": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/no-mixed-enums": "off",
		"@typescript-eslint/no-redundant-type-constituents": "off",
		"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
		"@typescript-eslint/no-unnecessary-condition": "off",
		"@typescript-eslint/no-unnecessary-qualifier": "off",
		"@typescript-eslint/no-unnecessary-template-expression": "off",
		"@typescript-eslint/no-unnecessary-type-arguments": "off",
		"@typescript-eslint/no-unnecessary-type-assertion": "off",
		"@typescript-eslint/no-unnecessary-type-parameters": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-enum-comparison": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-unsafe-type-assertion": "off",
		"@typescript-eslint/no-unsafe-unary-minus": "off",
		"@typescript-eslint/non-nullable-type-assertion-style": "off",
		"@typescript-eslint/only-throw-error": "off",
		"@typescript-eslint/prefer-destructuring": "off",
		"@typescript-eslint/prefer-find": "off",
		"@typescript-eslint/prefer-includes": "off",
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/prefer-optional-chain": "off",
		"@typescript-eslint/prefer-promise-reject-errors": "off",
		"@typescript-eslint/prefer-readonly": "off",
		"@typescript-eslint/prefer-readonly-parameter-types": "off",
		"@typescript-eslint/prefer-reduce-type-parameter": "off",
		"@typescript-eslint/prefer-regexp-exec": "off",
		"@typescript-eslint/prefer-return-this-type": "off",
		"@typescript-eslint/prefer-string-starts-ends-with": "off",
		"@typescript-eslint/promise-function-async": "off",
		"@typescript-eslint/related-getter-setter-pairs": "off",
		"@typescript-eslint/require-array-sort-compare": "off",
		"@typescript-eslint/require-await": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/return-await": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/switch-exhaustiveness-check": "off",
		"@typescript-eslint/unbound-method": "off",
		"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
	},
};

/**
 * React file overrides for recommended config (from recommended.js).
 */
const reactRecommendedOverride: Linter.Config = {
	files: ["**/*.jsx", "**/*.tsx"],
	rules: {
		"unicorn/consistent-function-scoping": "off",
	},
};

/**
 * Test file overrides for recommended config (from recommended.js).
 */
const testRecommendedOverride: Linter.Config = {
	files: testFilePatterns,
	rules: {
		"unicorn/consistent-function-scoping": "off",
		"unicorn/prefer-module": "off",
	},
};

function addSharedConfigs(configs: FlatConfigArray): FlatConfigArray {
	return [
		...configs,
		useProjectService,
		testProjectConfig,
		internalModulesConfig,
		...reactConfig,
		cjsFileConfig,
		jsNoProject,
		jsTypeAwareDisable,
	];
}

// =============================================================================
// EXPORTS
// =============================================================================

const minimalDeprecated: FlatConfigArray = addSharedConfigs(buildMinimalDeprecatedConfig());
const recommended: FlatConfigArray = addSharedConfigs([
	...buildRecommendedConfig(),
	reactRecommendedOverride,
	testRecommendedOverride,
]);
const strict: FlatConfigArray = addSharedConfigs([
	...buildStrictConfig(),
	reactRecommendedOverride,
	testRecommendedOverride,
]);
const strictBiome: FlatConfigArray = addSharedConfigs([
	...buildStrictBiomeConfig(),
	reactRecommendedOverride,
	testRecommendedOverride,
]);

export { recommended, strict, minimalDeprecated, strictBiome };
