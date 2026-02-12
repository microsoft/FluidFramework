/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base ESLint flat config builder.
 *
 * This module provides the foundational configuration that all other configs build upon.
 * It includes:
 * - Global ignore patterns
 * - eslint:recommended rules
 * - typescript-eslint recommended-type-checked and stylistic-type-checked configs
 * - import-x recommended and typescript configs
 * - Core plugin registrations (eslint-comments, fluid, rushstack, jsdoc, promise, tsdoc, unicorn, unused-imports)
 * - Prettier config for disabling conflicting formatting rules
 *
 * All higher-level configs (minimal-deprecated, recommended, strict) extend from this base.
 */

import eslintJs from "@eslint/js";
import eslintCommentsPlugin from "@eslint-community/eslint-plugin-eslint-comments";
import fluidPlugin from "@fluid-internal/eslint-plugin-fluid";
import rushstackPlugin from "@rushstack/eslint-plugin";
import tseslint from "typescript-eslint";
import importXPlugin from "eslint-plugin-import-x";
import jsdocPlugin from "eslint-plugin-jsdoc";
import promisePlugin from "eslint-plugin-promise";
import tsdocPlugin from "eslint-plugin-tsdoc";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import type { ESLint, Linter } from "eslint";

import { globalIgnores } from "../constants.mjs";
import { importXSettings, jsdocSettings } from "../settings.mjs";
import { baseRules, eslintCommentsRecommendedRules } from "../rules/base.mjs";

export type FlatConfigArray = readonly Readonly<Linter.Config>[];

/**
 * Base configuration array.
 * Contains: globalIgnores, eslint:recommended, typescript-eslint/recommended-type-checked,
 * typescript-eslint/stylistic-type-checked, import-x/recommended, import-x/typescript,
 * and custom rules from base.js.
 */
export const baseConfig: FlatConfigArray = [
	globalIgnores,
	// Global language options: browser and Node.js globals (matches legacy env: { browser: true, node: true })
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	// eslint:recommended
	eslintJs.configs.recommended,
	// @typescript-eslint/recommended-type-checked and stylistic-type-checked
	// Type assertions needed: typescript-eslint's PluginFlatConfig.languageOptions lacks the
	// string index signature that ESLint core's LanguageOptions requires.
	...(tseslint.configs.recommendedTypeChecked as Linter.Config[]),
	...(tseslint.configs.stylisticTypeChecked as Linter.Config[]),
	// import-x/recommended and import-x/typescript
	// Type assertions needed: same PluginFlatConfig incompatibility as typescript-eslint above.
	importXPlugin.flatConfigs.recommended as Linter.Config,
	importXPlugin.flatConfigs.typescript as Linter.Config,
	// Base config with all plugins and custom rules
	{
		plugins: {
			"@eslint-community/eslint-comments": eslintCommentsPlugin,
			"@fluid-internal/fluid": fluidPlugin,
			// Type assertion needed: @rushstack/eslint-plugin's type declarations haven't been
			// updated to match ESLint 9's Plugin interface.
			"@rushstack": rushstackPlugin as unknown as ESLint.Plugin,
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
			...eslintCommentsRecommendedRules,
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
	// Type validation files need relaxed rules for type compatibility testing
	{
		files: ["**/types/*validate*Previous*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},
	// Prettier disables conflicting rules - must come after custom rules
	prettierConfig as Linter.Config,
];
