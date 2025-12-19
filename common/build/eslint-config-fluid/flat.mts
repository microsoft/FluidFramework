/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Native ESLint 9 flat config for Fluid Framework.
 *
 * This module provides ESLint 9 flat configs without using the FlatCompat wrapper.
 * For testing/comparison with the legacy FlatCompat-based config, set the environment variable:
 *
 * ```bash
 * ESLINT_USE_COMPAT=true eslint .
 * ```
 *
 * Consumers can import { recommended, strict } from this module and spread them into their eslint.config.js.
 */

import eslintJs from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
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
import type { Linter } from "eslint";

// Re-export minimalDeprecated from compat for backward compatibility
export { minimalDeprecated } from "./flat-compat.mts";

// Import compat configs for A/B testing
import { recommended as compatRecommended, strict as compatStrict } from "./flat-compat.mts";

type FlatConfigArray = Linter.Config[];

// #region Shared Constants

/**
 * Global ignores for all configs.
 */
const globalIgnores: Linter.Config = {
	ignores: [
		"**/dist/**",
		"**/lib/**",
		"**/build/**",
		"**/node_modules/**",
		"**/packageVersion.ts",
		"**/layerGenerationState.ts",
		"**/*.generated.ts",
		"**/*.generated.js",
		"**/coverage/**",
		"**/.nyc_output/**",
	],
};

/**
 * Permitted imports for `import-x/no-internal-modules` rule.
 */
const permittedImports = [
	// Allow /internal and /legacy imports from FF packages
	"@fluid-example/*/internal",
	"@fluid-experimental/*/internal",
	"@fluid-internal/*/internal",
	"@fluid-private/*/internal",
	"@fluid-tools/*/internal",
	"@fluidframework/*/internal",
	"@fluid-example/*/legacy",
	"@fluid-experimental/*/legacy",
	"@fluid-internal/*/legacy",
	"@fluid-private/*/legacy",
	"@fluid-tools/*/legacy",
	"@fluidframework/*/legacy",
	"@fluid-experimental/**",
	"*/index.js",
];

