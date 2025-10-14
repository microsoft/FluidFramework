/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * "Strict" Biome-compatible flat eslint configuration.
 *
 * This configuration is the same as the "strict" config, but disables rules that are handled by biome, which allows
 * projects to use both biome and eslint without conflicting rules.
 */
import tseslint from "typescript-eslint";
import biomeConfig from "eslint-config-biome";
import strictConfig from "./strict.mjs";

export default tseslint.config(...strictConfig, biomeConfig);
