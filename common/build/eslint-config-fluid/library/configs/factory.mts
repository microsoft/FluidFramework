/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ESLint flat config definitions and factory functions.
 *
 * This module defines the core ESLint configurations and factory functions that compose
 * rule sets and overrides into complete, usable ESLint configurations.
 *
 * Configuration hierarchy (each extends the previous):
 * - minimalDeprecatedConfig: Base + minimal-deprecated rules + depend plugin
 * - recommendedConfigBase: minimal-deprecated + unicorn/recommended + recommended rules
 * - recommendedConfig: recommendedConfigBase + biome (disables rules handled by Biome)
 * - strictConfig: recommendedConfigBase + strict rules (does NOT include biome)
 * - strictBiomeConfig: strict + biome config
 *
 * The "full*" exports add shared configs (project service, test config, React, etc.)
 * to produce the final exported configurations.
 */

import unicornPlugin from "eslint-plugin-unicorn";
import biomeConfig from "eslint-config-biome";

import { baseConfig, type FlatConfigArray } from "./base.mjs";
import { minimalDeprecatedRules } from "../rules/minimal-deprecated.mjs";
import { recommendedRules } from "../rules/recommended.mjs";
import { strictRules, strictTsRules } from "../rules/strict.mjs";
import {
	dependConfig,
	reactRecommendedOverride,
	sharedConfigs,
	testRecommendedOverride,
} from "./overrides.mjs";

/**
 * Minimal-deprecated configuration.
 */
export const minimalDeprecatedConfig = [
	...baseConfig,
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
] as const satisfies FlatConfigArray;

/**
 * Recommended configuration base (without biome).
 * This is used internally as the base for both recommendedConfig and strictConfig.
 */
const recommendedConfigBase = [
	...minimalDeprecatedConfig,
	// unicorn/recommended rules (plugin already registered in base)
	{
		rules: unicornPlugin.configs["flat/recommended"].rules,
	},
	{
		rules: recommendedRules,
	},
] as const satisfies FlatConfigArray;

/**
 * Recommended configuration.
 * Includes biome config to disable ESLint rules that are handled by Biome.
 */
export const recommendedConfig = [
	...recommendedConfigBase,
	// Disable ESLint rules that are handled by Biome
	biomeConfig,
] as const satisfies FlatConfigArray;

/**
 * Strict configuration.
 * Extends recommendedConfigBase (without biome) and adds strict rules.
 */
export const strictConfig = [
	...recommendedConfigBase,
	{
		rules: strictRules,
	},
	// TypeScript file override for strict (from strict.js)
	{
		files: ["**/*.ts", "**/*.tsx"],
		rules: strictTsRules,
	},
] as const satisfies FlatConfigArray;

/**
 * Strict-biome configuration.
 * Strict config with biome rules to disable ESLint rules handled by Biome.
 */
export const strictBiomeConfig = [...strictConfig, biomeConfig] as const satisfies FlatConfigArray;

/**
 * The final minimalDeprecated config with shared overrides.
 */
export const fullMinimalDeprecatedConfig = [
	...minimalDeprecatedConfig,
	...sharedConfigs,
] as const satisfies FlatConfigArray;

/**
 * The final recommended config with shared overrides.
 */
export const fullRecommendedConfig = [
	...recommendedConfig,
	reactRecommendedOverride,
	testRecommendedOverride,
	...sharedConfigs,
] as const satisfies FlatConfigArray;

/**
 * The final strict config with shared overrides.
 */
export const fullStrictConfig = [
	...strictConfig,
	reactRecommendedOverride,
	testRecommendedOverride,
	...sharedConfigs,
] as const satisfies FlatConfigArray;

/**
 * The final strictBiome config with shared overrides.
 */
export const fullStrictBiomeConfig = [
	...strictBiomeConfig,
	reactRecommendedOverride,
	testRecommendedOverride,
	...sharedConfigs,
] as const satisfies FlatConfigArray;
