/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Config factory functions for building ESLint flat configs.
 *
 * This module provides factory functions that compose the various rule sets and overrides
 * into complete, usable ESLint configurations. It defines the configuration hierarchy:
 *
 * - buildMinimalDeprecatedConfig: Base + minimal-deprecated rules + depend plugin
 * - buildRecommendedConfig: minimal-deprecated + unicorn/recommended + recommended rules
 * - buildStrictConfig: recommended + strict rules
 * - buildStrictBiomeConfig: strict + biome config for Biome formatter compatibility
 *
 * The "create*" functions add shared configs (project service, test config, React, etc.)
 * to produce the final exported configurations.
 */

import unicornPlugin from "eslint-plugin-unicorn";
import biomeConfig from "eslint-config-biome";

import { buildBaseConfig, type FlatConfigArray } from "./base.mjs";
import { minimalDeprecatedRules } from "../rules/minimal-deprecated.mjs";
import { recommendedRules } from "../rules/recommended.mjs";
import { strictRules, strictTsRules } from "../rules/strict.mjs";
import {
	dependConfig,
	reactRecommendedOverride,
	testRecommendedOverride,
	addSharedConfigs,
} from "./overrides.mjs";

/**
 * Builds the minimal-deprecated configuration.
 */
export function buildMinimalDeprecatedConfig(): FlatConfigArray {
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

/**
 * Builds the recommended configuration.
 */
export function buildRecommendedConfig(): FlatConfigArray {
	return [
		...buildMinimalDeprecatedConfig(),
		// unicorn/recommended rules (plugin already registered in base)
		{
			rules: unicornPlugin.configs["flat/recommended"].rules,
		},
		{
			rules: recommendedRules,
		},
	];
}

/**
 * Builds the strict configuration.
 */
export function buildStrictConfig(): FlatConfigArray {
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

/**
 * Builds the strict-biome configuration.
 */
export function buildStrictBiomeConfig(): FlatConfigArray {
	return [...buildStrictConfig(), biomeConfig];
}

/**
 * Creates the final minimalDeprecated config with shared overrides.
 */
export function createMinimalDeprecatedConfig(): FlatConfigArray {
	return addSharedConfigs(buildMinimalDeprecatedConfig());
}

/**
 * Creates the final recommended config with shared overrides.
 */
export function createRecommendedConfig(): FlatConfigArray {
	return addSharedConfigs([
		...buildRecommendedConfig(),
		reactRecommendedOverride,
		testRecommendedOverride,
	]);
}

/**
 * Creates the final strict config with shared overrides.
 */
export function createStrictConfig(): FlatConfigArray {
	return addSharedConfigs([
		...buildStrictConfig(),
		reactRecommendedOverride,
		testRecommendedOverride,
	]);
}

/**
 * Creates the final strictBiome config with shared overrides.
 */
export function createStrictBiomeConfig(): FlatConfigArray {
	return addSharedConfigs([
		...buildStrictBiomeConfig(),
		reactRecommendedOverride,
		testRecommendedOverride,
	]);
}
