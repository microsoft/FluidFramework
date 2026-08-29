/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareWithReferenceSnapshot } from "@fluid-internal/replay-tool";
import {
	FileMode,
	TreeEntry,
	type ITreeEntry,
} from "@fluidframework/driver-definitions/internal";
import type { IFileSnapshot } from "@fluidframework/replay-driver/internal";

const blobPath = ".recentBatchInfo";

function createBlobEntry(contents: string): ITreeEntry {
	return {
		mode: FileMode.File,
		path: blobPath,
		type: TreeEntry.Blob,
		value: {
			contents,
			encoding: "utf-8",
		},
	};
}

function createSnapshot(entries: ITreeEntry[] = []): IFileSnapshot {
	return {
		commits: {},
		tree: { entries },
	};
}

describe("Snapshot comparison", () => {
	let tempDirectory: string;
	let referenceSnapshotFilename: string;

	beforeEach(() => {
		tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-snapshot-comparison-"));
		referenceSnapshotFilename = path.join(tempDirectory, "snapshot");
	});

	afterEach(() => {
		fs.rmSync(tempDirectory, { force: true, recursive: true });
	});

	function writeReferenceSnapshot(snapshot: IFileSnapshot): void {
		fs.writeFileSync(`${referenceSnapshotFilename}.json`, JSON.stringify(snapshot));
	}

	it("allows an unreconstructable blob to exist only in the reference snapshot", () => {
		writeReferenceSnapshot(createSnapshot([createBlobEntry("reference")]));
		let comparisonError: unknown;

		compareWithReferenceSnapshot(
			createSnapshot(),
			referenceSnapshotFilename,
			(_description, error) => {
				comparisonError = error;
			},
			[blobPath],
		);

		assert.equal(comparisonError, undefined);
	});

	it("strictly compares an allowed reference blob when the generated snapshot contains it", () => {
		writeReferenceSnapshot(createSnapshot([createBlobEntry("reference")]));
		let comparisonError: unknown;

		compareWithReferenceSnapshot(
			createSnapshot([createBlobEntry("generated")]),
			referenceSnapshotFilename,
			(_description, error) => {
				comparisonError = error;
			},
			[blobPath],
		);

		assert.ok(comparisonError instanceof Error);
	});

	it("strips terminal control characters from comparison errors", () => {
		writeReferenceSnapshot(createSnapshot([createBlobEntry("reference")]));
		const originalForceColor = process.env.FORCE_COLOR;
		let comparisonError: unknown;

		try {
			process.env.FORCE_COLOR = "1";
			compareWithReferenceSnapshot(
				createSnapshot([createBlobEntry("generated")]),
				referenceSnapshotFilename,
				(_description, error) => {
					comparisonError = error;
				},
			);
		} finally {
			if (originalForceColor === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = originalForceColor;
			}
		}

		assert.ok(comparisonError instanceof Error);
		assert.equal((comparisonError.stack ?? "").includes("\u001B"), false);
	});
});
