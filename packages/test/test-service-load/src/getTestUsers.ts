/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

export interface ITestUserConfig {
	/* Credentials' key/value description:
	 * Key    : Username for the client
	 * Value  : Password specific to that username
	 */
	credentials: Record<string, string>;
}

export async function getTestUsers(credFile?: string) {
	if (credFile === undefined || credFile.length === 0) {
		return undefined;
	}

	let config: ITestUserConfig;
	try {
		config = JSON.parse(fs.readFileSync(credFile, "utf8"));
		return config;
	} catch (e) {
		console.error(`Failed to read ${credFile}`);
		console.error(e);
		return undefined;
	}
}
