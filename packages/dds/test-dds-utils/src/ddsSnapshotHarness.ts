/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Simple filter to avoid tests with a name that would accidentally be parsed as directory traversal or other confusing things.
const nameCheck = new RegExp(/^[^"/\\]+$/);
const regenerateSnapshots = process.argv.includes("--snapshot");

/**
 * @internal
 */
export interface ISnapshotSuite {
	/**
	 * A utility function for setting up the current snapshot directory for tests.
	 */
	useSnapshotSubdirectory: (dirPath: string) => void;

	/**
	 * Takes a snapshot of data and writes it to a file.
	 * @param data - The data to take a snapshot of.
	 * @param writeCompatible - A flag indicating whether the snapshot should be checked for consistency
	 * with old-format data. Defaults to true.
	 */
	takeSnapshot: (data: string, writeCompatible?: boolean) => string;
}

/**
 * Creates a suite of functions for managing snapshots in tests.
 * @param snapshotsFolder - The folder where snapshots will be stored.
 * @returns An object containing functions for managing snapshots.
 * @internal
 */
export function createSnapshotSuite(snapshotFolderPath: string): ISnapshotSuite {
	let currentTestName: string | undefined;
	let currentTestFile: string | undefined;

	assert(existsSync(snapshotFolderPath));

	function useSnapshotSubdirectory(dirPath: string = "/"): void {
		const normalizedDir = path.join(snapshotFolderPath, dirPath);
		// Basic sanity check to avoid bugs like accidentally recursively deleting everything under `/` if something went wrong (like dirPath navigated up directories a lot).
		assert(normalizedDir.startsWith(snapshotFolderPath));

		if (regenerateSnapshots) {
			if (existsSync(normalizedDir)) {
				console.log(`removing snapshot directory: ${normalizedDir}`);
				rmSync(normalizedDir, { recursive: true, force: true });
			}
			mkdirSync(normalizedDir, { recursive: true });
		}

		beforeEach(function (): void {
			currentTestName = this.currentTest?.title ?? assert.fail();
			currentTestFile = path.join(normalizedDir, `${currentTestName}.json`);
		});

		afterEach(() => {
			currentTestFile = undefined;
			currentTestName = undefined;
		});
	}

	function takeSnapshot(data: string, writeCompatible: boolean = true): string {
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

		if (regenerateSnapshots && !existsSync(currentTestFile)) {
			writeFileSync(currentTestFile, data);
		}
		const pastData = readFileSync(currentTestFile, "utf8");
		if (writeCompatible) {
			assert.equal(data, pastData, `snapshots are inconsistent on test "${currentTestName}"`);
		}
		return data;
	}

	return {
		useSnapshotSubdirectory,
		takeSnapshot,
	};
}
