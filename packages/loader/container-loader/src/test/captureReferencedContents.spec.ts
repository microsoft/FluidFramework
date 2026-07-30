/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import {
	captureReferencedAttachmentBlobs,
	extractBlobAttachReferences,
	inlineAttachmentBlobsByReference,
	mapWithConcurrency,
	parseGcSnapshotData,
	readReferencedSnapshotBlobs,
	snapshotHasLoadingGroups,
	unreferencedAttachmentBlobLocalIds,
	type IBlobAttachReference,
	type IGcSnapshotData,
} from "../captureReferencedContents.js";

/** Minimal storage shim whose readBlob is backed by an id → string map. */
function mockStorage(
	blobs: Record<string, string>,
): Pick<IDocumentStorageService, "readBlob"> {
	return {
		readBlob: async (id) => {
			const content: string | undefined = blobs[id];
			assert(content !== undefined, `Test storage missing blob ${id}`);
			return stringToBuffer(content, "utf8");
		},
	};
}

function tree(partial: Partial<ISnapshotTree>): ISnapshotTree {
	return { blobs: {}, trees: {}, ...partial };
}

/**
 * Encodes the same UTF-8 bytes the test storage shim returns for `content`,
 * matching the base64 output `captureReferencedAttachmentBlobs` produces.
 */