const restrictedImportPaths = [
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

const restrictedImportPatternsForProductionCode = [
	{
		group: ["./index.js", "**/../index.js"],
		message:
			"Importing from a parent index file tends to cause cyclic dependencies. Import from a more specific sibling file instead.",
	},
];

const testFilePatterns = ["src/test/**", "*.spec.ts", "*.test.ts", "**/test/**", "**/tests/**"];
const tsFilePatterns = ["**/*.ts", "**/*.tsx"];
const allTsFilePatterns = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const allSourcePatterns = [
	"**/*.ts",
	"**/*.tsx",
	"**/*.mts",
	"**/*.cts",
	"**/*.js",
	"**/*.jsx",
	"**/*.mjs",
	"**/*.cjs",
];

// #endregion

// #region Rule Sets

/**
 * Base rules applied to all configurations.
 * Combines Fluid-specific, TypeScript, import, documentation, and core ESLint rules.
 */
const baseRules: Linter.RulesRecord = {
	// Fluid-specific rules
	"@fluid-internal/fluid/no-file-path-links-in-jsdoc": "error",
	"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "error",
	"@fluid-internal/fluid/no-markdown-links-in-jsdoc": "error",
	"@fluid-internal/fluid/no-member-release-tags": "error",
	"@fluid-internal/fluid/no-unchecked-record-access": "error",

	// @rushstack rules
	"@rushstack/no-new-null": "warn",
	"@rushstack/typedef-var": "off",

	"@eslint-community/eslint-comments/disable-enable-pair": [
		"error",
		{
			allowWholeFile: true,
		},
	],

	// TypeScript-ESLint rules
	"@typescript-eslint/consistent-type-assertions": [
		"error",
		{ assertionStyle: "as", objectLiteralTypeAssertions: "never" },
	],
	"@typescript-eslint/no-dynamic-delete": "error",
	"@typescript-eslint/no-empty-function": "off",
	"@typescript-eslint/no-extraneous-class": "error",
	"@typescript-eslint/no-inferrable-types": "off",
	"@typescript-eslint/no-invalid-this": "off",
	"@typescript-eslint/no-magic-numbers": "off",
	"@typescript-eslint/no-shadow": ["error", { hoist: "all", ignoreTypeValueShadow: true }],
	"@typescript-eslint/no-unnecessary-qualifier": "error",
	"@typescript-eslint/no-unnecessary-type-arguments": "error",
	"@typescript-eslint/prefer-readonly": "error",
	"@typescript-eslint/promise-function-async": "error",
	"@typescript-eslint/require-await": "off",
	"@typescript-eslint/restrict-template-expressions": "off",
	"@typescript-eslint/return-await": "error",
	"@typescript-eslint/strict-boolean-expressions": "error",
	"@typescript-eslint/unbound-method": ["error", { ignoreStatic: true }],
	"@typescript-eslint/unified-signatures": "off",
	"@typescript-eslint/naming-convention": [
		"error",
		{
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
		},
	],
	"@typescript-eslint/no-non-null-assertion": "error",
	"@typescript-eslint/no-restricted-imports": [
		"error",
		{ paths: restrictedImportPaths, patterns: restrictedImportPatternsForProductionCode },
	],
	"@typescript-eslint/consistent-generic-constructors": "off",
	"@typescript-eslint/consistent-indexed-object-style": "off",
	"@typescript-eslint/explicit-member-accessibility": "off",
	"@typescript-eslint/member-ordering": "off",
	"@typescript-eslint/no-duplicate-type-constituents": "off",
	"@typescript-eslint/no-redundant-type-constituents": "off",
	"@typescript-eslint/no-unsafe-enum-comparison": "off",
	"@typescript-eslint/no-unused-vars": "off",
	"@typescript-eslint/no-use-before-define": "off",
	"@typescript-eslint/non-nullable-type-assertion-style": "off",
	"@typescript-eslint/typedef": "off",

	// Import rules
	"import-x/default": "error",
	"import-x/export": "error",
	"import-x/named": "off", // TypeScript handles this
	"import-x/namespace": "error",
	"import-x/no-duplicates": "warn",
	"import-x/no-named-as-default": "warn",
	"import-x/no-named-as-default-member": "warn",
	"import-x/no-default-export": "error",
	"import-x/no-deprecated": "error",
	"import-x/no-extraneous-dependencies": "error",
	"import-x/no-internal-modules": ["error", { allow: permittedImports }],
	"import-x/no-nodejs-modules": "error",
	"import-x/no-unassigned-import": "error",
	"import-x/no-unresolved": ["error", { caseSensitive: true }],
	"import-x/no-unused-modules": "error",
	"import-x/order": [
		"error",
		{
			"newlines-between": "ignore",
			"groups": [["builtin", "external", "internal", "parent", "sibling", "index"]],
		},
	],

	// JSDoc and TSDoc rules
	"jsdoc/check-access": "error",
	"jsdoc/check-examples": "off",
	"jsdoc/check-indentation": "error",
	"jsdoc/check-line-alignment": "warn",
	"jsdoc/check-tag-names": "off",
	"jsdoc/empty-tags": "error",
	"jsdoc/no-bad-blocks": "error",
	"jsdoc/require-asterisk-prefix": "error",
	"jsdoc/require-hyphen-before-param-description": "error",
	"jsdoc/require-param-description": "error",
	"jsdoc/require-returns-description": "error",
	"tsdoc/syntax": "error",

	// Promise plugin
	"promise/param-names": "warn",

	// Unused imports plugin
	"unused-imports/no-unused-imports": "error",

	// Depend plugin
	"depend/ban-dependencies": ["error", { allowed: ["axios", "fs-extra"] }],

	// Unicorn overrides (applied on top of unicorn/recommended in createRecommendedConfig)
	"unicorn/filename-case": ["error", { cases: { camelCase: true, pascalCase: true } }],

	// Core ESLint rules
	"arrow-body-style": "off",
	"arrow-parens": ["error", "always"],
	"brace-style": "off",
	"camelcase": "off",
	"capitalized-comments": "off",
	"comma-dangle": "off",
	"comma-spacing": "off",
	"complexity": "off",
	"curly": "error",
	"default-case": "error",
	"eol-last": "error",
	"eqeqeq": ["error", "smart"],
	"guard-for-in": "error",
	"id-match": "error",
	"keyword-spacing": "off",
	"linebreak-style": "off",
	"max-classes-per-file": "off",
	"max-len": "off",
	"max-lines": "off",
	"new-parens": "error",
	"newline-per-chained-call": "off",
	"no-bitwise": "error",
	"no-caller": "error",
	"no-debugger": "off",
	"no-duplicate-imports": "off",
	"no-eval": "error",
	"no-extra-semi": "off",
	"no-fallthrough": "off",
	"no-invalid-this": "off",
	"no-magic-numbers": "off",
	"no-multi-spaces": ["error", { ignoreEOLComments: true }],
	"no-multi-str": "off",
	"no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
	"no-nested-ternary": "off",
	"no-new-func": "error",
	"no-new-wrappers": "error",
	"no-octal-escape": "error",
	"no-param-reassign": "error",
	"no-redeclare": "off",
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
	"no-template-curly-in-string": "error",
	"no-throw-literal": "off",
	"no-trailing-spaces": "error",
	"no-undef-init": "error",
	"no-underscore-dangle": "off",
	"no-unused-vars": "off",
	"no-var": "error",
	"no-whitespace-before-property": "error",
	"object-curly-spacing": "off",
	"object-shorthand": "error",
	"one-var": ["error", "never"],
	"padded-blocks": ["error", "never"],
	"padding-line-between-statements": ["off", { blankLine: "always", prev: "*", next: "return" }],
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
	"space-in-parens": ["error", "never"],
	"space-infix-ops": "off",
	"spaced-comment": ["error", "always", { block: { markers: ["!"], balanced: true } }],
	"valid-typeof": "error",
	"yoda": "off",
};

/**
 * Unicorn rule overrides (applied on top of unicorn/recommended preset).
 */
const unicornOverrides: Linter.RulesRecord = {
	"unicorn/consistent-function-scoping": "warn",
	"unicorn/empty-brace-spaces": "off",
	"unicorn/expiring-todo-comments": "off",
	"unicorn/filename-case": ["error", { cases: { camelCase: true, pascalCase: true } }],
	"unicorn/import-style": "off",
	"unicorn/no-array-push-push": "off",
	"unicorn/no-for-loop": "off",
	"unicorn/no-nested-ternary": "off",
	"unicorn/no-useless-spread": "off",
	"unicorn/no-useless-undefined": "off",
	"unicorn/number-literal-case": "off",
	"unicorn/numeric-separators-style": ["error", { onlyIfContainsSeparator: true }],
	"unicorn/prefer-at": "warn",
	"unicorn/prefer-event-target": "off",
	"unicorn/prefer-string-raw": "warn",
	"unicorn/prefer-string-replace-all": "warn",
	"unicorn/prefer-structured-clone": "warn",
	"unicorn/prevent-abbreviations": "off",
	"unicorn/template-indent": "off",
};

/**
 * Additional rules for recommended config (beyond base).
 */
const recommendedRules: Linter.RulesRecord = {
	"@rushstack/no-new-null": "error",
	"no-empty": "error",
	"no-void": "error",
	"require-atomic-updates": "error",
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
	"@typescript-eslint/no-explicit-any": ["error", { ignoreRestArgs: true }],
	"@typescript-eslint/explicit-module-boundary-types": "error",
	"@typescript-eslint/no-unsafe-argument": "error",
	"@typescript-eslint/no-unsafe-assignment": "error",
	"@typescript-eslint/no-unsafe-call": "error",
	"@typescript-eslint/no-unsafe-member-access": "error",
	"@typescript-eslint/no-unsafe-return": "error",
	"jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true }],
	"jsdoc/require-description": ["error", { checkConstructors: false }],
	"@typescript-eslint/consistent-type-exports": [
		"error",
		{ fixMixedExportsWithInlineTypeSpecifier: true },
	],
	"@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
	"@typescript-eslint/no-import-type-side-effects": "error",
};

/**
 * Strict-only rules.
 */
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

// #endregion

// #region Config Objects

/**
 * Import-X settings for TypeScript resolution.
 */
const importXSettings = {
	"import-x/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
	"import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx", ".d.ts", ".cts", ".mts"] },
	"import-x/resolver": {
		typescript: {
			extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			conditionNames: [
				"allow-ff-test-exports",
				"types",
				"import",
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
	tagNamePreference: {
		arg: { message: "Please use @param instead of @arg.", replacement: "param" },
		argument: { message: "Please use @param instead of @argument.", replacement: "param" },
		return: { message: "Please use @returns instead of @return.", replacement: "returns" },
	},
};

/**
 * Base config: ESLint core + TypeScript-ESLint + all plugins.
 */
const baseConfig: FlatConfigArray = [
	globalIgnores,
	eslintJs.configs.recommended,
	comments.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,

	// TypeScript parsing
	{
		files: allTsFilePatterns,
		languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true } },
	},

	// Register plugins and apply base rules
	{
		plugins: {
			"@fluid-internal/fluid": fluidPlugin,
			"@rushstack": rushstackPlugin,
			"@typescript-eslint": tseslint.plugin,
			"import-x": importXPlugin,
			"jsdoc": jsdocPlugin,
			"promise": promisePlugin,
			"tsdoc": tsdocPlugin,
			"unicorn": unicornPlugin,
			"unused-imports": unusedImportsPlugin,
			"depend": dependPlugin,
		},
		settings: { ...importXSettings, jsdoc: jsdocSettings },
		rules: baseRules,
	},

	prettierConfig,
];

