/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";

import {
	combineAppAndProtocolSummary,
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
});
