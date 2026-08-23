/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions/internal";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import {
	getBlobContentsFromTree,
	getBlobContentsFromTreeWithBlobContents,
} from "../containerStorageAdapter.js";
import type { SerializedSnapshotInfo } from "../serializedStateManager.js";
import {
	combineAppAndProtocolSummary,
	convertSnapshotInfoToSnapshot,
	convertSnapshotToSnapshotInfo,
	getISnapshotFromSerializedContainer,
} from "../utils.js";

describe("Dehydrate Container", () => {
	const protocolSummary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {
			attributes: {
				type: SummaryType.Blob,
				content: JSON.stringify("attributes"),
			},
			quorumValues: {
				type: SummaryType.Blob,
				content: JSON.stringify("quorumValues"),
			},
		},
	};
	const appSummary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {
			default: {
				type: SummaryType.Tree,
				tree: {
					".component": {
						type: SummaryType.Blob,
						content: JSON.stringify("defaultDataStore"),
					},
					"root": {
						type: SummaryType.Tree,
						tree: {
							attributes: {
								type: SummaryType.Blob,
								content: JSON.stringify("rootattributes"),
							},
						},
					},
					"unref": {
						type: SummaryType.Tree,
						tree: {},
						unreferenced: true,
					},
					"groupId": {
						type: SummaryType.Tree,
						tree: {},
						groupId: "group",
					},
				},
			},
		},
	};

	it("Summary to baseSnapshot and snapshotBlobs conversion", async () => {
		const combinedSummary = combineAppAndProtocolSummary(appSummary, protocolSummary);
		const snapshot = getISnapshotFromSerializedContainer(combinedSummary);
		const baseSnapshot = snapshot.snapshotTree;
		const snapshotBlobs = snapshot.blobContents;
		assert.strictEqual(Object.keys(baseSnapshot.trees).length, 2, "2 trees should be there");
		assert.strictEqual(
			Object.keys(baseSnapshot.trees[".protocol"].blobs).length,
			2,
			"2 protocol blobs should be there.",
		);

		// Validate the ".component" blob.
		const defaultDataStoreBlobId = baseSnapshot.trees.default.blobs[".component"];
		const defaultDataStoreBlob = snapshotBlobs.get(defaultDataStoreBlobId);
		assert.strict(defaultDataStoreBlob, "defaultDataStoreBlob undefined");
		assert.strictEqual(
			JSON.parse(bufferToString(defaultDataStoreBlob, "utf8")),
			"defaultDataStore",
			"The .component blob's content is incorrect",
		);

		// Validate "root" sub-tree.
		const rootAttributesBlobId = baseSnapshot.trees.default.trees.root.blobs.attributes;
		const rootAttributesBlob = snapshotBlobs.get(rootAttributesBlobId);
		assert.strict(rootAttributesBlob, "rootAttributesBlob undefined");
		assert.strictEqual(
			JSON.parse(bufferToString(rootAttributesBlob, "utf8")),
			"rootattributes",
			"The root sub-tree's content is incorrect",
		);
		assert.strictEqual(
			baseSnapshot.trees.default.trees.root.unreferenced,
			undefined,
			"The root sub-tree should not be marked as unreferenced",
		);

		// Validate "unref" sub-tree.
		assert.strictEqual(
			baseSnapshot.trees.default.trees.unref.unreferenced,
			true,
			"The unref sub-tree should be marked as unreferenced",
		);

		// Validate "groupId" sub-tree.
		assert.strictEqual(
			baseSnapshot.trees.default.trees.groupId.groupId,
			"group",
			"The groupId sub-tree should have a groupId",
		);

		// Validate "groupId" sub-tree.
		assert.strictEqual(
			baseSnapshot.trees.default.trees.groupId.groupId,
			"group",
			"The groupId sub-tree should have a groupId",
		);
	});

	it("round-trips arbitrary snapshot bytes losslessly through SnapshotInfo", () => {
		const originalBytes = new Uint8Array([0xc3, 0x28, 0x00, 0xff, 0xfe]);

		const summaryWithRawBlob: ISummaryTree = combineAppAndProtocolSummary(
			{
				type: SummaryType.Tree,
				tree: {
					embeddedBlob: {
						type: SummaryType.Blob,
						content: originalBytes,
					},
				},
			},
			protocolSummary,
		);

		const snapshot = getISnapshotFromSerializedContainer(summaryWithRawBlob);
		const blobId = snapshot.snapshotTree.blobs.embeddedBlob;
		const preRoundTripBytes = snapshot.blobContents.get(blobId);
		assert(preRoundTripBytes !== undefined, "Expected blob content to be present");
		assert.deepStrictEqual(
			new Uint8Array(preRoundTripBytes),
			originalBytes,
			"getISnapshotFromSerializedContainer should not itself corrupt raw blob bytes",
		);

		const snapshotInfo = convertSnapshotToSnapshotInfo(snapshot);
		assert.strictEqual(
			snapshotInfo.snapshotBlobs[blobId],
			undefined,
			"Non-UTF8 bytes must not be exposed through the legacy UTF-8 map",
		);
		assert.strictEqual(
			snapshotInfo.snapshotBlobContents?.[blobId],
			bufferToString(originalBytes, "base64"),
		);
		const rehydratedSnapshot = convertSnapshotInfoToSnapshot(snapshotInfo);
		const roundTrippedBytes = rehydratedSnapshot.blobContents.get(blobId);
		assert(
			roundTrippedBytes !== undefined,
			"Expected blob content to be present after round-trip",
		);

		assert.deepStrictEqual(
			new Uint8Array(roundTrippedBytes),
			originalBytes,
			"Raw non-UTF8 blob bytes should survive the base64 JSON transport",
		);
	});

	it("loads legacy UTF-8 SnapshotInfo and lets the binary-safe map win collisions", () => {
		const binaryBytes = new Uint8Array([0xff, 0x00, 0x80]);
		const snapshotInfo: SerializedSnapshotInfo = {
			baseSnapshot: {
				blobs: { legacy: "legacy-id", collision: "collision-id" },
				trees: {},
			},
			snapshotBlobs: {
				"legacy-id": "legacy text",
				"collision-id": "legacy collision",
			},
			snapshotBlobContents: {
				"collision-id": bufferToString(binaryBytes, "base64"),
			},
			snapshotSequenceNumber: 1,
		};

		const snapshot = convertSnapshotInfoToSnapshot(snapshotInfo);
		assert.strictEqual(
			bufferToString(snapshot.blobContents.get("legacy-id") ?? new ArrayBuffer(0), "utf8"),
			"legacy text",
		);
		assert.deepStrictEqual(
			new Uint8Array(snapshot.blobContents.get("collision-id") ?? new ArrayBuffer(0)),
			binaryBytes,
		);
	});

	it("extracts snapshot-tree bytes as base64 while skipping direct attachments", async () => {
		const binaryBytes = new Uint8Array([0xff, 0x00, 0x80]);
		const redirectBytes = stringToBuffer("[]", "utf8");
		const baseSnapshot: ISnapshotTree = {
			blobs: {},
			trees: {
				".blobs": {
					blobs: {
						".redirectTable": "redirect-id",
						"attachment-id": "attachment-id",
					},
					trees: {
						embedded: {
							blobs: { binary: "binary-id" },
							trees: {},
						},
					},
				},
			},
		};
		const storage: Pick<IDocumentStorageService, "readBlob"> = {
			readBlob: async (id) => {
				if (id === "redirect-id") {
					return redirectBytes;
				}
				if (id === "binary-id") {
					return binaryBytes;
				}
				throw new Error(`Unexpected blob read: ${id}`);
			},
		};

		assert.deepStrictEqual(
			await getBlobContentsFromTree(baseSnapshot, storage),
			new Map<string, ArrayBufferLike>([
				["redirect-id", redirectBytes],
				["binary-id", binaryBytes],
			]),
		);

		const snapshotWithOmittedGroupContents: ISnapshot = {
			snapshotTree: {
				...baseSnapshot,
				trees: {
					...baseSnapshot.trees,
					unrelatedGroup: {
						blobs: { unloaded: "unloaded-id" },
						trees: {},
						groupId: "unrelated",
					},
				},
			},
			blobContents: new Map([["redirect-id", redirectBytes]]),
			ops: [],
			sequenceNumber: 0,
			latestSequenceNumber: undefined,
			snapshotFormatV: 1,
		};
		assert.deepStrictEqual(
			await getBlobContentsFromTree(snapshotWithOmittedGroupContents, storage),
			new Map<string, ArrayBufferLike>([
				["redirect-id", redirectBytes],
				["binary-id", binaryBytes],
			]),
		);

		const snapshotWithLegacyAttachmentsOnly: ISnapshot = {
			...snapshotWithOmittedGroupContents,
			snapshotTree: {
				blobs: {},
				trees: {
					".blobs": {
						blobs: { attachment: "attachment-id" },
						trees: {},
					},
				},
			},
			blobContents: new Map(),
		};
		assert.deepStrictEqual(
			await getBlobContentsFromTree(snapshotWithLegacyAttachmentsOnly, storage),
			new Map(),
		);

		const snapshotWithContents: ISnapshotTreeWithBlobContents = {
			...baseSnapshot,
			blobsContents: {},
			trees: {
				".blobs": {
					...baseSnapshot.trees[".blobs"],
					blobsContents: {
						"redirect-id": redirectBytes,
						"attachment-id": new Uint8Array([1, 2, 3]),
					},
					trees: {
						embedded: {
							...baseSnapshot.trees[".blobs"].trees.embedded,
							blobsContents: { "binary-id": binaryBytes },
							trees: {},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(
			getBlobContentsFromTreeWithBlobContents(snapshotWithContents),
			new Map<string, ArrayBufferLike>([
				["redirect-id", redirectBytes],
				["binary-id", binaryBytes],
			]),
		);
	});
});
