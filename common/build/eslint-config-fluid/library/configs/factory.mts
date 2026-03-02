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
 * - recommendedConfig: minimal-deprecated + unicorn/recommended + recommended rules
 * - strictConfig: recommended + strict rules
 * - strictBiomeConfig: strict + biome config for Biome formatter compatibility
 *
 * The "create*" functions add shared configs (project service, test config, React, etc.)
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
 * Recommended configuration.
 */
export const recommendedConfig = [
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
 * Strict configuration.
 */
export const strictConfig = [
	...recommendedConfig,
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
