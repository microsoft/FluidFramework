/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Example usage of BiomeConfigReaderV2 for Biome v2 configs
 *
 * This file demonstrates how to use the new BiomeConfigReaderV2 class with Biome v2 configurations.
 */

import { BiomeConfigReaderV2 } from "./biomeConfig";
import { GitRepo } from "./gitRepo";

async function exampleUsage() {
	// Initialize a Git repository instance
	const gitRepo = new GitRepo("/path/to/repo");

	// Create a BiomeConfigReaderV2 instance from a directory
	const configReader = await BiomeConfigReaderV2.create(
		"/path/to/package",
		gitRepo,
	);

	// Access the loaded configuration
	console.log("Config path:", configReader.closestConfig);
	console.log("Config directory:", configReader.directory);
	console.log("Biome config:", configReader.config);

	// Get the list of files that would be formatted
	console.log(
		"Files to format:",
		configReader.formattedFiles.length,
		"files",
	);

	// Example: Check if a specific file would be formatted
	const fileToCheck = "/path/to/repo/src/index.ts";
	const wouldFormat = configReader.formattedFiles.includes(fileToCheck);
	console.log(`Would format ${fileToCheck}:`, wouldFormat);
}

// Key differences between BiomeConfigReader (v1) and BiomeConfigReaderV2 (v2):
//
// 1. Config inheritance:
//    - v1: Manually follows and merges 'extends' directives
//    - v2: Biome automatically handles inheritance for configs with `root: false`
//
// 2. File filtering:
//    - v1: Uses `include`/`ignore` properties in config sections
//    - v2: Relies on VCS integration with .gitignore
//
// 3. API simplicity:
//    - v1: Returns allConfigs (array) and mergedConfig
//    - v2: Returns single config (no need to track all configs)
//
// 4. File enumeration:
//    - v1: Complex glob matching with prefixed includes/ignores
//    - v2: Simple extension-based filtering on git-tracked files
//
// Migration guide:
// - Replace `BiomeConfigReader.create()` with `BiomeConfigReaderV2.create()`
// - Access `config` instead of `mergedConfig`
// - No need to access `allConfigs` - v2 handles hierarchy automatically
// - File filtering is simpler and relies on .gitignore
