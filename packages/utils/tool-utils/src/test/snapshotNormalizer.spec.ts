/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IBlob, ITree } from "@fluidframework/driver-definitions/internal";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/driver-utils/internal";

import type { ISnapshotNormalizerConfig } from "../snapshotNormalizer.js";
import {
	gcBlobPrefix,
	getNormalizedSnapshot,
	legacyCatchUpBlobName,
} from "../snapshotNormalizer.js";

describe("Snapshot Normalizer", () => {
	it("can normalize tree entries", () => {
		// Snapshot tree with entries whose paths are not sorted.
		const snapshot: ITree = {
			id: "root",
			entries: [
				new TreeTreeEntry("entry2", {
					id: "subTree",
					entries: [],
				}),
				new BlobTreeEntry("entry3", "blob3"),
				new BlobTreeEntry("entry1", "blob1"),
			],
		};
		const normalizedSnapshot = getNormalizedSnapshot(snapshot);
		assert.strictEqual(
			normalizedSnapshot.entries[0].path,
			"entry1",
			"Snapshot tree entries not sorted",
		);
		assert.strictEqual(
			normalizedSnapshot.entries[1].path,
			"entry2",
			"Snapshot tree entries not sorted",
		);
		assert.strictEqual(
			normalizedSnapshot.entries[2].path,
			"entry3",
			"Snapshot tree entries not sorted",
		);
	});

	describe("SharedString snapshot format attributes", () => {
		const attributes = {
			type: "https://graph.microsoft.com/types/mergeTree",
			snapshotFormatVersion: "0.1",
			packageVersion: "X",
		};

		function createSnapshot(channelAttributes: object, blobName = ".attributes"): ITree {
			return {
				id: "root",
				entries: [
					new TreeTreeEntry("sharedString", {
						id: "channel",
						entries: [new BlobTreeEntry(blobName, JSON.stringify(channelAttributes))],
					}),
				],
			};
		}

		it("compares a recorded legacy flag with an absent flag without mutating the snapshot", () => {
			const snapshot = createSnapshot({
				...attributes,
				newMergeTreeSnapshotFormat: false,
			});
			const originalSnapshot = JSON.stringify(snapshot);
			const normalizedSnapshot = getNormalizedSnapshot(snapshot);

			assert.deepStrictEqual(
				normalizedSnapshot,
				getNormalizedSnapshot(createSnapshot(attributes)),
			);
			assert.strictEqual(JSON.stringify(snapshot), originalSnapshot);
			assert.deepStrictEqual(getNormalizedSnapshot(normalizedSnapshot), normalizedSnapshot);
		});

		it("preserves the flat format flag as a meaningful snapshot difference", () => {
			const snapshot = createSnapshot({
				...attributes,
				newMergeTreeSnapshotFormat: true,
			});

			assert.deepStrictEqual(getNormalizedSnapshot(snapshot), snapshot);
			assert.notDeepStrictEqual(
				getNormalizedSnapshot(snapshot),
				getNormalizedSnapshot(createSnapshot(attributes)),
			);
		});

		it("does not normalize the flag in other channel types", () => {
			const snapshot = createSnapshot({
				...attributes,
				type: "https://graph.microsoft.com/types/sharedmatrix",
				newMergeTreeSnapshotFormat: false,
			});

			assert.deepStrictEqual(getNormalizedSnapshot(snapshot), snapshot);
		});

		it("does not normalize similarly named fields outside the attributes blob", () => {
			const snapshot = createSnapshot(
				{ ...attributes, newMergeTreeSnapshotFormat: false },
				"header",
			);

			assert.deepStrictEqual(getNormalizedSnapshot(snapshot), snapshot);
		});

		it("retains custom blob normalization for attributes", () => {
			const config: ISnapshotNormalizerConfig = { blobsToNormalize: [".attributes"] };
			const snapshot = createSnapshot({
				...attributes,
				newMergeTreeSnapshotFormat: false,
			});

			assert.deepStrictEqual(
				getNormalizedSnapshot(snapshot, config),
				getNormalizedSnapshot(createSnapshot(attributes), config),
			);
		});
	});

	it("can normalize GC blobs", () => {
		const gcDetails = {
			isRootNode: true,
			gcNodes: {
				node2: ["node1", "/"],
				node1: ["node2", "/"],
			},
		};
		const normalizedGCDetails = {
			isRootNode: true,
			gcNodes: {
				node1: ["/", "node2"],
				node2: ["/", "node1"],
			},
		};
		const gcBlobName1 = `${gcBlobPrefix}_1`;
		const gcBlobName2 = `${gcBlobPrefix}_2`;
		// Snapshot with couple of GC blobs at different layers.
		const snapshot: ITree = {
			id: "root",
			entries: [
				new TreeTreeEntry("tree", {
					id: "subTree",
					entries: [new BlobTreeEntry(gcBlobName1, JSON.stringify(gcDetails))],
				}),
				new BlobTreeEntry(gcBlobName2, JSON.stringify(gcDetails)),
			],
		};

		const normalizedSnapshot = getNormalizedSnapshot(snapshot);
		assert.strictEqual(
			normalizedSnapshot.entries[0].path,
			gcBlobName2,
			"Snapshot tree entries not sorted",
		);
		const gcBlob = normalizedSnapshot.entries[0].value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(gcBlob.contents),
			normalizedGCDetails,
			"GC blob not normalized",
		);

		const innerGCBlob = (normalizedSnapshot.entries[1].value as ITree).entries[0]
			.value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(innerGCBlob.contents),
			normalizedGCDetails,
			"Inner blob not normalized",
		);
	});

	it("can normalize custom blobs with array of objects", () => {
		// Blob content which is an array of objects within objects.
		const blobContents = [
			{ id: "2", content: { key: "2", value: "two" } },
			{ id: "1", content: { key: "1", value: "one" } },
			{ id: "3", content: { key: "3", value: "three" } },
		];
		const normalizedBlobContents = [
			{ id: "1", content: { key: "1", value: "one" } },
			{ id: "2", content: { key: "2", value: "two" } },
			{ id: "3", content: { key: "3", value: "three" } },
		];

		const snapshot: ITree = {
			id: "root",
			entries: [
				// Create a blob entry with normalized blob contents to make sure it remains normalized.
				new BlobTreeEntry("normalized", JSON.stringify(normalizedBlobContents)),
				new BlobTreeEntry("custom", JSON.stringify(blobContents)),
			],
		};

		// Config to normalize the above blobs.
		const config: ISnapshotNormalizerConfig = { blobsToNormalize: ["custom", "normalized"] };
		const normalizedSnapshot = getNormalizedSnapshot(snapshot, config);

		assert.strictEqual(
			normalizedSnapshot.entries[0].path,
			"custom",
			"Snapshot tree entries not sorted",
		);
		const customBlob = normalizedSnapshot.entries[0].value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(customBlob.contents),
			normalizedBlobContents,
			"Custom blob not normalized",
		);

		assert.strictEqual(normalizedSnapshot.entries[1].path, "normalized");
		const normalizedBlob = normalizedSnapshot.entries[0].value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(normalizedBlob.contents),
			normalizedBlobContents,
			"Normalized blob changed",
		);
	});

	it("can normalize custom blobs with object of arrays", () => {
		// Blob content which is an object whose properties are arrays.
		const blobContents = {
			array2: ["2", "1", "3", "4"],
			array1: ["c", "a", "d", "b"],
		};
		const normalizedBlobContents = {
			array1: ["a", "b", "c", "d"],
			array2: ["1", "2", "3", "4"],
		};

		const snapshot: ITree = {
			id: "root",
			entries: [
				// Create a blob entry with normalized blob contents to make sure it remains normalized.
				new BlobTreeEntry("normalized", JSON.stringify(normalizedBlobContents)),
				new BlobTreeEntry("custom", JSON.stringify(blobContents)),
			],
		};

		// Config to normalize the above blobs.
		const config: ISnapshotNormalizerConfig = { blobsToNormalize: ["custom", "normalized"] };
		const normalizedSnapshot = getNormalizedSnapshot(snapshot, config);

		assert.strictEqual(
			normalizedSnapshot.entries[0].path,
			"custom",
			"Snapshot tree entries not sorted",
		);
		const customBlob = normalizedSnapshot.entries[0].value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(customBlob.contents),
			normalizedBlobContents,
			"Custom blob not normalized",
		);

		assert.strictEqual(normalizedSnapshot.entries[1].path, "normalized");
		const normalizedBlob = normalizedSnapshot.entries[0].value as IBlob;
		assert.deepStrictEqual(
			JSON.parse(normalizedBlob.contents),
			normalizedBlobContents,
			"Normalized blob changed",
		);
	});

	it("can normalize blob whose contents are not objects", () => {
		const snapshot: ITree = {
			id: "root",
			entries: [
				// Create blob entry whose content is a string so that it cannot be JSON parsed.
				new BlobTreeEntry("custom1", "contents"),
				// Create another blob whose content is a JSON stringified string which is already normalized.
				new BlobTreeEntry("custom2", JSON.stringify("contents")),
			],
		};

		// Config to normalize the above blobs.
		const config: ISnapshotNormalizerConfig = { blobsToNormalize: ["custom1", "custom2"] };
		const normalizedSnapshot = getNormalizedSnapshot(snapshot, config);
		const customBlob1 = normalizedSnapshot.entries[0].value as IBlob;
		assert.strictEqual(customBlob1.contents, "contents", "Blob with string not as expected");

		const customBlob2 = normalizedSnapshot.entries[1].value as IBlob;
		assert.strictEqual(
			customBlob2.contents,
			JSON.stringify("contents"),
			"Blob with JSON strigified string not as expected",
		);
	});

	it("can normalize legacy catchupOps blobs with metadata property in ops", () => {
		const catchupOp = {
			"clientId": "0c200397-abdc-47ca-905d-ab3ef7329c8f",
			"clientSequenceNumber": 82,
			"contents": {
				"pos1": 2,
				"seg": {},
				"type": 0,
			},
			"metadata": {
				"batch": true,
			},
			"minimumSequenceNumber": 189,
			"referenceSequenceNumber": 227,
			"sequenceNumber": 228,
			"timestamp": 1646688471368,
			"type": "op",
		};

		// Snapshot with a catchupOps blob.
		const snapshot: ITree = {
			id: "root",
			entries: [new BlobTreeEntry(`${legacyCatchUpBlobName}`, JSON.stringify([catchupOp]))],
		};

		const normalizedSnapshot = getNormalizedSnapshot(snapshot);
		const normalizedCatchupOpBlob = normalizedSnapshot.entries[0].value as IBlob;

		const catchupOpWithoutMetadata = { ...catchupOp, metadata: undefined };
		assert.deepStrictEqual(
			normalizedCatchupOpBlob.contents,
			JSON.stringify([catchupOpWithoutMetadata]),
			"Legacy catchupOps blob not normalized",
		);
	});
});
