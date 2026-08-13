/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer, Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";
import type {
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryObject,
} from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree, ITree } from "@fluidframework/driver-definitions/internal";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/driver-utils/internal";
import type { ISummaryStats } from "@fluidframework/runtime-definitions/internal";

import {
	SummaryBuilder,
	SummaryTreeBuilder,
	TelemetryContext,
	addSummaryTreeToBuilder,
	convertSnapshotTreeToSummaryTree,
	convertSummaryTreeToITree,
	convertToSummaryTree,
	utf8ByteLength,
	type SummaryTreeBuilderParams,
} from "../summaryUtils.js";

describe("Summary Utils", () => {
	function assertSummaryTree(obj: SummaryObject): ISummaryTree {
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain, @typescript-eslint/strict-boolean-expressions -- TODO: ADO#58524 Code owners should verify if this code change is safe and make it if so or update this comment otherwise
		if (obj && obj.type === SummaryType.Tree) {
			return obj;
		} else {
			assert.fail("Object should be summary tree");
		}
	}
	function assertSummaryBlob(obj: SummaryObject): ISummaryBlob {
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain, @typescript-eslint/strict-boolean-expressions -- TODO: ADO#58524 Code owners should verify if this code change is safe and make it if so or update this comment otherwise
		if (obj && obj.type === SummaryType.Blob) {
			return obj;
		} else {
			assert.fail("Object should be summary blob");
		}
	}
	function assertSummaryHandle(obj: SummaryObject): ISummaryHandle {
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain, @typescript-eslint/strict-boolean-expressions -- TODO: ADO#58524 Code owners should verify if this code change is safe and make it if so or update this comment otherwise
		if (obj && obj.type === SummaryType.Handle) {
			return obj;
		} else {
			assert.fail("Object should be summary handle");
		}
	}

	describe("SummaryBuilder", () => {
		it("builds nested trees and accumulates stats at the root", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			const dataStore = root.createBuilderForChild(".channels", false);
			const dds = dataStore.createBuilderForChild("dds", false);
			dds.addBlob("header", "content");

			const { summary, stats } = root.getSummaryTreeWithStats();
			const channelsTree = assertSummaryTree(summary.tree[".channels"]);
			const ddsTree = assertSummaryTree(channelsTree.tree.dds);
			assert.equal(assertSummaryBlob(ddsTree.tree.header).content, "content");
			assert.deepEqual(stats, {
				treeNodeCount: 3,
				blobNodeCount: 1,
				handleNodeCount: 0,
				totalBlobSize: 7,
				unreferencedBlobSize: 0,
			});
		});

		it("uses the summary-tree path when a child did not change", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			const channels = root.createBuilderForChild(".channels", false);
			const dataStore = channels.createBuilderForChild("dataStore", false);
			dataStore.nodeDidNotChange();

			const channelsTree = assertSummaryTree(
				root.getSummaryTreeWithStats().summary.tree[".channels"],
			);
			assert.deepEqual(assertSummaryHandle(channelsTree.tree.dataStore), {
				type: SummaryType.Handle,
				handleType: SummaryType.Tree,
				handle: "/.channels/dataStore",
			});
		});

		it("preserves attachment keys when copying an existing summary", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			addSummaryTreeToBuilder(root, {
				type: SummaryType.Tree,
				tree: {
					"custom-key": { type: SummaryType.Attachment, id: "storage-id" },
				},
			});

			assert.deepEqual(root.getSummaryTreeWithStats().summary.tree["custom-key"], {
				type: SummaryType.Attachment,
				id: "storage-id",
			});
		});

		it("reports stats for the node they are asked of, not the whole summary", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			root.addBlob("rootBlob", "root");
			const child = root.createBuilderForChild("child", false);
			child.addBlob("childBlob", "child-content");

			assert.deepEqual(child.getSummaryTreeWithStats().stats, {
				treeNodeCount: 1,
				blobNodeCount: 1,
				handleNodeCount: 0,
				totalBlobSize: 13,
				unreferencedBlobSize: 0,
			});
			assert.deepEqual(root.getSummaryTreeWithStats().stats, {
				treeNodeCount: 2,
				blobNodeCount: 2,
				handleNodeCount: 0,
				totalBlobSize: 17,
				unreferencedBlobSize: 0,
			});
		});

		it("counts an unchanged node as a single handle", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			const child = root.createBuilderForChild("child", false);
			child.nodeDidNotChange();

			assert.deepEqual(root.getSummaryTreeWithStats().stats, {
				treeNodeCount: 1,
				blobNodeCount: 0,
				handleNodeCount: 1,
				totalBlobSize: 0,
				unreferencedBlobSize: 0,
			});
		});

		it("attributes unreferenced blob size regardless of when the node is marked", () => {
			const statsForOrder = (markFirst: boolean): ISummaryStats => {
				const root = SummaryBuilder.createRootBuilder(false);
				const child = root.createBuilderForChild("child", false);
				if (markFirst) {
					child.markUnreferenced();
				}
				child.addBlob("blob", "unreferenced");
				child.createBuilderForChild("grandChild", false).addBlob("blob", "nested");
				if (!markFirst) {
					child.markUnreferenced();
				}
				return root.getSummaryTreeWithStats().stats;
			};

			const markedFirst = statsForOrder(true);
			assert.equal(markedFirst.totalBlobSize, 18);
			assert.equal(markedFirst.unreferencedBlobSize, 18);
			assert.deepEqual(statsForOrder(false), markedFirst);
		});

		it("omits child builders that never produced content", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			root.createBuilderForChild("unused", false);

			const { summary, stats } = root.getSummaryTreeWithStats();
			assert.deepEqual(summary.tree, {});
			assert.equal(stats.treeNodeCount, 1);
		});

		it("rejects invalid node state transitions", () => {
			const root = SummaryBuilder.createRootBuilder(false);
			assert.throws(() => root.nodeDidNotChange(), /Root node cannot be a handle/);

			const unchanged = root.createBuilderForChild("unchanged", false);
			unchanged.nodeDidNotChange();
			assert.throws(
				() => unchanged.addBlob("blob", "content"),
				/Content cannot be added to a node that declared itself unchanged/,
			);

			const changed = root.createBuilderForChild("changed", false);
			changed.addBlob("blob", "content");
			assert.throws(
				() => changed.nodeDidNotChange(),
				/Node cannot be a handle after content has been added to it/,
			);
		});

		it("rejects handles in a full-tree summary", () => {
			const root = SummaryBuilder.createRootBuilder(true);
			const child = root.createBuilderForChild("child", true);
			assert.throws(
				() => child.nodeDidNotChange(),
				/Node cannot be a handle when fullTree is enabled/,
			);
			assert.throws(
				() => child.addHandle("handle", SummaryType.Blob, "/blob"),
				/Cannot add a handle when fullTree is enabled/,
			);
		});
	});

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

			const obj = JSON.parse(serialized) as Record<string, unknown>;

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
			assert(blob !== undefined);
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
			assert(handleObject !== undefined);
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
			assert(subTree !== undefined);
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
			const testBlob: SummaryObject | undefined = summaryTree.tree.testBlob;
			assert(testBlob !== undefined);
			assert.strictEqual(testBlob.type, SummaryType.Blob);
		});
	});
});
