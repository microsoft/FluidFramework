/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { _dirname } from "./dirname.cjs";

export const packageRootPath = path.resolve(_dirname, "../..");

/**
 * Absolute path to the test data. It's rooted two directories up because the tests get executed from lib/.
 */
export const testDataPath = path.resolve(_dirname, packageRootPath, "src/test/data");

/**
 * Absolute path to the test repo.
 */
export const testRepoRoot = path.join(testDataPath, "testRepo");

/**
 * Selects a subset of keys from an object and returns a new object with only the selected keys.
 * @param obj - The object to pick from.
 * @param keys - The keys to pick.
 * @returns The new object.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const result = {} as Pick<T, K>;
	for (const key of keys) {
		if (key in obj) {
			result[key] = obj[key];
		}
	}
	return result;
}