/**
 * TypeScript file overrides (disable some strict checks for base config).
 */
const tsOverrideConfig: Linter.Config = {
	files: tsFilePatterns,
	settings: { jsdoc: { mode: "typescript" } },
	rules: {
		"@typescript-eslint/indent": "off",
		"func-call-spacing": "off",
		"@typescript-eslint/explicit-module-boundary-types": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
	},
};

/**
 * React/JSX file configuration.
 */
const reactConfig: Linter.Config = {
	files: ["**/*.jsx", "**/*.tsx"],
	plugins: { "react": reactPlugin, "react-hooks": reactHooksPlugin },
	settings: { react: { version: "detect" } },
	rules: {
		...reactPlugin.configs.recommended.rules,
		...reactHooksPlugin.configs.recommended.rules,
		// ESLint 9: New react-hooks rules set to warn for incremental adoption
		"react-hooks/immutability": "warn",
		"react-hooks/refs": "warn",
		"react-hooks/rules-of-hooks": "warn",
		"react-hooks/set-state-in-effect": "warn",
		"react-hooks/static-components": "warn",
		"unicorn/consistent-function-scoping": "off",
	},
};

/**
 * Test file configuration.
 */
const testConfig: Linter.Config = {
	files: testFilePatterns,
	languageOptions: {
		parserOptions: {
			projectService: false,
			project: ["./tsconfig.json", "./src/test/tsconfig.json"],
		},
	},
	rules: {
		"@typescript-eslint/no-invalid-this": "off",
		"@typescript-eslint/unbound-method": "off",
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/consistent-type-imports": "off",
		"@typescript-eslint/no-restricted-imports": ["error", { paths: restrictedImportPaths }],
		"import-x/no-nodejs-modules": "off",
		"import-x/no-deprecated": "off",
		"import-x/no-internal-modules": [
			"error",
			{ allow: ["@fluid*/*/test*", "@fluid*/*/internal/test*", ...permittedImports] },
		],
		"import-x/no-extraneous-dependencies": ["error", { devDependencies: true }],
		"unicorn/consistent-function-scoping": "off",
		"unicorn/prefer-module": "off",
	},
};

