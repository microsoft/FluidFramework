/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

/**
 * A Record mapping usernames (keys) to passwords (values).
 */
type TestUsersRecord = Record<string, string>;

// Consider just having the Json format be TestUsers directly, if there's no one depending on this format already.
interface ITestUserConfigJson {
	credentials: TestUsersRecord;
}

const isITestUserConfig = (config: unknown): config is ITestUserConfigJson => {
	return (
		typeof config === "object" &&
		config !== null &&
		"credentials" in config &&
		typeof config.credentials === "object" &&
		config.credentials !== null
	);
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type TestUser = {
	username: string;
	password: string;
};
export type TestUsers = TestUser[];

export function getTestUsers(credFilePath: string): TestUsers {
	try {
		const config = JSON.parse(fs.readFileSync(credFilePath, "utf8"));
		if (!isITestUserConfig(config)) {
			throw new Error("credFile provided but incorrect format");
		}
		const testUsers = Object.entries(config.credentials).map(([username, password]) => ({
			username,
			password,
		}));
		if (testUsers.length === 0) {
			throw new Error("credFile valid but contained no credentials");
		}
		return testUsers;
	} finally {
		console.error(`Failed to read ${credFilePath}`);
	}
}
