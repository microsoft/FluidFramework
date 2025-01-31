/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IsoBuffer, Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";
import { ISnapshotTree, ITree } from "@fluidframework/driver-definitions/internal";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/driver-utils/internal";

import {
	SummaryTreeBuilder,
	TelemetryContext,
	convertSnapshotTreeToSummaryTree,
	convertSummaryTreeToITree,
	convertToSummaryTree,
	utf8ByteLength,
	type SummaryTreeBuilderParams,
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

	describe("SummaryTreeBuilder", () => {
		it("should initialize groupId correctly when set", () => {
			const params: SummaryTreeBuilderParams = { groupId: "testGroupId" };
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			assert.strictEqual(summaryTreeBuilder.summary.groupId, "testGroupId");
		});

		it("should initialize groupId correctly when not set", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			assert.strictEqual(summaryTreeBuilder.summary.groupId, undefined);
		});

		it("should add a blob correctly", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const blobContent = "testBlobContent";
			summaryTreeBuilder.addBlob("testBlob", blobContent);
			const summaryTree = summaryTreeBuilder.summary;
			const blob: SummaryObject | undefined = summaryTree.tree.testBlob;
			assert.strictEqual(blob.type, SummaryType.Blob);
			assert.strictEqual(blob.content, blobContent);
		});

		it("should update stats correctly when adding a blob", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const blobContent = "testBlobContent";
			summaryTreeBuilder.addBlob("testBlob", blobContent);
			const stats = summaryTreeBuilder.stats;
			assert.strictEqual(stats.blobNodeCount, 1);
			assert.strictEqual(stats.totalBlobSize, blobContent.length);
		});

		it("should add a handle correctly", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const handle = "testHandle";
			summaryTreeBuilder.addHandle("testHandleKey", SummaryType.Tree, handle);
			const summaryTree = summaryTreeBuilder.summary;
			const handleObject: SummaryObject | undefined = summaryTree.tree.testHandleKey;
			assert.strictEqual(handleObject.type, SummaryType.Handle);
			assert.strictEqual(handleObject.handleType, SummaryType.Tree);
			assert.strictEqual(handleObject.handle, handle);
		});

		it("should update stats correctly when adding a handle", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const handle = "testHandle";
			summaryTreeBuilder.addHandle("testHandleKey", SummaryType.Tree, handle);
			const stats = summaryTreeBuilder.stats;
			assert.strictEqual(stats.handleNodeCount, 1);
		});

		it("should add an attachment correctly", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const attachmentId = "testAttachmentId";
			summaryTreeBuilder.addAttachment(attachmentId);
			const summaryTree = summaryTreeBuilder.summary;
			const attachment = summaryTree.tree["0"];
			assert.strictEqual(attachment.type, SummaryType.Attachment);
			assert.strictEqual(attachment.id, attachmentId);
		});

		it("should add summarize result to summary correctly", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const summarizeResult = {
				summary: { type: SummaryType.Tree, tree: {} },
				stats: {
					blobNodeCount: 1,
					totalBlobSize: 10,
					treeNodeCount: 1,
					handleNodeCount: 0,
					unreferencedBlobSize: 0,
				},
			};
			summaryTreeBuilder.addWithStats("testKey", summarizeResult);
			const summaryTree = summaryTreeBuilder.summary;
			const subTree: SummaryObject | undefined = summaryTree.tree.testKey;
			assert.strictEqual(subTree.type, SummaryType.Tree);
			const stats = summaryTreeBuilder.stats;
			assert.strictEqual(stats.blobNodeCount, 1);
			assert.strictEqual(stats.totalBlobSize, 10);
			assert.strictEqual(stats.treeNodeCount, 2); // 1 for the root tree and 1 for the added tree
		});

		it("should get summary tree with correct stats", () => {
			const params: SummaryTreeBuilderParams = {};
			const summaryTreeBuilder = new SummaryTreeBuilder(params);
			const blobContent = "testBlobContent";
			summaryTreeBuilder.addBlob("testBlob", blobContent);
			const summaryTreeWithStats = summaryTreeBuilder.getSummaryTree();
			const summaryTree = summaryTreeWithStats.summary;
			const stats = summaryTreeWithStats.stats;
			assert.strictEqual(stats.blobNodeCount, 1);
			assert.strictEqual(stats.totalBlobSize, blobContent.length);
			assert.strictEqual(summaryTree.tree.testBlob?.type, SummaryType.Blob);
		});
	});
});
