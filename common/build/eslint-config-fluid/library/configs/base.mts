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
 * All higher-level configs (recommended, strict, strictBiome) extend from this base.
 */

import eslintJs from "@eslint/js";
import eslintCommentsPlugin from "@eslint-community/eslint-plugin-eslint-comments";
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

import noFilePathLinksInJsdoc from "../../src/rules/no-file-path-links-in-jsdoc.js";
import noHyphenAfterJsdocTag from "../../src/rules/no-hyphen-after-jsdoc-tag.js";
import noMarkdownLinksInJsdoc from "../../src/rules/no-markdown-links-in-jsdoc.js";
import noMemberReleaseTags from "../../src/rules/no-member-release-tags.js";
import noRestrictedTagsImports from "../../src/rules/no-restricted-tags-imports.js";
import noUncheckedRecordAccess from "../../src/rules/no-unchecked-record-access.js";
import { globalIgnores } from "../constants.mjs";
import { importXSettings, jsdocSettings } from "../settings.mjs";
import { baseRules, eslintCommentsRecommendedRules } from "../rules/base.mjs";
import { dependConfig } from "./overrides.mjs";

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
	...(tseslint.configs.recommendedTypeChecked satisfies Linter.Config[]),
	...(tseslint.configs.stylisticTypeChecked satisfies Linter.Config[]),
	// import-x/recommended and import-x/typescript
	// Type assertions needed: import-x's FlatConfig type is not compatible with ESLint core's
	// Linter.Config (missing string index signature on languageOptions).
	importXPlugin.flatConfigs.recommended as Linter.Config,
	importXPlugin.flatConfigs.typescript as Linter.Config,
	// Base config with all plugins and custom rules
	{
		plugins: {
			"@eslint-community/eslint-comments": eslintCommentsPlugin,
			"@fluid-internal/fluid": {
				rules: {
					"no-file-path-links-in-jsdoc": noFilePathLinksInJsdoc,
					"no-hyphen-after-jsdoc-tag": noHyphenAfterJsdocTag,
					"no-markdown-links-in-jsdoc": noMarkdownLinksInJsdoc,
					"no-member-release-tags": noMemberReleaseTags,
					"no-restricted-tags-imports": noRestrictedTagsImports,
					"no-unchecked-record-access": noUncheckedRecordAccess,
				},
			},
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
	// TypeScript file overrides
	{
		files: ["**/*.ts", "**/*.tsx"],
		rules: {
			"@typescript-eslint/indent": "off",
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
	// Type validation files need relaxed rules for type compatibility testing
	{
		files: ["**/types/*validate*Previous*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},
	// Prettier disables conflicting rules - must come after custom rules
	prettierConfig satisfies Linter.Config,
	// Re-enable no-multi-spaces after prettier (which disables it)
	{
		rules: {
			"no-multi-spaces": [
				"error",
				{
					ignoreEOLComments: true,
				},
			],
		},
	},
];
