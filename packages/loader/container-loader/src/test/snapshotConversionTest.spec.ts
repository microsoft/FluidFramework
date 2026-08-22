/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";

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

	/**
	 * This test demonstrates a real bug affecting any feature that embeds raw (non-UTF8) blob bytes
	 * directly into a SummaryType.Blob node of the attach summary - e.g.
	 * enableSingleRoundTripFileCreate's ".embeddedDetachedBlobs" subtree in
	 * @fluidframework/container-runtime's BlobManager.
	 *
	 * getISnapshotFromSerializedContainer / convertSummaryToISnapshot itself preserves raw Uint8Array
	 * blob content untouched (it stores the bytes directly in the ISnapshot's blobContents map, with
	 * no UTF8 round-trip). However, the *next* step in the pending-state pipeline -
	 * convertSnapshotToSnapshotInfo (used to build the JSON-serializable SerializedSnapshotInfo for
	 * Container.serialize()/getPendingLocalState, and its inverse convertSnapshotInfoToSnapshot used on
	 * rehydrate) - unconditionally does `bufferToString(content, "utf8")` on every blob's bytes so they
	 * can be embedded as a JSON string. This is lossy for bytes that aren't valid UTF-8, and there is no
	 * corresponding decode step recovering the original bytes: convertSnapshotInfoToSnapshot converts
	 * the (already-corrupted) string back to bytes via `stringToBuffer(content, "utf8")`, which does not
	 * restore the original raw bytes once the UTF8 replacement characters have been substituted in.
	 *
	 * This round-trip (ISnapshot -> SerializedSnapshotInfo -> ISnapshot) is exactly what happens for
	 * Container.serialize() and for the offline-load / getPendingLocalState snapshot cached by
	 * serializedStateManager on every attach (see runRetriableAttachProcess in attachment.ts) - not only
	 * when the user explicitly calls Container.serialize(). So any feature relying on embedding raw
	 * bytes directly (e.g. BlobManager's enableSingleRoundTripFileCreate) is affected by this whenever
	 * that pending/serialized state is later used to rehydrate/reload a container.
	 */
	it("Raw (non-UTF8) blob content is corrupted by the snapshot <-> SnapshotInfo round-trip", () => {
		// A byte sequence that is not valid UTF-8 (an isolated/invalid continuation byte).
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

		// Step 1: getISnapshotFromSerializedContainer / convertSummaryToISnapshot preserves raw bytes
		// as-is (no corruption at this stage).
		const snapshot = getISnapshotFromSerializedContainer(summaryWithRawBlob);
		const blobId = snapshot.snapshotTree.blobs.embeddedBlob;
		const preRoundTripBytes = snapshot.blobContents.get(blobId);
		assert(preRoundTripBytes !== undefined, "Expected blob content to be present");
		assert.deepStrictEqual(
			new Uint8Array(preRoundTripBytes),
			originalBytes,
			"getISnapshotFromSerializedContainer should not itself corrupt raw blob bytes",
		);

		// Step 2: convertSnapshotToSnapshotInfo (used for Container.serialize()/getPendingLocalState)
		// followed by convertSnapshotInfoToSnapshot (used on rehydrate) - this is the round-trip that
		// actually happens for serialized/pending container state.
		const snapshotInfo = convertSnapshotToSnapshotInfo(snapshot);
		const rehydratedSnapshot = convertSnapshotInfoToSnapshot(snapshotInfo);
		const roundTrippedBytes = rehydratedSnapshot.blobContents.get(blobId);
		assert(roundTrippedBytes !== undefined, "Expected blob content to be present after round-trip");

		// This assertion demonstrates the corruption: the round-tripped bytes no longer match the
		// original raw bytes, because they were silently mangled by a UTF-8 decode/re-encode cycle.
		assert.notDeepStrictEqual(
			new Uint8Array(roundTrippedBytes),
			originalBytes,
			"BUG: raw non-UTF8 blob bytes should not survive the SnapshotInfo round-trip, but any " +
				"feature relying on embedding raw bytes directly (e.g. BlobManager's " +
				"enableSingleRoundTripFileCreate) is affected by this since this round-trip happens on " +
				"every attach (via serializedStateManager), not just on explicit Container.serialize() " +
				"calls.",
		);
	});
});
