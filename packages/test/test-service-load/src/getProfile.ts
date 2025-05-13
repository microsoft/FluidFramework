/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import type { TestConfiguration, TestConfigurationFileContents } from "./testConfigFile.js";

export function getProfile(profileName: string): TestConfiguration {
	const config: TestConfigurationFileContents = JSON.parse(
		fs.readFileSync("./testConfig.json", "utf-8"),
	);
	// TODO: Consider validating the file contents.

	const profile: TestConfiguration | undefined = config.profiles[profileName];
	if (profile === undefined) {
		throw new Error("Invalid --profile argument not found in testConfig.json profiles");
	}
	return profile;
}
