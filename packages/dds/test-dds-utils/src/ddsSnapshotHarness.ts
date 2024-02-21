/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Simple filter to avoid tests with a name that would accidentally be parsed as directory traversal or other confusing things.
const nameCheck = new RegExp(/^[^"/\\]+$/);

let currentTestName: string | undefined;
let currentTestFile: string | undefined;

/**
 * A utility function for setting up a snapshot directory for tests.
 * @param snapshotsFolder - The folder where snapshots are stored.
 * @param dirPath - The directory within the snapshots folder where tests will store their snapshots with specific
 * catogories. Defaults to root directory ("/").
 * @internal
 */
export function useSnapshotDirectory(snapshotsFolder: string, dirPath: string = "/"): void {
	assert(existsSync(snapshotsFolder));

	const normalizedDir = path.join(snapshotsFolder, dirPath);
	// Basic sanity check to avoid bugs like accidentally recursively deleting everything under `/` if something went wrong (like dirPath navigated up directories a lot).
	assert(normalizedDir.startsWith(snapshotsFolder));

	beforeEach(function (): void {
		currentTestName = this.currentTest?.title ?? assert.fail();
		currentTestFile = path.join(normalizedDir, `${currentTestName}.json`);
	});

	afterEach(() => {
		currentTestFile = undefined;
		currentTestName = undefined;
	});
}

/**
 * @internal
 */
export interface TestScenario {
	only?: boolean;
	skip?: boolean;
	name: string;
	runScenario: () => unknown;
	/**
	 * Whether running the scenario produces a snapshot which matches the saved one.
	 * This is used to test back-compat of snapshots, i.e. ensuring current code can load older documents.
	 * @remarks - It may be valuable to confirm clients can collaborate on such documents
	 * after loading them.
	 */
	writeCompatible?: boolean;
}

/**
 * Takes a snapshot of data and writes it to a file.
 * @param data - The data to take a snapshot of.
 * @param writeCompatible - A flag indicating whether the snapshot should be checked for consistency
 * with old-format data. Defaults to true.
 * @internal
 */
export function takeSnapshot(data: string, writeCompatible: boolean = true): string {
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

	if (!existsSync(currentTestFile)) {
		writeFileSync(currentTestFile, data);
	}
	const pastData = readFileSync(currentTestFile, "utf8");
	if (writeCompatible) {
		assert.equal(data, pastData, `snapshots are inconsistent on test "${currentTestName}"`);
	}
	return data;
}
