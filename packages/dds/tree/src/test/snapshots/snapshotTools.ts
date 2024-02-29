/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { strict as assert } from "assert";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { JsonCompatibleReadOnly } from "../../util/index.js";

const regenerateSnapshots = process.argv.includes("--snapshot");

export function takeJsonSnapshot(data: JsonCompatibleReadOnly, suffix: string = ""): void {
	const dataStr = JSON.stringify(data, undefined, 2);
	return takeSnapshot(dataStr, `${suffix}.json`);
}

export function takeSnapshot(data: string, suffix: string): void {
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
		writeFileSync(fullFile, data);
	} else {
		assert(exists, `test snapshot file does not exist: "${fullFile}"`);
		const pastData = readFileSync(fullFile, "utf-8");
		const pastObj = JSON.parse(pastData);
		assert.equal(data, pastData, `snapshot different for "${currentTestName}"`);
	}
}

let currentTestName: string | undefined;
let currentTestFile: string | undefined;

// Simple filter to avoid tests with a name that would accidentally be parsed as directory traversal or other confusing things.
const nameCheck = new RegExp(/^[^"/\\]+$/);

assert(__dirname.match(/dist[/\\]test[/\\]snapshots$/));
const snapshotsFolder = path.join(__dirname, `../../../src/test/snapshots`);
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