/**
 * Type validation files (special linting exceptions).
 */
const typeValidationConfig: Linter.Config = {
	files: ["**/types/*validate*Previous*.ts"],
	rules: {
		"import-x/order": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
	},
};

/**
 * Internal modules config for non-test source files.
 */
const internalModulesConfig: Linter.Config = {
	files: allSourcePatterns,
	ignores: testFilePatterns,
	rules: { "import-x/no-internal-modules": ["error", { allow: permittedImports }] },
};

/**
 * CommonJS files.
 */
const cjsConfig: Linter.Config = {
	files: ["**/*.cts", "**/*.cjs"],
	rules: { "unicorn/prefer-module": "off" },
};

/**
 * JS and .d.ts files: disable type-aware parsing and rules.
 */
const jsConfig: Linter.Config = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
	languageOptions: { parserOptions: { project: null, projectService: false } },
	...tseslint.configs.disableTypeChecked,
};

// #endregion

// #region Build Configs

function createRecommendedConfig(): FlatConfigArray {
	return [
		...baseConfig,
		tsOverrideConfig,
		{
			rules: {
				...unicornPlugin.configs["flat/recommended"].rules,
				...unicornOverrides,
				...recommendedRules,
			},
		},
		reactConfig,
		testConfig,
		typeValidationConfig,
		internalModulesConfig,
		cjsConfig,
		jsConfig,
	];
}

function createStrictConfig(): FlatConfigArray {
	return [
		...createRecommendedConfig(),
		{ rules: strictRules },
		{ files: tsFilePatterns, rules: strictTsRules },
	];
}

// #endregion

// #region Exports

const useCompat = process.env.ESLINT_USE_COMPAT === "true";

/**
 * Recommended ESLint configuration for Fluid Framework.
 */
export const recommended: FlatConfigArray = useCompat
	? compatRecommended
	: createRecommendedConfig();

/**
 * Strict ESLint configuration for Fluid Framework.
 */
export const strict: FlatConfigArray = useCompat ? compatStrict : createStrictConfig();

// #endregion
