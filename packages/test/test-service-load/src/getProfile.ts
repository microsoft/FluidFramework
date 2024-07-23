/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import type { TestConfiguration, TestConfigurationFileContents } from "./testConfigFile.js";

export function getProfile(profileName: string): TestConfiguration {
	let config: TestConfigurationFileContents;
	try {
		config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
		// TODO: Consider validating the file contents.
	} catch (error) {
		console.error("Failed to read testConfig.json");
		throw error;
	}

	const profile: TestConfiguration | undefined = config.profiles[profileName];
	if (profile === undefined) {
		throw new Error("Invalid --profile argument not found in testConfig.json profiles");
	}
	return profile;
}