const toB64 = (content: string): string =>
	bufferToString(stringToBuffer(content, "utf8"), "base64");

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
			assert.deepStrictEqual(result, { s1: toB64("S1"), s2: toB64("S2") });
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
			assert.deepStrictEqual(result, { "keep-storage": toB64("K") });
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
			assert.deepStrictEqual(result, { "ok-storage": toB64("OK") });
		});

		it("still applies tombstones and deletedNodes when gcState is undefined", async () => {
			const { snapshot, storage } = attachmentsOnly(
				[
					["tomb", "tomb-storage"],
					["del", "del-storage"],
					["ok", "ok-storage"],
				],
				{ "tomb-storage": "x", "del-storage": "y", "ok-storage": "OK" },
			);
			const gcData: IGcSnapshotData = {
				gcState: undefined,
				tombstones: ["/_blobs/tomb"],
				deletedNodes: ["/_blobs/del"],
			};
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);
			assert.deepStrictEqual(
				result,
				{ "ok-storage": toB64("OK") },
				"tombstones and deletedNodes are authoritative even without gcState",
			);
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
				{ "recent-storage": toB64("R") },
				"blobs absent from the GC graph must be kept",
			);
		});

		it("returns legacy identity-mapped blobs from .blobs (no .redirectTable entry)", async () => {
			// Pre-redirect-table format: `.blobs` listed attachment storage ids
			// directly under their own keys, so the redirect table entry is the
			// identity mapping `(storageId, storageId)`. readRedirectTable
			// reconstructs that mapping and captureReferencedAttachmentBlobs
			// must then read those blobs.
			const snapshot = tree({
				trees: {
					".blobs": tree({
						blobs: { "legacy-storage-id": "legacy-storage-id" },
					}),
				},
			});
			const storage = mockStorage({ "legacy-storage-id": "LEGACY" });
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, undefined);
			assert.deepStrictEqual(result, { "legacy-storage-id": toB64("LEGACY") });
		});

		it("returns legacy identity-mapped blobs alongside redirect-table entries", async () => {
			// Mixed-format `.blobs`: some entries under a `.redirectTable` blob,
			// others as direct storage-id keys. Both must surface, and a
			// `.redirectTable` keyed entry must not also be treated as a legacy
			// identity-mapped entry.
			const snapshot = tree({
				trees: {
					".blobs": tree({
						blobs: {
							".redirectTable": "rt",
							"legacy-storage-id": "legacy-storage-id",
						},
					}),
				},
			});
			const storage = mockStorage({
				rt: JSON.stringify([["modern-local", "modern-storage"]]),
				"modern-storage": "MODERN",
				"legacy-storage-id": "LEGACY",
			});
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, undefined);
			assert.deepStrictEqual(result, {
				"modern-storage": toB64("MODERN"),
				"legacy-storage-id": toB64("LEGACY"),
			});
		});

		it("ignores gc nodes for non-attachment-blob paths", async () => {
			// gcState may contain unreferenced/tombstoned nodes for data stores,
			// channels, etc. Those paths must not be confused with blob localIds
			// — the attachment filter only looks at /_blobs/ paths.
			const { snapshot, storage } = attachmentsOnly([["live", "live-storage"]], {
				"live-storage": "LIVE",
			});
			const gcData: IGcSnapshotData = {
				gcState: {
					gcNodes: {
						"/dataStores/some-id": {
							outboundRoutes: [],
							unreferencedTimestampMs: 123,
						},
					},
				},
				tombstones: ["/dataStores/another"],
				deletedNodes: ["/channels/x"],
			};
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);
			assert.deepStrictEqual(
				result,
				{ "live-storage": toB64("LIVE") },
				"non-blob gc paths must not influence attachment filtering",
			);
		});

		it("integrates with parseGcSnapshotData on a snapshot that carries a real gc subtree", async () => {
			// End-to-end through both helpers: build a snapshot whose gc subtree
			// blobs encode unreferenced + tombstoned + deleted simultaneously,
			// run parseGcSnapshotData on it, then feed that into the attachment
			// filter. Verifies the full GC-driven exclusion path that
			// captureFullContainerState relies on, not just the helpers in
			// isolation.
			const snapshot = tree({
				trees: {
					".blobs": tree({ blobs: { ".redirectTable": "rt" } }),
					gc: tree({
						blobs: {
							__gc_root: "gc-blob",
							__tombstones: "ts-blob",
							__deletedNodes: "del-blob",
						},
					}),
				},
			});
			const storage = mockStorage({
				rt: JSON.stringify([
					["live", "live-storage"],
					["unref", "unref-storage"],
					["tomb", "tomb-storage"],
					["del", "del-storage"],
				]),
				"gc-blob": JSON.stringify({
					gcNodes: {
						"/_blobs/live": { outboundRoutes: [] },
						"/_blobs/unref": {
							outboundRoutes: [],
							unreferencedTimestampMs: 1700000000000,
						},
					},
				}),
				"ts-blob": JSON.stringify(["/_blobs/tomb"]),
				"del-blob": JSON.stringify(["/_blobs/del"]),
				"live-storage": "LIVE",
				"unref-storage": "must-not-read",
				"tomb-storage": "must-not-read",
				"del-storage": "must-not-read",
			});

			const gcData = await parseGcSnapshotData(snapshot, storage);
			assert(gcData !== undefined, "snapshot has a gc subtree, so gcData must parse");
			const result = await captureReferencedAttachmentBlobs(snapshot, storage, gcData);

			assert.deepStrictEqual(
				result,
				{ "live-storage": toB64("LIVE") },
				"only the live blob survives all three GC mechanisms",
			);
		});
	});

	describe("snapshotHasLoadingGroups", () => {
		it("returns false for a snapshot with no groupIds anywhere", () => {
			const snapshot = tree({
				trees: {
					a: tree({ trees: { nested: tree({}) } }),
					b: tree({}),
				},
			});
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), false);
		});

		it("returns true for a groupId on a top-level subtree", () => {
			const snapshot = tree({
				trees: { a: tree({ groupId: "g1" }) },
			});
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), true);
		});

		it("returns true for a groupId on a deeply nested subtree", () => {
			const snapshot = tree({
				trees: {
					a: tree({
						trees: {
							fine: tree({}),
							deep: tree({
								trees: { deeper: tree({ groupId: "g1" }) },
							}),
						},
					}),
				},
			});
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), true);
		});

		it("ignores groupIds inside unreferenced subtrees", () => {
			const snapshot = tree({
				trees: {
					dead: tree({ unreferenced: true, groupId: "dead-group" }),
				},
			});
			assert.strictEqual(
				snapshotHasLoadingGroups(snapshot),
				false,
				"unreferenced subtrees would not be loaded by the runtime, so their groupIds don't count",
			);
		});

		it("returns false when the entire snapshot is unreferenced", () => {
			const snapshot = tree({ unreferenced: true, groupId: "g1" });
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), false);
		});
	});

	describe("extractBlobAttachReferences", () => {
		it("extracts (localId, storageId) from BlobAttach metadata", () => {
			const result = extractBlobAttachReferences({
				metadata: { localId: "L", blobId: "S" },
			});
			assert.deepStrictEqual(result, [{ localId: "L", storageId: "S" }]);
		});

		it("returns [] when metadata is undefined", () => {
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: undefined }), []);
		});

		it("returns [] when metadata is null", () => {
			// eslint-disable-next-line unicorn/no-null
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: null }), []);
		});

		it("returns [] when metadata is not an object", () => {
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: "string" }), []);
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: 42 }), []);
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: true }), []);
		});

		it("returns [] when localId is missing", () => {
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: { blobId: "S" } }), []);
		});

		it("returns [] when blobId is missing", () => {
			assert.deepStrictEqual(extractBlobAttachReferences({ metadata: { localId: "L" } }), []);
		});

		it("returns [] when localId is not a string", () => {
			assert.deepStrictEqual(
				extractBlobAttachReferences({ metadata: { localId: 1, blobId: "S" } }),
				[],
			);
		});

		it("returns [] when blobId is not a string", () => {
			assert.deepStrictEqual(
				extractBlobAttachReferences({ metadata: { localId: "L", blobId: 2 } }),
				[],
			);
		});

		it("tolerates extra fields on metadata", () => {
			const result = extractBlobAttachReferences({
				metadata: { localId: "L", blobId: "S", batchId: "b", extra: 99 },
			});
			assert.deepStrictEqual(result, [{ localId: "L", storageId: "S" }]);
		});
	});

	describe("unreferencedAttachmentBlobLocalIds", () => {
		it("returns undefined when gcData is undefined", () => {
			assert.strictEqual(unreferencedAttachmentBlobLocalIds(undefined), undefined);
		});

		it("returns an empty set when gcData has no unreferenced/tombstoned/deleted blobs", () => {
			const result = unreferencedAttachmentBlobLocalIds({
				gcState: {
					gcNodes: { "/_blobs/live": { outboundRoutes: [] } },
				},
				tombstones: undefined,
				deletedNodes: undefined,
			});
			assert.deepStrictEqual([...(result ?? [])], []);
		});

		it("collects localIds from gcState, tombstones, and deletedNodes", () => {
			const result = unreferencedAttachmentBlobLocalIds({
				gcState: {
					gcNodes: {
						"/_blobs/unref": {
							outboundRoutes: [],
							unreferencedTimestampMs: 1,
						},
						"/_blobs/live": { outboundRoutes: [] },
					},
				},
				tombstones: ["/_blobs/tomb"],
				deletedNodes: ["/_blobs/del"],
			});
			assert.deepStrictEqual([...(result ?? [])].sort(), ["del", "tomb", "unref"]);
		});

		it("ignores non-/_blobs/ paths in all three sources", () => {
			const result = unreferencedAttachmentBlobLocalIds({
				gcState: {
					gcNodes: {
						"/dataStores/x": {
							outboundRoutes: [],
							unreferencedTimestampMs: 1,
						},
					},
				},
				tombstones: ["/dataStores/y"],
				deletedNodes: ["/channels/z"],
			});
			assert.deepStrictEqual([...(result ?? [])], []);
		});
	});

	describe("inlineAttachmentBlobsByReference", () => {
		it("returns {} for empty references", async () => {
			const storage = mockStorage({});
			const result = await inlineAttachmentBlobsByReference([], storage, undefined, {});
			assert.deepStrictEqual(result, {});
		});

		it("reads each unique storageId once and base64-encodes", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "l1", storageId: "s1" },
				{ localId: "l2", storageId: "s2" },
			];
			const storage = mockStorage({ s1: "S1", s2: "S2" });
			const result = await inlineAttachmentBlobsByReference(refs, storage, undefined, {});
			assert.deepStrictEqual(result, { s1: toB64("S1"), s2: toB64("S2") });
		});

		it("collapses multiple references that share a storageId to a single read", async () => {
			let reads = 0;
			const storage: Pick<IDocumentStorageService, "readBlob"> = {
				readBlob: async (id) => {
					reads++;
					return stringToBuffer(`bytes-${id}`, "utf8");
				},
			};
			const refs: IBlobAttachReference[] = [
				{ localId: "a", storageId: "shared" },
				{ localId: "b", storageId: "shared" },
				{ localId: "c", storageId: "shared" },
			];
			const result = await inlineAttachmentBlobsByReference(refs, storage, undefined, {});
			assert.deepStrictEqual(result, { shared: toB64("bytes-shared") });
			assert.strictEqual(reads, 1, "shared storageId must be read at most once");
		});

		it("skips references whose localId is in unreferencedLocalIds", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "keep", storageId: "keep-s" },
				{ localId: "drop", storageId: "drop-s" },
			];
			// drop-s is intentionally absent from storage — touching it would throw.
			const storage = mockStorage({ "keep-s": "K" });
			const result = await inlineAttachmentBlobsByReference(
				refs,
				storage,
				new Set(["drop"]),
				{},
			);
			assert.deepStrictEqual(result, { "keep-s": toB64("K") });
		});

		it("skips references whose storageId is already in existing", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "old", storageId: "old-s" },
				{ localId: "new", storageId: "new-s" },
			];
			// old-s is intentionally absent from storage — touching it would throw.
			const storage = mockStorage({ "new-s": "N" });
			const existing = { "old-s": toB64("PRE") };
			const result = await inlineAttachmentBlobsByReference(
				refs,
				storage,
				undefined,
				existing,
			);
			assert.deepStrictEqual(
				result,
				{ "new-s": toB64("N") },
				"only freshly-read entries are returned; caller merges with existing",
			);
		});

		it("returns {} when every reference is filtered out", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "drop", storageId: "drop-s" },
				{ localId: "dup", storageId: "dup-s" },
			];
			const storage = mockStorage({});
			const result = await inlineAttachmentBlobsByReference(refs, storage, new Set(["drop"]), {
				"dup-s": toB64("X"),
			});
			assert.deepStrictEqual(result, {});
		});
	});

	describe("mapWithConcurrency", () => {
		it("returns [] for empty input", async () => {
			const calls: number[] = [];
			const result = await mapWithConcurrency<number, number>([], 4, async (x) => {
				calls.push(x);
				return x;
			});
			assert.deepStrictEqual(result, []);
			assert.deepStrictEqual(calls, []);
		});

		it("preserves input order on output", async () => {
			// Reverse the natural completion order: earlier indices wait longer,
			// so an order-by-completion implementation would visibly fail.
			const items = [0, 1, 2, 3, 4];
			const result = await mapWithConcurrency(items, 8, async (x) => {
				await new Promise((resolve) => setTimeout(resolve, (items.length - x) * 2));
				return x * 10;
			});
			assert.deepStrictEqual(result, [0, 10, 20, 30, 40]);
		});

		it("processes every item exactly once", async () => {
			const seen = new Set<number>();
			const items = Array.from({ length: 25 }, (_, i) => i);
			await mapWithConcurrency(items, 4, async (x) => {
				assert(!seen.has(x), `item ${x} processed twice`);
				seen.add(x);
				return x;
			});
			assert.strictEqual(seen.size, items.length);
		});

		it("never exceeds the configured concurrency limit", async () => {
			let inFlight = 0;
			let peak = 0;
			const limit = 3;
			const items = Array.from({ length: 20 }, (_, i) => i);
			await mapWithConcurrency(items, limit, async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				// Yield so other workers can ramp up before this one finishes.
				await new Promise((resolve) => setTimeout(resolve, 5));
				inFlight--;
			});
			assert(peak <= limit, `peak concurrency ${peak} exceeded limit ${limit}`);
			assert(peak >= 2, `expected concurrency > 1, got peak ${peak}`);
		});

		it("caps worker count at items.length when limit > items.length", async () => {
			let peak = 0;
			let inFlight = 0;
			await mapWithConcurrency([1, 2], 100, async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 2));
				inFlight--;
			});
			assert(peak <= 2, `peak concurrency ${peak} exceeded item count`);
		});

		it("propagates errors from fn", async () => {
			await assert.rejects(
				mapWithConcurrency([1, 2, 3], 2, async (x) => {
					if (x === 2) {
						throw new Error("boom");
					}
					return x;
				}),
				/boom/,
			);
		});
	});
});
