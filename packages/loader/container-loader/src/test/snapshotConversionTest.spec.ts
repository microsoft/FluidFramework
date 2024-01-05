/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
	combineAppAndProtocolSummary,
	getSnapshotTreeAndBlobsFromSerializedContainer,
} from "../utils";

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
				},
			},
		},
	};

	it("Summary to snapshottree and snapshotBlobs conversion", async () => {
		const combinedSummary = combineAppAndProtocolSummary(appSummary, protocolSummary);
		const [snapshotTree, snapshotBlobs] =
			getSnapshotTreeAndBlobsFromSerializedContainer(combinedSummary);

		assert.strictEqual(Object.keys(snapshotTree.trees).length, 2, "2 trees should be there");
		assert.strictEqual(
			Object.keys(snapshotTree.trees[".protocol"].blobs).length,
			2,
			"2 protocol blobs should be there.",
		);

		// Validate the ".component" blob.
		const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
		const defaultDataStoreBlob = snapshotBlobs[defaultDataStoreBlobId];
		assert.strict(defaultDataStoreBlob, "defaultDataStoreBlob undefined");
		assert.strictEqual(
			JSON.parse(defaultDataStoreBlob),
			"defaultDataStore",
			"The .component blob's content is incorrect",
		);

		// Validate "root" sub-tree.
		const rootAttributesBlobId = snapshotTree.trees.default.trees.root.blobs.attributes;
		const rootAttributesBlob = snapshotBlobs[rootAttributesBlobId];
		assert.strict(rootAttributesBlob, "rootAttributesBlob undefined");
		assert.strictEqual(
			JSON.parse(rootAttributesBlob),
			"rootattributes",
			"The root sub-tree's content is incorrect",
		);
		assert.strictEqual(
			snapshotTree.trees.default.trees.root.unreferenced,
			undefined,
			"The root sub-tree should not be marked as unreferenced",
		);

		// Validate "unref" sub-tree.
		assert.strictEqual(
			snapshotTree.trees.default.trees.unref.unreferenced,
			true,
			"The unref sub-tree should be marked as unreferenced",
		);
	});
});
