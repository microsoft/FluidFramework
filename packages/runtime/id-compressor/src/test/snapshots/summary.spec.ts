/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-nodejs-modules */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SessionId, createIdCompressor } from "../../index.js";

import { _dirname } from "./dirname.cjs";

const regenerateSnapshots = process.argv.includes("--snapshot");

let currentTestName: string | undefined;
let currentTestFile: string | undefined;

// Simple filter to avoid tests with a name that would accidentally be parsed as directory traversal or other confusing things.
const nameCheck = new RegExp(/^[^"/\\]+$/);

assert(_dirname.match(/(dist|lib)[/\\]test[/\\]snapshots$/));
const snapshotsFolder = path.join(_dirname, `../../../src/test/snapshots`);
assert(existsSync(snapshotsFolder));

/**
 * Delete the existing test file directory and recreate it.
 *
 * If the directory does not already exist, this will create it.
 *
 * @param dirPath - The path within the `snapshots` directory.
 */
function useSnapshotDirectory(dirPath: string = "files"): void {
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
		currentTestName = this.currentTest?.title.replace(/ /g, "-") ?? assert.fail();
		currentTestFile = path.join(normalizedDir, currentTestName);
	});

	afterEach(() => {
		currentTestFile = undefined;
		currentTestName = undefined;
	});
}

function takeSnapshot(data: string, suffix: string = ""): void {
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
		assert.equal(data, pastData, `snapshot different for "${currentTestName}"`);
	}
}

describe("snapshot tests", () => {
	const client1 = "403f1e16-5265-4074-8507-417d99a05ee9" as SessionId;
	const client2 = "4b02675a-5a81-428d-b7b7-d8c33a16bfde" as SessionId;

	useSnapshotDirectory();

	it("empty compressor summary", () => {
		const compressor = createIdCompressor(client1);
		const summary = compressor.serialize(false);

		takeSnapshot(summary);
	});

	it("compressor with finalized range from one client", () => {
		const compressor = createIdCompressor(client1);
		const compressor2 = createIdCompressor(client2);
		for (let i = 0; i < 10; i++) {
			compressor.generateCompressedId();
		}
		const idRange = compressor.takeNextCreationRange();
		compressor.finalizeCreationRange(idRange);
		const summary = compressor.serialize(false);
		const summary2 = compressor2.serialize(false);

		takeSnapshot(summary);
		takeSnapshot(summary2, "-client2");
	});

	it("compressors with finalized ranges from two clients", () => {
		const compressor = createIdCompressor(client1);
		const compressor2 = createIdCompressor(client2);

		for (let i = 0; i < 10; i++) {
			compressor.generateCompressedId();
			compressor2.generateCompressedId();
		}
		const idRange = compressor.takeNextCreationRange();
		const idRange2 = compressor2.takeNextCreationRange();

		compressor.finalizeCreationRange(idRange);
		compressor2.finalizeCreationRange(idRange);
		compressor.finalizeCreationRange(idRange2);
		compressor2.finalizeCreationRange(idRange2);

		const summary = compressor.serialize(false);
		const summary2 = compressor2.serialize(false);

		takeSnapshot(summary);
		takeSnapshot(summary2, "-client2");
	});

	it("expansion semantics", () => {
		const compressor = createIdCompressor(client1);
		const compressor2 = createIdCompressor(client2);
		// eslint-disable-next-line @typescript-eslint/dot-notation
		compressor["nextRequestedClusterSize"] = 2;
		compressor.generateCompressedId();
		const idRange = compressor.takeNextCreationRange();
		compressor.finalizeCreationRange(idRange);
		compressor2.finalizeCreationRange(idRange);

		for (let i = 0; i < 3; i++) {
			compressor.generateCompressedId();
		}

		const expansionIdRange = compressor.takeNextCreationRange();
		compressor.finalizeCreationRange(expansionIdRange);
		compressor2.finalizeCreationRange(expansionIdRange);
		const summary = compressor.serialize(false);
		const summary2 = compressor2.serialize(false);

		takeSnapshot(summary);
		takeSnapshot(summary2, "-client2");
	});
});
