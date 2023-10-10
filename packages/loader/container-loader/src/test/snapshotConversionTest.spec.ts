/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { bufferToString } from "@fluid-internal/client-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { convertProtocolAndAppSummaryToSnapshotTree } from "../utils";

describe("Dehydrate Container", () => {
	it("Summary to snapshot conversion", async () => {
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
		const snapshotTree = convertProtocolAndAppSummaryToSnapshotTree(
			protocolSummary,
			appSummary,
		);

		assert.strictEqual(Object.keys(snapshotTree.trees).length, 2, "2 trees should be there");
		assert.strictEqual(
			Object.keys(snapshotTree.trees[".protocol"].blobs).length,
			2,
			"2 protocol blobs should be there.",
		);

		// Validate the ".component" blob.
		const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
		const defaultDataStoreBlob =
			snapshotTree.trees.default.blobsContents?.[defaultDataStoreBlobId];
		assert.strict(defaultDataStoreBlob, "defaultDataStoreBlob undefined");
		assert.strictEqual(
			JSON.parse(bufferToString(defaultDataStoreBlob, "utf8")),
			"defaultDataStore",
			"The .component blob's content is incorrect",
		);

		// Validate "root" sub-tree.
		const rootAttributesBlobId = snapshotTree.trees.default.trees.root.blobs.attributes;
		const rootAttributesBlob =
			snapshotTree.trees.default.trees.root.blobsContents?.[rootAttributesBlobId];
		assert.strict(rootAttributesBlob, "rootAttributesBlob undefined");
		assert.strictEqual(
			JSON.parse(bufferToString(rootAttributesBlob, "utf8")),
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
