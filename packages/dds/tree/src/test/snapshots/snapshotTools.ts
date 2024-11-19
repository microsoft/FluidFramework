/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { testSrcPath } from "../testSrcPath.cjs";

// Use `pnpm run test:snapshots:regen` to set this flag.
const regenerateSnapshots = process.argv.includes("--snapshot");

export function takeJsonSnapshot(data: JsonCompatibleReadOnly, suffix: string = ""): void {
	const dataStr = JSON.stringify(data, undefined, 2);
	return takeSnapshot(dataStr, `${suffix}.json`, jsonCompare);
}

function jsonCompare(actual: string, expected: string, message: string): void {
	const parsedA = JSON.parse(actual);
	const parsedB = JSON.parse(expected);
	assert.deepEqual(parsedA, parsedB, message);
}

/**
 * @param data - content to save and compare. Must be deterministic.
 * @param suffix - appended to file name. For example ".txt" or ".json"
 * @param compare - given the before and after strings and throws an error if they differ.
 * This cannot be used to suppress errors for non-deterministic input: it can only be used to provide nicer error messages.
 *
 * Non-deterministic data is forbidden (and will error after compare is run) to prevent unneeded changes/churn of snapshot files when regenerating,
 * as well as to ensure that buggy compare functions can't falsy pass tests.
 */
export function takeSnapshot(
	data: string,
	suffix: string,
	compare?: (actual: string, expected: string, message: string) => void,
): void {
	assert(
		currentTestName !== undefined,
		"use `useSnapshotDirectory` to configure the tests containing describe block to take snapshots",
	);
	assert(currentTestFile !== undefined);

	// Ensure test name doesn't accidentally navigate up directories or things like that.
	// Done here instead of in beforeEach so errors surface better.
	if (nameCheck.test(currentTestName) === false) {
		assert.fail(`Expected test name to pass sanitization: "${currentTestName}"`);
	}

	const fullFile = currentTestFile + suffix;

	const exists = existsSync(fullFile);
	if (regenerateSnapshots) {
		assert(exists === false, "snapshot should not already exist: possible name collision.");
		// Ensure compare function does not error with this output.
		compare?.(data, data, "invalid compare function");
		writeFileSync(fullFile, data);
	} else {
		assert(exists, `test snapshot file does not exist: "${fullFile}"`);
		const pastData = readFileSync(fullFile, "utf-8");
		const message = `snapshot different for "${currentTestName}"`;
		compare?.(data, pastData, message);
		assert.equal(data, pastData, message);
	}
}

let currentTestName: string | undefined;
let currentTestFile: string | undefined;

// Simple filter to avoid tests with a name that would accidentally be parsed as directory traversal or other confusing things.
const nameCheck = new RegExp(/^[^"/\\]+$/);

const snapshotsFolder = path.join(testSrcPath, "snapshots");
assert(existsSync(snapshotsFolder));

/**
 * Delete the existing test file directory and recreate it.
 *
 * If the directory does not already exist, this will create it.
 *
 * @param dirPath - The path within the `snapshots` directory.
 */
export function useSnapshotDirectory(dirPath: string = "files"): void {
	const normalizedDir = path.join(snapshotsFolder, dirPath);
	// Basic sanity check to avoid bugs like accidentally recursively deleting everything under `/` if something went wrong (like dirPath navigated up directories a lot).
	assert(normalizedDir.startsWith(snapshotsFolder));

	if (regenerateSnapshots) {
		if (existsSync(normalizedDir)) {
			console.log(`removing snapshot directory: ${normalizedDir}`);
			rmSync(normalizedDir, { recursive: true, force: true });
		}
		mkdirSync(normalizedDir, { recursive: true });
	}

	beforeEach(function (): void {
		currentTestName = this.currentTest?.title ?? assert.fail();
		currentTestFile = path.join(normalizedDir, currentTestName);
	});

	afterEach(() => {
		currentTestFile = undefined;
		currentTestName = undefined;
	});
}
