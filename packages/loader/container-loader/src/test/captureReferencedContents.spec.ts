/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshot,
	ISnapshotFetchOptions,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import {
	captureGroupIdSnapshots,
	captureReferencedAttachmentBlobs,
	parseGcSnapshotData,
	readReferencedSnapshotBlobs,
	type IGcSnapshotData,
} from "../captureReferencedContents.js";

/** Minimal storage shim whose readBlob is backed by an id → string map. */
function mockStorage(
	blobs: Record<string, string>,
	getSnapshot?: (options: ISnapshotFetchOptions | undefined) => Promise<ISnapshot>,
): Pick<IDocumentStorageService, "readBlob"> & {
	getSnapshot?: IDocumentStorageService["getSnapshot"];
} {
	return {
		readBlob: async (id) => {
			const content = blobs[id];
			assert(content !== undefined, `Test storage missing blob ${id}`);
			return stringToBuffer(content, "utf8");
		},
		getSnapshot,
	};
}

function tree(partial: Partial<ISnapshotTree>): ISnapshotTree {
	return { blobs: {}, trees: {}, ...partial };
}

describe("captureReferencedContents", () => {
	describe("readReferencedSnapshotBlobs", () => {
		it("inlines every blob in a fully-referenced tree", async () => {
			const snapshot = tree({
				blobs: { attributes: "a" },
				trees: {
					".channels": tree({
						trees: {
							ds1: tree({
								blobs: { ".component": "b" },
								trees: {
									root: tree({ blobs: { header: "c" } }),
								},
							}),
						},
					}),
				},
			});
			const storage = mockStorage({ a: "A", b: "B", c: "C" });
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(result, { a: "A", b: "B", c: "C" });
		});

		it("skips subtrees flagged unreferenced", async () => {
			const snapshot = tree({
				trees: {
					live: tree({ blobs: { live: "kept" } }),
					dead: tree({
						unreferenced: true,
						blobs: { dead: "skipped" },
						trees: { nested: tree({ blobs: { nested: "skipped-too" } }) },
					}),
				},
			});
			const storage = mockStorage({ kept: "KEPT" });
			// Missing entries would throw in the storage shim, asserting we never read them.
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(result, { kept: "KEPT" });
		});

		it("special-cases root .blobs: reads only the redirect table", async () => {
			const snapshot = tree({
				trees: {
					".blobs": tree({
						blobs: {
							".redirectTable": "rt",
							"attachment-storage-id": "attachment-storage-id",
						},
					}),
				},
			});
			const storage = mockStorage({ rt: "RT" });
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(
				result,
				{ rt: "RT" },
				"attachment blob contents must not be read via the general walker",
			);
		});

		it("prefers ISnapshot.blobContents over storage when given an ISnapshot", async () => {
			const snapshotTree = tree({ blobs: { x: "content-id" } });
			const snapshot: ISnapshot = {
				snapshotTree,
				blobContents: new Map([["content-id", stringToBuffer("IN-MEMORY", "utf8")]]),
				ops: [],
				sequenceNumber: 10,
				latestSequenceNumber: undefined,
				snapshotFormatV: 1,
			};
			// storage has a different value — if it's consulted, the test fails.
			const storage = mockStorage({ "content-id": "FROM-STORAGE" });
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(result, { "content-id": "IN-MEMORY" });
		});
	});

	describe("parseGcSnapshotData", () => {
		it("returns undefined when the snapshot has no gc tree", async () => {
			const result = await parseGcSnapshotData(tree({}), mockStorage({}));
			assert.strictEqual(result, undefined);
		});

		it("parses gc state, tombstones, and deleted nodes from their blob keys", async () => {
			const snapshot = tree({
				trees: {
					gc: tree({
						blobs: {
							__gc_root: "gcblob",
							__tombstones: "tsblob",
							__deletedNodes: "delblob",
						},
					}),
				},
			});
			const storage = mockStorage({
				gcblob: JSON.stringify({
					gcNodes: { "/a": { outboundRoutes: [], unreferencedTimestampMs: 1 } },
				}),
				tsblob: JSON.stringify(["/b"]),
				delblob: JSON.stringify(["/c"]),
			});
			const result = await parseGcSnapshotData(snapshot, storage);
			assert(result !== undefined);
			assert.deepStrictEqual(result.tombstones, ["/b"]);
			assert.deepStrictEqual(result.deletedNodes, ["/c"]);
			assert.strictEqual(
				result.gcState?.gcNodes["/a"]?.unreferencedTimestampMs,
				1,
				"gc state merged from __gc-prefixed blobs",
			);
		});
	});

	describe("captureReferencedAttachmentBlobs", () => {
		function attachmentsOnly(
			table: [string, string][],
			blobBytes: Record<string, string>,
		): {
			snapshot: ISnapshotTree;
			storage: ReturnType<typeof mockStorage>;
		} {
			const blobs: Record<string, string> = {
				rt: JSON.stringify(table),
				...blobBytes,
			};
			const snapshot = tree({
				trees: {
					".blobs": tree({ blobs: { ".redirectTable": "rt" } }),
				},
			});
			return { snapshot, storage: mockStorage(blobs) };
		}

		it("returns {} when there is no .blobs subtree", async () => {
			const result = await captureReferencedAttachmentBlobs(
				tree({}),
				mockStorage({}),
				undefined,
			);
			assert.deepStrictEqual(result, {});
		});

		it("includes every attachment blob when gc data is undefined", async () => {
			const { snapshot, storage } = attachmentsOnly(
				[
					["l1", "s1"],
					["l2", "s2"],
				],
				{ s1: "S1", s2: "S2" },
			);
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, undefined);
			assert.deepStrictEqual(result, { s1: "S1", s2: "S2" });
		});

		it("skips blobs marked unreferenced in gc state", async () => {
			const { snapshot, storage } = attachmentsOnly(
				[
					["keep", "keep-storage"],
					["drop", "drop-storage"],
				],
				{ "keep-storage": "K", "drop-storage": "must-not-read" },
			);
			const gcData: IGcSnapshotData = {
				gcState: {
					gcNodes: {
						"/_blobs/drop": { outboundRoutes: [], unreferencedTimestampMs: 123 },
						"/_blobs/keep": { outboundRoutes: [] },
					},
				},
				tombstones: undefined,
				deletedNodes: undefined,
			};
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);
			assert.deepStrictEqual(result, { "keep-storage": "K" });
		});

		it("skips blobs listed in tombstones or deletedNodes", async () => {
			const { snapshot, storage } = attachmentsOnly(
				[
					["tomb", "tomb-storage"],
					["del", "del-storage"],
					["ok", "ok-storage"],
				],
				{ "tomb-storage": "x", "del-storage": "y", "ok-storage": "OK" },
			);
			const gcData: IGcSnapshotData = {
				gcState: { gcNodes: {} },
				tombstones: ["/_blobs/tomb"],
				deletedNodes: ["/_blobs/del"],
			};
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);
			assert.deepStrictEqual(result, { "ok-storage": "OK" });
		});

		it("keeps blobs that are absent from the gc graph (gc lag tolerance)", async () => {
			const { snapshot, storage } = attachmentsOnly([["recent", "recent-storage"]], {
				"recent-storage": "R",
			});
			const gcData: IGcSnapshotData = {
				gcState: { gcNodes: {} }, // empty graph: the blob isn't listed at all
				tombstones: undefined,
				deletedNodes: undefined,
			};
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);
			assert.deepStrictEqual(
				result,
				{ "recent-storage": "R" },
				"blobs absent from the GC graph must be kept",
			);
		});
	});

	describe("captureGroupIdSnapshots", () => {
		it("returns {} when the driver does not support getSnapshot", async () => {
			const snapshot = tree({ groupId: "g", trees: {} });
			const storage = mockStorage({});
			const result = await captureGroupIdSnapshots(snapshot, storage, "v", "scenario");
			assert.deepStrictEqual(result, {});
		});

		it("returns {} when the snapshot has no groupIds", async () => {
			const snapshot = tree({
				trees: { ds: tree({}) },
			});
			const storage = mockStorage({}, async () => assert.fail("should not fetch groups"));
			const result = await captureGroupIdSnapshots(snapshot, storage, "v", "scenario");
			assert.deepStrictEqual(result, {});
		});

		it("skips groupIds inside unreferenced subtrees", async () => {
			const snapshot = tree({
				trees: {
					live: tree({ groupId: "live-group" }),
					dead: tree({ unreferenced: true, groupId: "dead-group" }),
				},
			});
			const fetched = new Set<string>();
			const storage = mockStorage({}, async (opts) => {
				fetched.add(opts?.loadingGroupIds?.[0] ?? "");
				return emptyGroupSnapshot("live-tree", 5);
			});
			await captureGroupIdSnapshots(snapshot, storage, "v", "scenario");
			assert.deepStrictEqual([...fetched].sort(), ["live-group"]);
		});

		it("fetches each unique groupId once and serializes the result", async () => {
			const snapshot = tree({
				trees: {
					a: tree({ groupId: "g1" }),
					b: tree({ groupId: "g2" }),
					c: tree({ groupId: "g1" }), // duplicate
				},
			});
			const requestedGroupIds: string[] = [];
			const requestedVersions: (string | undefined)[] = [];
			const storage = mockStorage({}, async (opts) => {
				const groupId = opts?.loadingGroupIds?.[0] ?? "";
				requestedGroupIds.push(groupId);
				requestedVersions.push(opts?.versionId);
				return emptyGroupSnapshot(`${groupId}-tree`, groupId === "g1" ? 11 : 22);
			});
			const result = await captureGroupIdSnapshots(snapshot, storage, "v1", "scenario");
			assert.deepStrictEqual(
				requestedGroupIds.sort(),
				["g1", "g2"],
				"each unique groupId fetched exactly once",
			);
			assert(
				requestedVersions.every((v) => v === "v1"),
				"versionId from the main snapshot is forwarded to each group fetch",
			);
			assert.strictEqual(result.g1?.snapshotSequenceNumber, 11);
			assert.strictEqual(result.g2?.snapshotSequenceNumber, 22);
			assert.strictEqual(result.g1?.baseSnapshot.id, "g1-tree");
			assert.strictEqual(result.g2?.baseSnapshot.id, "g2-tree");
		});
	});
});

function emptyGroupSnapshot(id: string, sequenceNumber: number): ISnapshot {
	return {
		snapshotTree: { id, blobs: {}, trees: {} },
		blobContents: new Map(),
		ops: [],
		sequenceNumber,
		latestSequenceNumber: undefined,
		snapshotFormatV: 1,
	};
}
