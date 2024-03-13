/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IsoBuffer, stringToBuffer, Uint8ArrayToString } from "@fluid-internal/client-utils";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/driver-utils";
import {
	SummaryObject,
	ISummaryTree,
	ISummaryBlob,
	ISummaryHandle,
	SummaryType,
	ISnapshotTree,
	ITree,
} from "@fluidframework/protocol-definitions";
import {
	convertSnapshotTreeToSummaryTree,
	convertSummaryTreeToITree,
	convertToSummaryTree,
	TelemetryContext,
	utf8ByteLength,
} from "../summaryUtils.js";

describe("Summary Utils", () => {
	function assertSummaryTree(obj: SummaryObject): ISummaryTree {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (obj && obj.type === SummaryType.Tree) {
			return obj;
		} else {
			assert.fail("Object should be summary tree");
		}
	}
	function assertSummaryBlob(obj: SummaryObject): ISummaryBlob {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (obj && obj.type === SummaryType.Blob) {
			return obj;
		} else {
			assert.fail("Object should be summary blob");
		}
	}
	function assertSummaryHandle(obj: SummaryObject): ISummaryHandle {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (obj && obj.type === SummaryType.Handle) {
			return obj;
		} else {
			assert.fail("Object should be summary handle");
		}
	}

	describe("ITree <-> ISummaryTree", () => {
		let tree: ITree;

		beforeEach(() => {
			const base64Content = IsoBuffer.from("test-b64").toString("base64");
			tree = {
				entries: [
					new TreeTreeEntry("t", {
						entries: [
							new BlobTreeEntry("bu8", "test-u8"),
							new BlobTreeEntry("b64", base64Content, "base64"),
							new TreeTreeEntry("tu", {
								entries: [],
								unreferenced: true,
								groupId: undefined,
							}),
						],
						unreferenced: undefined,
						groupId: undefined,
					}),
					new BlobTreeEntry("b", "test-blob"),
					new TreeTreeEntry("h", {
						id: "test-handle",
						entries: [new BlobTreeEntry("ignore", "this-should-be-ignored")],
					}),
					new TreeTreeEntry("unref", {
						entries: [],
						unreferenced: true,
						groupId: undefined,
					}),
					new TreeTreeEntry("groupId", {
						entries: [],
						unreferenced: undefined,
						groupId: "group-id",
					}),
				],
				unreferenced: undefined,
				groupId: undefined,
			};
		});

		it("Should convert ITree to ISummaryTree correctly", () => {
			const summaryResults = convertToSummaryTree(tree);
			const summaryTree = assertSummaryTree(summaryResults.summary);

			// blobs should parse
			const blob = assertSummaryBlob(summaryTree.tree.b);
			assert.strictEqual(blob.content, "test-blob");

			// trees with ids should become handles
			const handle = assertSummaryHandle(summaryTree.tree.h);
			assert.strictEqual(handle.handleType, SummaryType.Tree);
			assert.strictEqual(handle.handle, "test-handle");

			// subtrees should recurse
			const subTree = assertSummaryTree(summaryTree.tree.t);
			const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
			assert.strictEqual(subBlobUtf8.content, "test-u8");
			const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
			assert.strictEqual(Uint8ArrayToString(subBlobBase64.content as Uint8Array), "test-b64");
			const subTreeUnref = assertSummaryTree(subTree.tree.tu);
			assert.strictEqual(
				Object.keys(subTreeUnref.tree).length,
				0,
				"There should be no entries in tu subtree",
			);
		});

		it("Should convert ITree to ISummaryTree correctly with fullTree enabled", () => {
			const summaryResults = convertToSummaryTree(tree, true);
			const summaryTree = assertSummaryTree(summaryResults.summary);

			// blobs should parse
			const blob = assertSummaryBlob(summaryTree.tree.b);
			assert.strictEqual(blob.content, "test-blob");

			// trees with ids should not become handles
			const usuallyIgnoredSubtree = assertSummaryTree(summaryTree.tree.h);
			const usuallyIgnoredBlob = assertSummaryBlob(usuallyIgnoredSubtree.tree.ignore);
			assert.strictEqual(usuallyIgnoredBlob.content, "this-should-be-ignored");

			// subtrees should recurse
			const subTree = assertSummaryTree(summaryTree.tree.t);
			const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
			assert.strictEqual(subBlobUtf8.content, "test-u8");
			const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
			assert.strictEqual(Uint8ArrayToString(subBlobBase64.content as Uint8Array), "test-b64");
			const subUnrefTree = assertSummaryTree(subTree.tree.tu);
			assert.strictEqual(
				Object.keys(subUnrefTree.tree).length,
				0,
				"There should be no entries in tu subtree",
			);
		});

		it("Should calculate summary data correctly", () => {
			const summaryResults = convertToSummaryTree(tree);
			// nodes should count
			assert.strictEqual(summaryResults.stats.blobNodeCount, 3);
			assert.strictEqual(summaryResults.stats.handleNodeCount, 1);
			assert.strictEqual(summaryResults.stats.treeNodeCount, 5);

			const bufferLength =
				IsoBuffer.from("test-b64").byteLength +
				IsoBuffer.from("test-blob").byteLength +
				IsoBuffer.from("test-u8").byteLength;
			assert.strictEqual(summaryResults.stats.totalBlobSize, bufferLength);
		});

		it("should convert unreferenced state correctly", () => {
			const summaryResults = convertToSummaryTree(tree);
			const summaryTree = assertSummaryTree(summaryResults.summary);
			assert.strictEqual(
				summaryTree.unreferenced,
				undefined,
				"The root summary tree should be referenced",
			);

			const subTreeT = assertSummaryTree(summaryTree.tree.t);
			assert.strictEqual(
				subTreeT.unreferenced,
				undefined,
				"The t subtree should be referenced",
			);
			const subTreeTUnrefTree = assertSummaryTree(subTreeT.tree.tu);
			assert.strictEqual(
				subTreeTUnrefTree.unreferenced,
				true,
				"The tu subtree of t should be referenced",
			);

			const subTreeUnref = assertSummaryTree(summaryTree.tree.unref);
			assert.strictEqual(
				subTreeUnref.unreferenced,
				true,
				"The unref subtree should be unreferenced",
			);
		});

		it("should convert ISummaryTree to ITree correctly", () => {
			// convertSummaryTreeToITree API does not accept a tree with handles. So, remove handles from the ITree.
			const treeWithoutHandles: ITree = {
				entries: tree.entries.filter((treeEntry) => {
					return treeEntry.path !== "h";
				}),
				unreferenced: undefined,
				groupId: undefined,
			};
			const summaryResults = convertToSummaryTree(treeWithoutHandles);
			const summaryTree = assertSummaryTree(summaryResults.summary);

			// Covert the ISummaryTree back to ITree and validate that it matches with the original tree.
			const iTree = convertSummaryTreeToITree(summaryTree);
			assert.deepStrictEqual(
				treeWithoutHandles,
				iTree,
				"Could not covert back to ITree correctly",
			);
		});
	});

	describe("ISnapshotTree -> ISummaryTree", () => {
		let snapshotTree: ISnapshotTree;

		beforeEach(() => {
			snapshotTree = {
				blobs: {
					"b": "blob-b",
					"blob-b": IsoBuffer.from("test-blob").toString("base64"),
				},
				trees: {
					t: {
						blobs: {
							"bu8": "blob-bu8",
							"blob-bu8": IsoBuffer.from("test-u8").toString("base64"),
							"b64": "blob-b64",
							"blob-b64": IsoBuffer.from("test-b64").toString("base64"),
						},
						trees: {
							tu: {
								blobs: {},
								trees: {},
								unreferenced: true,
								groupId: undefined,
							},
						},
					},
					unref: {
						blobs: {},
						trees: {},
						unreferenced: true,
						groupId: undefined,
					},
					groupId: {
						blobs: {},
						trees: {},
						unreferenced: true,
						groupId: "group-id",
					},
				},
			};
		});
		it("Should convert correctly", () => {
			const summaryResults = convertSnapshotTreeToSummaryTree(snapshotTree);
			const summaryTree = assertSummaryTree(summaryResults.summary);

			// blobs should parse
			const blob = assertSummaryBlob(summaryTree.tree.b);
			assert.strictEqual(blob.content, "test-blob");

			// subtrees should recurse
			const subTree = assertSummaryTree(summaryTree.tree.t);
			const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
			assert.strictEqual(subBlobUtf8.content, "test-u8");
			const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
			assert.strictEqual(Uint8ArrayToString(subBlobBase64.content as Uint8Array), "test-b64");
			const subTreeUnref = assertSummaryTree(subTree.tree.tu);
			assert.strictEqual(
				Object.keys(subTreeUnref.tree).length,
				0,
				"There should be no entries in tu subtree",
			);
		});

		it("Should calculate summary data correctly", () => {
			const summaryResults = convertSnapshotTreeToSummaryTree(snapshotTree);
			// nodes should count
			assert.strictEqual(summaryResults.stats.blobNodeCount, 3);
			assert.strictEqual(summaryResults.stats.handleNodeCount, 0);
			assert.strictEqual(summaryResults.stats.treeNodeCount, 5);

			const bufferLength =
				IsoBuffer.from("test-b64").byteLength +
				IsoBuffer.from("test-blob").byteLength +
				IsoBuffer.from("test-u8").byteLength;
			assert.strictEqual(summaryResults.stats.totalBlobSize, bufferLength);
		});

		it("should convert unreferenced state correctly", () => {
			const summaryResults = convertSnapshotTreeToSummaryTree(snapshotTree);
			const summaryTree = assertSummaryTree(summaryResults.summary);
			assert.strictEqual(
				summaryTree.unreferenced,
				undefined,
				"The root summary tree should be referenced",
			);

			const subTreeT = assertSummaryTree(summaryTree.tree.t);
			assert.strictEqual(
				subTreeT.unreferenced,
				undefined,
				"The t subtree should be referenced",
			);
			const subTreeTUnrefTree = assertSummaryTree(subTreeT.tree.tu);
			assert.strictEqual(
				subTreeTUnrefTree.unreferenced,
				true,
				"The tu subtree of t should be referenced",
			);

			const subTreeUnref = assertSummaryTree(summaryTree.tree.unref);
			assert.strictEqual(
				subTreeUnref.unreferenced,
				true,
				"The unref subtree should be unreferenced",
			);
		});

		it("should convert groupId state correctly", () => {
			const summaryResults = convertSnapshotTreeToSummaryTree(snapshotTree);
			const summaryTree = assertSummaryTree(summaryResults.summary);
			assert.strictEqual(
				summaryTree.groupId,
				undefined,
				"The root summary tree should not have groupId",
			);

			const subTreeT = assertSummaryTree(summaryTree.tree.t);
			assert.strictEqual(subTreeT.groupId, undefined, "The t subtree not have groupId");
			const subTreeTUnrefTree = assertSummaryTree(subTreeT.tree.tu);
			assert.strictEqual(
				subTreeTUnrefTree.groupId,
				undefined,
				"The tu subtree of t not have groupId",
			);

			const subTreeUnref = assertSummaryTree(summaryTree.tree.unref);
			assert.strictEqual(subTreeUnref.groupId, undefined, "The groupId should not be set");

			const subTreeGroupId = assertSummaryTree(summaryTree.tree.groupId);
			assert.strictEqual(subTreeGroupId.groupId, "group-id", "The groupId should be set");
		});
	});

	describe("utf8ByteLength()", () => {
		it("gives correct utf8 byte length", () => {
			const a = [
				"prague is a city in europe",
				"ᚠᛇᚻ᛫ᛒᛦᚦ᛫ᚠᚱᚩᚠᚢᚱ᛫ᚠᛁᚱᚪ᛫ᚷᛖᚻᚹᛦᛚᚳᚢᛗ",
				"Τὴ γλῶσσα μοῦ ἔδωσαν ἑλληνικὴ",
				"На берегу пустынных волн",
				"⠊⠀⠉⠁⠝⠀⠑⠁⠞⠀⠛⠇⠁⠎⠎⠀⠁⠝⠙⠀⠊⠞⠀⠙⠕⠑⠎⠝⠞⠀⠓⠥⠗⠞⠀⠍⠑",
				"أنا قادر على أكل الزجاج و هذا لا يؤلمني.",
				" 我能吞下玻璃而不傷身體。",
				"ᐊᓕᒍᖅ ᓂᕆᔭᕌᖓᒃᑯ ᓱᕋᙱᑦᑐᓐᓇᖅᑐᖓ",
				"🤦🏼‍♂️",
				"🏴󠁧󠁢󠁷󠁬󠁳󠁿", // the flag of wales
				"���",
				"������",
			];
			a.map((s) =>
				assert.strictEqual(utf8ByteLength(s), stringToBuffer(s, "utf8").byteLength, s),
			);
		});
	});

	describe("TelemetryContext", () => {
		it("Should serialize properly", () => {
			const telemetryContext = new TelemetryContext();

			telemetryContext.set("pre1_", "prop1", 10);
			telemetryContext.set("pre2_", "prop1", "10");
			telemetryContext.set("pre2_", "prop2", true);
			telemetryContext.set("pre1_", "prop2", undefined);
			telemetryContext.setMultiple("pre3_", "obj1", { prop1: "1", prop2: 2, prop3: true });

			const serialized = telemetryContext.serialize();

			const obj = JSON.parse(serialized);

			assert.strictEqual(obj.pre1_prop1, 10);
			assert.strictEqual(obj.pre1_prop2, undefined);
			assert.strictEqual(obj.pre2_prop1, "10");
			assert.strictEqual(obj.pre2_prop2, true);
			assert.strictEqual(obj.pre3_obj1_prop1, "1");
			assert.strictEqual(obj.pre3_obj1_prop2, 2);
			assert.strictEqual(obj.pre3_obj1_prop3, true);
		});
	});
});
