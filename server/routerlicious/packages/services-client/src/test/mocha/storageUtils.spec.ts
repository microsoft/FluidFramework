/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { fromUtf8ToBase64, stringToBuffer } from "../../common-utils";
import {
	buildTreePath,
	convertSummaryTreeToWholeSummaryTree,
	convertWholeFlatSummaryToSnapshotTreeAndBlobs,
	convertFirstSummaryWholeSummaryTreeToSummaryTree,
} from "../../storageUtils";

import {
	IWholeFlatSummaryBlob,
	IWholeFlatSummary,
	IWholeFlatSummaryTree,
	IWholeFlatSummaryTreeEntry,
} from "../../storageContracts";
import {
	IDocumentAttributes,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";

const summaryBlobs: IWholeFlatSummaryBlob[] = [
	{
		id: "bARCTBK4PQiMLVK2gR5hPRkId",
		content: "[]",
		encoding: "utf-8",
		size: 2,
	},
	{
		id: "bARCfbIYtOyFwf1+nY75C4UFc",
		content: "[]",
		encoding: "utf-8",
		size: 2,
	},
	{
		id: "bARAL2CXvHYOch_aQtJAJOker",
		content: "[]",
		encoding: "utf-8",
		size: 2,
	},
];

const treeEntries: IWholeFlatSummaryTreeEntry[] = [
	{
		path: ".protocol",
		type: "tree",
		unreferenced: null,
	},
	{
		id: "bARCTBK4PQiMLVK2gR5hPRkId",
		path: ".protocol/attributes",
		type: "blob",
	},
	{
		id: "bARAL2CXvHYOch_aQtJAJOker",
		path: ".protocol/quorumValues",
		type: "blob",
	},
	{
		path: ".app",
		type: "tree",
		unreferenced: null,
	},
	{
		path: ".app/.channels",
		type: "tree",
		unreferenced: null,
	},
	{
		path: ".app/.channels/rootDOId",
		type: "tree",
		unreferenced: null,
	},
	{
		id: "bARCfbIYtOyFwf1+nY75C4UFc",
		path: ".app/.metadata",
		type: "blob",
	},
];

const flatSummary: IWholeFlatSummary = {
	id: "bBwAAAAAHAAAA",
	trees: [
		{
			id: "bBwAAAAAHAAAA",
			sequenceNumber: 0,
			entries: treeEntries,
		},
	],
	blobs: summaryBlobs,
};

const snapshotTree = {
	blobs: {
		".metadata": "bARCfbIYtOyFwf1+nY75C4UFc",
	},
	id: "bBwAAAAAHAAAA",
	trees: {
		".app": {
			blobs: {},
			trees: {},
			unreferenced: null,
		},
		".channels": {
			blobs: {},
			trees: {
				rootDOId: {
					blobs: {},
					trees: {},
					unreferenced: null,
				},
			},
			unreferenced: null,
		},
		".protocol": {
			blobs: {
				attributes: "bARCTBK4PQiMLVK2gR5hPRkId",
				quorumValues: "bARAL2CXvHYOch_aQtJAJOker",
			},
			trees: {},
			unreferenced: null,
		},
	},
};

const snapshotTreeWithoutPrefixStrip = {
	blobs: {},
	id: "bBwAAAAAHAAAA",
	trees: {
		".app": {
			blobs: {
				".metadata": "bARCfbIYtOyFwf1+nY75C4UFc",
			},
			trees: {
				".channels": {
					blobs: {},
					trees: {
						rootDOId: {
							blobs: {},
							trees: {},
							unreferenced: null,
						},
					},
					unreferenced: null,
				},
			},
			unreferenced: null,
		},
		".protocol": {
			blobs: {
				attributes: "bARCTBK4PQiMLVK2gR5hPRkId",
				quorumValues: "bARAL2CXvHYOch_aQtJAJOker",
			},
			trees: {},
			unreferenced: null,
		},
	},
};

describe("Storage Utils", () => {
	describe("buildTreePath()", () => {
		it("trims leading slashes", () => {
			assert.strictEqual(buildTreePath("ABC", ".app", "/.handle"), "ABC/.app/.handle");
		});

		it("trims trailing slashes", () => {
			assert.strictEqual(buildTreePath("ABC", ".app/", ".handle"), "ABC/.app/.handle");
		});

		it("removes blank nodes", () => {
			assert.strictEqual(buildTreePath("ABC", ".app", "", ".handle"), "ABC/.app/.handle");
		});

		it("does not trim internal slashes", () => {
			assert.strictEqual(
				buildTreePath("ABC", ".app/", ".handle/component/"),
				"ABC/.app/.handle/component",
			);
		});
	});

	describe("convertWholeFlatSummaryToSnapshotTreeAndBlobs()", () => {
		const blobs = new Map<string, ArrayBuffer>();
		let flatSummaryTree: IWholeFlatSummaryTree;
		let sequenceNumber: number;

		beforeEach(() => {
			for (const b of summaryBlobs) {
				blobs.set(b.id, stringToBuffer(b.content, b.encoding ?? "utf-8"));
			}
			flatSummaryTree = flatSummary.trees && flatSummary.trees[0];
			sequenceNumber = flatSummaryTree?.sequenceNumber;
		});

		it("converts while stripping .app prefix", () => {
			assert.deepStrictEqual(convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary), {
				blobs,
				snapshotTree,
				sequenceNumber,
			});
		});

		it("converts without stripping .app prefix", () => {
			assert.deepStrictEqual(convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary, ""), {
				blobs,
				snapshotTree: snapshotTreeWithoutPrefixStrip,
				sequenceNumber,
			});
		});
	});

	describe("convertFirstSummaryWholeSummaryTreeToSummaryTree()", () => {
		const documentAttributes: IDocumentAttributes = {
			minimumSequenceNumber: 0,
			sequenceNumber: 1,
		};

		const summaryTree: ISummaryTree = {
			tree: {
				attributes: {
					content: JSON.stringify(documentAttributes),
					type: SummaryType.Blob,
				},
				quorumMembers: {
					content: fromUtf8ToBase64(JSON.stringify([])),
					type: SummaryType.Blob,
				},
				quorumProposals: {
					content: fromUtf8ToBase64("This is a test"),
					type: SummaryType.Blob,
				},
				quorumValues: {
					content: JSON.stringify([]),
					type: SummaryType.Blob,
				},
			},
			type: SummaryType.Tree,
		};

		const summaryWithUnreferencedNode: ISummaryTree = {
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

		it("Validate summary tree conversion", () => {
			const wholeSummaryTree = convertSummaryTreeToWholeSummaryTree(
				undefined,
				summaryTree,
				"",
				"",
			);
			const newSummaryTree =
				convertFirstSummaryWholeSummaryTreeToSummaryTree(wholeSummaryTree);
			assert.deepStrictEqual(newSummaryTree, summaryTree);
		});

		it("Validate summary with unreferenced node tree conversion", () => {
			const wholeSummaryTree = convertSummaryTreeToWholeSummaryTree(
				undefined,
				summaryWithUnreferencedNode,
				"",
				"",
			);
			const newSummaryTree =
				convertFirstSummaryWholeSummaryTreeToSummaryTree(wholeSummaryTree);
			assert.deepStrictEqual(newSummaryTree, summaryWithUnreferencedNode);
		});

		it("Validate empty summary tree conversion", () => {
			const emptySummaryTree: ISummaryTree = { type: SummaryType.Tree, tree: {} };
			const wholeSummaryTree = convertSummaryTreeToWholeSummaryTree(
				undefined,
				emptySummaryTree,
				"",
				"",
			);
			const newSummaryTree =
				convertFirstSummaryWholeSummaryTreeToSummaryTree(wholeSummaryTree);
			assert.deepStrictEqual(newSummaryTree, emptySummaryTree);
		});
	});
});
