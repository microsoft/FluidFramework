/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IBlob, ITree } from "@fluidframework/driver-definitions/internal";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/driver-utils/internal";

import {
	ISnapshotNormalizerConfig,
	gcBlobPrefix,
	getNormalizedSnapshot,
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
		assert(
			normalizedSnapshot.entries[0] !== undefined,
			"normalizedSnapshot.entries[0] is undefined in can normalize tree entries",
		);

		assert.strictEqual(
			normalizedSnapshot.entries[0].path,
			"entry1",
			"Snapshot tree entries not sorted",
		);
		assert(
			normalizedSnapshot.entries[1] !== undefined,
			"normalizedSnapshot.entries[1] is undefined in can normalize tree entries",
		);
		assert.strictEqual(
			normalizedSnapshot.entries[1].path,
			"entry2",
			"Snapshot tree entries not sorted",
		);
		assert(
			normalizedSnapshot.entries[2] !== undefined,
			"normalizedSnapshot.entries[2] is undefined in can normalize tree entries",
		);
		assert.strictEqual(
			normalizedSnapshot.entries[2].path,
			"entry3",
			"Snapshot tree entries not sorted",
		);
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
		assert(
			normalizedSnapshot.entries[0] !== undefined,
			"normalizedSnapshot.entries[0] is undefined in can normalize GC blobs",
		);
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

		const firstSnapshot = normalizedSnapshot.entries[1];
		assert(firstSnapshot !== undefined, "firstSnapshot is undefined in can normalize GC blobs");
		const firstSnapshotValue = firstSnapshot.value as ITree;
		assert(
			firstSnapshotValue !== undefined,
			"firstSnapshotValue is undefined in can normalize GC blobs",
		);
		assert(
			firstSnapshotValue.entries[0] !== undefined,
			"firstSnapshotValue.entries[0] is undefined in can normalize GC blobs",
		);
		const innerGCBlob = firstSnapshotValue.entries[0].value as IBlob;
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

		assert(
			normalizedSnapshot.entries[0] !== undefined,
			"normalizedSnapshot.entries[0] is undefined in can normalize custom blobs with array of objects",
		);

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

		assert(
			normalizedSnapshot.entries[1] !== undefined,
			"normalizedSnapshot.entries[1] is undefined in can normalize custom blobs with array of objects",
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

		assert(
			normalizedSnapshot.entries[0] !== undefined,
			"normalizedSnapshot.entries[0] is undefined in can normalize custom blobs with object of arrays",
		);
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

		assert(
			normalizedSnapshot.entries[1] !== undefined,
			"normalizedSnapshot.entries[1] is undefined in can normalize custom blobs with object of arrays",
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
		assert(
			normalizedSnapshot.entries[0] !== undefined,
			"normalizedSnapshot.entries[0] is undefined in can normalize blob whose contents are not objects",
		);
		assert(
			normalizedSnapshot.entries[1] !== undefined,
			"normalizedSnapshot.entries[1] is undefined in can normalize blob whose contents are not objects",
		);

		const customBlob1 = normalizedSnapshot.entries[0].value as IBlob;
		assert.strictEqual(customBlob1.contents, "contents", "Blob with string not as expected");

		const customBlob2 = normalizedSnapshot.entries[1].value as IBlob;
		assert.strictEqual(
			customBlob2.contents,
			JSON.stringify("contents"),
			"Blob with JSON strigified string not as expected",
		);
	});
});
