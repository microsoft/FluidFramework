/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import { ILoadTestConfig, ITestConfig } from "./testConfigFile.js";

export function getProfile(profileArg: string) {
	let config: ITestConfig;
	try {
		config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
	} catch (e) {
		console.error("Failed to read testConfig.json");
		console.error(e);
		process.exit(-1);
	}

	const profile: ILoadTestConfig | undefined = config.profiles[profileArg];
	if (profile === undefined) {
		console.error("Invalid --profile argument not found in testConfig.json profiles");
		process.exit(-1);
	}
	return profile;
}
