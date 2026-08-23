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
	readReferencedSnapshotBlobs,
	snapshotHasLoadingGroups,
	type IBlobAttachReference,
} from "../captureReferencedContents.js";

/** Minimal storage shim whose readBlob is backed by an id → content map. */
function mockStorage(
	blobs: Record<string, string | Uint8Array>,
): Pick<IDocumentStorageService, "readBlob"> {
	return {
		readBlob: async (id) => {
			const content: string | Uint8Array | undefined = blobs[id];
			assert(content !== undefined, `Test storage missing blob ${id}`);
			return typeof content === "string" ? stringToBuffer(content, "utf8") : content;
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

const rawContentsToBase64 = (
	contents: ReadonlyMap<string, ArrayBufferLike>,
): Record<string, string> =>
	Object.fromEntries(
		[...contents].map(([id, content]) => [id, bufferToString(content, "base64")]),
	);

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
			assert.deepStrictEqual(rawContentsToBase64(result), {
				a: toB64("A"),
				b: toB64("B"),
				c: toB64("C"),
			});
		});

		it("retains unreferenced subtrees that saved ops may revive", async () => {
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
			const storage = mockStorage({
				kept: "KEPT",
				skipped: "DEAD",
				"skipped-too": "NESTED",
			});
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(rawContentsToBase64(result), {
				kept: toB64("KEPT"),
				skipped: toB64("DEAD"),
				"skipped-too": toB64("NESTED"),
			});
		});

		it("captures structural child blobs under root .blobs but skips direct attachments", async () => {
			const embeddedBytes = new Uint8Array([0xff, 0x00, 0x80]);
			const snapshot = tree({
				trees: {
					".blobs": tree({
						blobs: {
							".redirectTable": "rt",
							"attachment-storage-id": "attachment-storage-id",
						},
						trees: {
							".embeddedDetachedBlobs": tree({
								blobs: { localId: "embedded-content-id" },
								groupId: "embeddedDetachedBlobs",
							}),
						},
					}),
				},
			});
			const storage = mockStorage({
				rt: "RT",
				"embedded-content-id": embeddedBytes,
			});
			const result = await readReferencedSnapshotBlobs(snapshot, storage);
			assert.deepStrictEqual(
				rawContentsToBase64(result),
				{
					rt: toB64("RT"),
					"embedded-content-id": bufferToString(embeddedBytes, "base64"),
				},
				"attachment blob contents must not be read via the general walker",
			);
		});

		it("retains unreferenced summary-backed blobs that saved ops may revive", async () => {
			const snapshot = tree({
				trees: {
					".blobs": tree({
						trees: {
							embedded: tree({
								blobs: {
									liveLocalId: "live-content-id",
									deadLocalId: "dead-content-id",
								},
								groupId: "embeddedDetachedBlobs",
							}),
						},
					}),
				},
			});
			const result = await readReferencedSnapshotBlobs(
				snapshot,
				mockStorage({
					"live-content-id": "LIVE",
					"dead-content-id": "DEAD",
				}),
			);
			assert.deepStrictEqual(rawContentsToBase64(result), {
				"live-content-id": toB64("LIVE"),
				"dead-content-id": toB64("DEAD"),
			});
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
			assert.deepStrictEqual(rawContentsToBase64(result), {
				"content-id": toB64("IN-MEMORY"),
			});
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
			const result = await captureReferencedAttachmentBlobs(tree({}), mockStorage({}));
			assert.deepStrictEqual(result, {});
		});

		it("includes every attachment blob", async () => {
			const { snapshot, storage } = attachmentsOnly(
				[
					["l1", "s1"],
					["l2", "s2"],
				],
				{ s1: "S1", s2: "S2" },
			);
			const result = await captureReferencedAttachmentBlobs(snapshot, storage);
			assert.deepStrictEqual(result, { s1: toB64("S1"), s2: toB64("S2") });
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
			const result = await captureReferencedAttachmentBlobs(snapshot, storage);
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
			const result = await captureReferencedAttachmentBlobs(snapshot, storage);
			assert.deepStrictEqual(result, {
				"modern-storage": toB64("MODERN"),
				"legacy-storage-id": toB64("LEGACY"),
			});
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

		it("detects groupIds inside unreferenced subtrees that may be revived", () => {
			const snapshot = tree({
				trees: {
					dead: tree({ unreferenced: true, groupId: "dead-group" }),
				},
			});
			assert.strictEqual(
				snapshotHasLoadingGroups(snapshot),
				true,
				"saved ops may revive the subtree, so full capture must reject the unsupported group",
			);
		});

		it("detects a groupId when the entire snapshot is unreferenced", () => {
			const snapshot = tree({ unreferenced: true, groupId: "g1" });
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), true);
		});

		it("ignores groupIds only inside the reserved root .blobs subtree", () => {
			const snapshot = tree({
				trees: {
					".blobs": tree({
						trees: {
							".embeddedDetachedBlobs": tree({
								groupId: "embeddedDetachedBlobs",
								trees: { nested: tree({ groupId: "nested-blob-group" }) },
							}),
						},
					}),
				},
			});
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), false);

			snapshot.trees.other = tree({ groupId: "ordinary-loading-group" });
			assert.strictEqual(snapshotHasLoadingGroups(snapshot), true);
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

	describe("inlineAttachmentBlobsByReference", () => {
		it("returns {} for empty references", async () => {
			const storage = mockStorage({});
			const result = await inlineAttachmentBlobsByReference([], storage, {});
			assert.deepStrictEqual(result, {});
		});

		it("reads each unique storageId once and base64-encodes", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "l1", storageId: "s1" },
				{ localId: "l2", storageId: "s2" },
			];
			const storage = mockStorage({ s1: "S1", s2: "S2" });
			const result = await inlineAttachmentBlobsByReference(refs, storage, {});
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
			const result = await inlineAttachmentBlobsByReference(refs, storage, {});
			assert.deepStrictEqual(result, { shared: toB64("bytes-shared") });
			assert.strictEqual(reads, 1, "shared storageId must be read at most once");
		});

		it("skips references whose storageId is already in existing", async () => {
			const refs: IBlobAttachReference[] = [
				{ localId: "old", storageId: "old-s" },
				{ localId: "new", storageId: "new-s" },
			];
			// old-s is intentionally absent from storage — touching it would throw.
			const storage = mockStorage({ "new-s": "N" });
			const existing = { "old-s": toB64("PRE") };
			const result = await inlineAttachmentBlobsByReference(refs, storage, existing);
			assert.deepStrictEqual(
				result,
				{ "new-s": toB64("N") },
				"only freshly-read entries are returned; caller merges with existing",
			);
		});

		it("returns {} when every reference already exists", async () => {
			const refs: IBlobAttachReference[] = [{ localId: "dup", storageId: "dup-s" }];
			const storage = mockStorage({});
			const result = await inlineAttachmentBlobsByReference(refs, storage, {
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
