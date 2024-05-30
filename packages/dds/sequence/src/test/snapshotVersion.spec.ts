/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";
import path from "path";

import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

import { _dirname } from "./dirname.cjs";
import { LocationBase, generateStrings } from "./generateSharedStrings.js";

function assertIntervalCollectionsAreEquivalent(
	actual: SharedString,
	expected: SharedString,
	message: string,
): void {
	assert.deepEqual(
		Array.from(actual.getIntervalCollectionLabels()),
		Array.from(expected.getIntervalCollectionLabels()),
		message,
	);

	for (const label of actual.getIntervalCollectionLabels()) {
		const expectedCollection = expected.getIntervalCollection(label);
		for (const interval of actual.getIntervalCollection(label)) {
			assert(interval);
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			const expectedInterval = expectedCollection.getIntervalById(intervalId);
			assert(expectedInterval);
			const start = actual.localReferencePositionToPosition(interval.start);
			const expectedStart = expected.localReferencePositionToPosition(expectedInterval.start);
			assert.equal(start, expectedStart, message);
			const end = actual.localReferencePositionToPosition(interval.end);
			const expectedEnd = expected.localReferencePositionToPosition(expectedInterval.end);
			assert.equal(end, expectedEnd, message);
		}
	}
}

function assertSharedStringsAreEquivalent(
	actual: SharedString,
	expected: SharedString,
	message: string,
): void {
	assert.equal(actual.getLength(), expected.getLength(), message);
	assert.equal(actual.getText(), expected.getText(), message);

	for (let j = 0; j < actual.getLength(); j += 10) {
		assert(
			JSON.stringify(actual.getPropertiesAtPosition(j)) ===
				JSON.stringify(expected.getPropertiesAtPosition(j)),
			message,
		);
	}
}

describe("SharedString Snapshot Version", () => {
	let fileBase: string;
	const message =
		"SharedString snapshot format has changed. " +
		"Please update the snapshotFormatVersion if appropriate " +
		"and then run npm test:newsnapfiles to create new snapshot test files.";

	before(() => {
		fileBase = path.join(_dirname, `../../${LocationBase}`);
	});

	async function loadSharedString(id: string, serializedSnapshot: string): Promise<SharedString> {
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services = {
			deltaConnection: dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(JSON.parse(serializedSnapshot)),
		};
		const sharedString = new SharedStringClass(
			dataStoreRuntime,
			id,
			SharedStringFactory.Attributes,
		);
		await sharedString.load(services);
		return sharedString;
	}

	function generateSnapshotRebuildTest(
		name: string,
		testString: SharedString,
		normalized: boolean,
	) {
		it(name, async () => {
			const filename = `${fileBase}${name}.json`;
			assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
			const data = fs.readFileSync(filename, "utf8");
			const sharedString = await loadSharedString("fakeId", data);
			// test rebuilt sharedString against the original
			assertSharedStringsAreEquivalent(sharedString, testString, message);
			// Only verify interval collection equivalence before editing both strings; the sliding
			// behavior of intervals requires acking and `testString` is only set up locally.
			assertIntervalCollectionsAreEquivalent(sharedString, testString, message);

			for (let j = 0; j < sharedString.getLength(); j += 50) {
				sharedString.insertText(j, "NEWTEXT");
				testString.insertText(j, "NEWTEXT");
			}

			assertSharedStringsAreEquivalent(sharedString, testString, message);

			sharedString.replaceText(0, sharedString.getLength(), "hello world");
			testString.replaceText(0, testString.getLength(), "hello world");

			assertSharedStringsAreEquivalent(sharedString, testString, message);

			sharedString.removeText(0, sharedString.getLength());
			testString.removeText(0, testString.getLength());

			assertSharedStringsAreEquivalent(sharedString, testString, message);
		});
	}

	function generateSnapshotRebuildTests() {
		describe("Snapshot rebuild", () => {
			for (const { snapshotPath, expected, snapshotIsNormalized } of generateStrings()) {
				if (snapshotIsNormalized || snapshotPath === "v1Intervals/withV1Intervals") {
					generateSnapshotRebuildTest(snapshotPath, expected, snapshotIsNormalized);
				}
			}
		});
	}
	generateSnapshotRebuildTests();

	function generateSnapshotDiffTest(name: string, testString: SharedString) {
		it(name, async () => {
			const filename = `${fileBase}${name}.json`;
			assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
			const data = fs.readFileSync(filename, "utf8").trim();
			const dataObject = JSON.parse(data);

			const summaryTree = testString.getAttachSummary().summary;
			const snapshotTree = convertSummaryTreeToITree(summaryTree);
			const testData = JSON.stringify(snapshotTree, undefined, 1).trim();
			const testDataObject = JSON.parse(testData);

			assert.deepStrictEqual(dataObject, testDataObject, message);
		});
	}

	function generateSnapshotDiffTests() {
		describe("Snapshot diff", () => {
			for (const str of generateStrings()) {
				if (str.snapshotIsNormalized) {
					generateSnapshotDiffTest(str.snapshotPath, str.expected);
				}
			}
		});
	}
	generateSnapshotDiffTests();

	it("normalizes prefixed interval collection keys", async () => {
		// This test verifies some back-compat for the fix related to
		// https://github.com/microsoft/FluidFramework/issues/10557.
		const originalString = new SharedStringClass(
			new MockFluidDataStoreRuntime(),
			"original",
			SharedStringFactory.Attributes,
		);
		originalString.initializeLocal();
		originalString.insertText(0, "ABCD");
		const collectionId = "015e0f46-efa3-42d7-a9ab-970ecc376df9";
		originalString.getIntervalCollection(collectionId).add({ start: 1, end: 2 });
		const summaryTree = originalString.getAttachSummary().summary;
		const snapshotTree = convertSummaryTreeToITree(summaryTree);
		const serializedSnapshot = JSON.stringify(snapshotTree);
		const denormalizedSnapshot = serializedSnapshot.replace(
			collectionId,
			`intervalCollections/${collectionId}`,
		);

		assert(denormalizedSnapshot.includes(`intervalCollections/${collectionId}`));
		const rehydratedString = await loadSharedString("rehydrated", serializedSnapshot);
		const rehydratedFromDenormalizedString = await loadSharedString(
			"denormalized",
			denormalizedSnapshot,
		);

		const assertEquivalent = (actual: SharedString, expected: SharedString) => {
			assertSharedStringsAreEquivalent(
				actual,
				expected,
				`Difference found between ${actual.id} and ${expected.id}'s text.`,
			);
			assertIntervalCollectionsAreEquivalent(
				actual,
				expected,
				`Difference found between ${actual.id} and ${expected.id}'s intervals.`,
			);
		};

		assertEquivalent(originalString, rehydratedString);
		assertEquivalent(originalString, rehydratedFromDenormalizedString);

		for (const sharedString of [
			originalString,
			rehydratedString,
			rehydratedFromDenormalizedString,
		]) {
			assert.deepEqual(
				Array.from(sharedString.getIntervalCollectionLabels()),
				[collectionId],
				`Unexpected labels for string "${sharedString.id}".`,
			);
		}
	});
});
