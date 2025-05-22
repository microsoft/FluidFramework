/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * "Strict" Biome-compatible eslint configuration for ESLint v9.
 *
 * This configuration is the same as the "strict" config, but disables rules that are handled by biome, which allows
 * projects to use both biome and eslint without conflicting rules.
 */
module.exports = {
	extends: ["./strict.js", "biome"],
};