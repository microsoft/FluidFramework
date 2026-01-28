/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * File-specific config overrides and shared config objects.
 *
 * This module contains ESLint configurations that apply to specific file patterns or
 * provide specialized behavior:
 *
 * - dependConfig: eslint-plugin-depend configuration for dependency checking
 * - useProjectService: TypeScript project service for automatic tsconfig discovery
 * - testProjectConfig: Test file configuration with explicit project paths and relaxed rules
 * - internalModulesConfig: import-x/no-internal-modules rule for production code
 * - reactConfig: React and React Hooks plugin configurations
 * - cjsFileConfig: CommonJS file rule overrides
 * - jsNoProject: Disables type-aware parsing for JS and .d.ts files
 * - jsTypeAwareDisable: Disables type-aware rules for JS files
 * - reactRecommendedOverride: React file overrides for recommended config
 * - testRecommendedOverride: Test file overrides for recommended config
 * - sharedConfigs: Collection of all shared configs in a config array
 */

import dependPlugin from "eslint-plugin-depend";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import type { ESLint, Linter } from "eslint";

import { permittedImports, restrictedImportPaths, testFilePatterns } from "../constants.mjs";
import type { FlatConfigArray } from "./base.mjs";

/**
 * eslint-plugin-depend configuration.
 */
export const dependConfig = {
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
} as const satisfies Linter.Config;

/**
 * Use projectService for automatic tsconfig discovery instead of manual project configuration.
 */
export const useProjectService = {
	files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
	languageOptions: {
		parserOptions: {
			projectService: true,
		},
	},
} as const satisfies Linter.Config;

/**
 * Test file configuration with explicit project paths and rule overrides.
 */
export const testProjectConfig = {
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
				// Any and all import paths are allowed in test files.
				// Preferably, external (alpha/beta/public) entrypoints are used
				// for clarity where testing is somewhat whitebox versus validating
				// customer experience.
				allow: ["@fluid*/**", ...permittedImports],
			},
		],
		"import-x/no-extraneous-dependencies": ["error", { devDependencies: true }],
	},
} as const satisfies Linter.Config;

/**
 * Override import-x/no-internal-modules for non-test files to include /legacy imports.
 */
export const internalModulesConfig = {
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
} as const satisfies Linter.Config;

/**
 * React rules for ESLint 9 - extends react/recommended and react-hooks/recommended.
 */
export const reactConfig = [
	// react/flat.recommended
	{
		files: ["**/*.jsx", "**/*.tsx"],
		...reactPlugin.configs.flat.recommended,
	},
	// react-hooks/recommended rules (from minimal-deprecated.js lines 451)
	{
		files: ["**/*.jsx", "**/*.tsx"],
		plugins: {
			// reactHooksPlugin.configs.flat does not conform. It is not a `ConfigObject`.
			"react-hooks": reactHooksPlugin as ESLint.Plugin,
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
] as const satisfies FlatConfigArray;

/**
 * CommonJS files can use __dirname and require.
 */
export const cjsFileConfig = {
	files: ["**/*.cts", "**/*.cjs"],
	rules: {
		"unicorn/prefer-module": "off",
	},
} as const satisfies Linter.Config;

/**
 * Disable type-aware parsing for JS files and .d.ts files.
 */
export const jsNoProject = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
	languageOptions: { parserOptions: { project: null, projectService: false } },
} as const satisfies Linter.Config;

/**
 * Disable type-required @typescript-eslint rules for pure JS files and .d.ts files.
 */
export const jsTypeAwareDisable = {
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
} as const satisfies Linter.Config;

/**
 * React file overrides for recommended config (from recommended.js).
 */
export const reactRecommendedOverride = {
	files: ["**/*.jsx", "**/*.tsx"],
	rules: {
		"unicorn/consistent-function-scoping": "off",
	},
} as const satisfies Linter.Config;

/**
 * Test file overrides for recommended config (from recommended.js).
 */
export const testRecommendedOverride = {
	// Use of spread operator shouldn't really be needed here. Under VS Code, a
	// complaint is raised that
	//   The type 'readonly [...]' is 'readonly' and cannot be assigned to the mutable type '(string | string[])[]'.ts(4104)
	// without spread. But that doesn't appear in other uses. Use spread to pacify
	// that environment. (Remember mutability is not well checked in TS generally.
	// So an extra copy if safety was needed isn't a problem.)
	files: [...testFilePatterns],
	rules: {
		"unicorn/consistent-function-scoping": "off",
		"unicorn/prefer-module": "off",
	},
} as const satisfies Linter.Config;

/**
 * Full set of shared configuration objects in config array.
 */
export const sharedConfigs = [
	useProjectService,
	testProjectConfig,
	internalModulesConfig,
	...reactConfig,
	cjsFileConfig,
	jsNoProject,
	jsTypeAwareDisable,
] as const satisfies FlatConfigArray;
