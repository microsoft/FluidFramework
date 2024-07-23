/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import type { TestConfiguration, TestConfigurationFileContents } from "./testConfigFile.js";

export function getProfile(profileName: string) {
	let config: TestConfigurationFileContents;
	try {
		config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
	} catch (error) {
		console.error("Failed to read testConfig.json");
		console.error(error);
		process.exit(-1);
	}

	const profile: TestConfiguration | undefined = config.profiles[profileName];
	if (profile === undefined) {
		console.error("Invalid --profile argument not found in testConfig.json profiles");
		process.exit(-1);
	}
	return profile;
}
