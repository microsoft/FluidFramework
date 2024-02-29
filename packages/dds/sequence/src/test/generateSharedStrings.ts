/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { SnapshotLegacy as Snapshot } from "@fluidframework/merge-tree/test";
import { MersenneTwister19937, Random } from "random-js";
import * as mocks from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import {
	SharedStringWithV1IntervalCollection,
	V1IntervalCollectionSharedStringFactory,
} from "./v1IntervalCollectionHelpers";

export const LocationBase: string = "src/test/snapshots/";

export const supportedVersions = new Map<string, any>([
	// the catchUpBlob had to be renamed.
	// We are now support any name for this blob.
	// so for legacy set it to another name to ensure
	// we keep support
	["legacy", { catchUpBlobName: "randomNameForCatchUpOps" }],
	["legacyWithCatchUp", {}],
	["v1", { newMergeTreeSnapshotFormat: true }],
	["v1Intervals", {}],
]);

function createIntervals(sharedString) {
	const rand = new Random(MersenneTwister19937.seed(0));
	const collection1 = sharedString.getIntervalCollection("collection1");
	collection1.add({ start: 1, end: 5, props: { intervalId: rand.uuid4() } });

	const collection2 = sharedString.getIntervalCollection("collection2");
	for (let i = 0; i < sharedString.getLength() - 5; i += 100) {
		collection2.add({ start: i, end: i + 5, props: { intervalId: rand.uuid4() } });
	}
}

export function* generateStrings(): Generator<{
	snapshotPath: string;
	expected: SharedString;
	snapshotIsNormalized: boolean; // false for v1, true for new formats
}> {
	for (const [version, options] of supportedVersions) {
		const documentId = "fakeId";
		const dataStoreRuntime: mocks.MockFluidDataStoreRuntime =
			new mocks.MockFluidDataStoreRuntime();
		const createNewSharedString = (): SharedString => {
			const string = new SharedString(
				dataStoreRuntime,
				documentId,
				SharedStringFactory.Attributes,
			);
			string.initializeLocal();
			return string;
		};
		const createNewV1SharedString = (): SharedStringWithV1IntervalCollection => {
			const string = new SharedStringWithV1IntervalCollection(
				dataStoreRuntime,
				documentId,
				V1IntervalCollectionSharedStringFactory.Attributes,
			);
			string.initializeLocal();
			return string;
		};

		const normalized = version !== "v1Intervals";

		for (const key of Object.keys(options)) {
			dataStoreRuntime.options[key] = options[key];
		}
		const insertText = "text";

		let sharedString = createNewSharedString();
		// Small enough so snapshot won't have body
		for (let i = 0; i < Snapshot.sizeOfFirstChunk / insertText.length / 2; ++i) {
			sharedString.insertText(0, `${insertText}${i}`);
		}

		yield {
			snapshotPath: `${version}/headerOnly`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		sharedString = createNewSharedString();
		// Big enough that snapshot will have body
		for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
			sharedString.insertText(0, `${insertText}${i}`);
		}

		yield {
			snapshotPath: `${version}/headerAndBody`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		sharedString = createNewSharedString();
		// Very big sharedString
		for (let i = 0; i < Snapshot.sizeOfFirstChunk; ++i) {
			sharedString.insertText(0, `${insertText}-${i}`);
		}

		yield {
			snapshotPath: `${version}/largeBody`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		sharedString = createNewSharedString();
		// SharedString with markers
		for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
			sharedString.insertText(0, `${insertText}${i}`);
		}
		for (let i = 0; i < sharedString.getLength(); i += 70) {
			sharedString.insertMarker(i, 1, {
				ItemType: "Paragraph",
				Properties: { Bold: false },
				markerId: `marker${i}`,
				referenceTileLabels: ["Eop"],
			});
		}

		yield {
			snapshotPath: `${version}/withMarkers`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		sharedString = createNewSharedString();
		// SharedString with annotations
		for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
			sharedString.insertText(0, `${insertText}${i}`);
		}
		for (let i = 0; i < sharedString.getLength(); i += 70) {
			sharedString.annotateRange(i, i + 10, { bold: true });
		}

		yield {
			snapshotPath: `${version}/withAnnotations`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		sharedString = createNewSharedString();
		// SharedString with intervals
		for (let i = 0; i < Snapshot.sizeOfFirstChunk / insertText.length / 2; i++) {
			sharedString.insertText(0, `${insertText}${i}`);
		}

		createIntervals(sharedString);

		yield {
			snapshotPath: `${version}/withIntervals`,
			expected: sharedString,
			snapshotIsNormalized: normalized,
		};

		if (version === "v1Intervals") {
			sharedString = createNewV1SharedString();
			// SharedString with V1 intervals
			for (let i = 0; i < Snapshot.sizeOfFirstChunk / insertText.length / 2; i++) {
				sharedString.insertText(0, `${insertText}${i}`);
			}
			createIntervals(sharedString);

			yield {
				snapshotPath: `${version}/withV1Intervals`,
				expected: sharedString,
				snapshotIsNormalized: normalized,
			};
		}
	}
}
