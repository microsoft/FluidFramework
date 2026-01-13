/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
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
