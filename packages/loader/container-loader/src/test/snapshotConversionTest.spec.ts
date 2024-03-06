/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
	combineAppAndProtocolSummary,
	getSnapshotTreeAndBlobsFromSerializedContainer,
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

	it("Summary to snapshottree and snapshotBlobs conversion", async () => {
		const combinedSummary = combineAppAndProtocolSummary(appSummary, protocolSummary);
		const { tree, blobs } = getSnapshotTreeAndBlobsFromSerializedContainer(combinedSummary);

		assert.strictEqual(Object.keys(tree.trees).length, 2, "2 trees should be there");
		assert.strictEqual(
			Object.keys(tree.trees[".protocol"].blobs).length,
			2,
			"2 protocol blobs should be there.",
		);

		// Validate the ".component" blob.
		const defaultDataStoreBlobId = tree.trees.default.blobs[".component"];
		const defaultDataStoreBlob = blobs[defaultDataStoreBlobId];
		assert.strict(defaultDataStoreBlob, "defaultDataStoreBlob undefined");
		assert.strictEqual(
			JSON.parse(defaultDataStoreBlob),
			"defaultDataStore",
			"The .component blob's content is incorrect",
		);

		// Validate "root" sub-tree.
		const rootAttributesBlobId = tree.trees.default.trees.root.blobs.attributes;
		const rootAttributesBlob = blobs[rootAttributesBlobId];
		assert.strict(rootAttributesBlob, "rootAttributesBlob undefined");
		assert.strictEqual(
			JSON.parse(rootAttributesBlob),
			"rootattributes",
			"The root sub-tree's content is incorrect",
		);
		assert.strictEqual(
			tree.trees.default.trees.root.unreferenced,
			undefined,
			"The root sub-tree should not be marked as unreferenced",
		);

		// Validate "unref" sub-tree.
		assert.strictEqual(
			tree.trees.default.trees.unref.unreferenced,
			true,
			"The unref sub-tree should be marked as unreferenced",
		);

		// Validate "groupId" sub-tree.
		assert.strictEqual(
			tree.trees.default.trees.groupId.groupId,
			"group",
			"The groupId sub-tree should have a groupId",
		);

		// Validate "groupId" sub-tree.
		assert.strictEqual(
			tree.trees.default.trees.groupId.groupId,
			"group",
			"The groupId sub-tree should have a groupId",
		);
	});
});
