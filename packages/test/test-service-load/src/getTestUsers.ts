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
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type TestUserFileContents = {
	credentials: TestUsersRecord;
};

const isTestUsersRecord = (recordObject: unknown): recordObject is TestUsersRecord => {
	return (
		typeof recordObject === "object" &&
		recordObject !== null &&
		Object.entries(recordObject).every(
			([username, password]) => typeof username === "string" && typeof password === "string",
		)
	);
};

const isTestUserFileContents = (contents: unknown): contents is TestUserFileContents => {
	return (
		typeof contents === "object" &&
		contents !== null &&
		"credentials" in contents &&
		typeof contents.credentials === "object" &&
		contents.credentials !== null &&
		isTestUsersRecord(contents.credentials)
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
		const contents = JSON.parse(fs.readFileSync(credFilePath, "utf8"));
		if (!isTestUserFileContents(contents)) {
			throw new Error("credFile provided, but incorrect format");
		}
		const testUsers = Object.entries(contents.credentials).map(([username, password]) => ({
			username,
			password,
		}));
		if (testUsers.length === 0) {
			throw new Error("credFile contained no credentials");
		}
		return testUsers;
	} catch (error) {
		console.error(`Failed to read ${credFilePath}`);
		throw error;
	}
}
