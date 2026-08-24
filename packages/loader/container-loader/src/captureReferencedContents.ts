/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISequencedDocumentMessage,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";

import type { IBase64BlobContents } from "./containerStorageAdapter.js";

/**
 * Wire-format constants this module needs to walk snapshots. Authoritative
 * definitions live in `container-runtime`; the values are duplicated here to
 * avoid a loader → runtime layering dependency. A contract test in
 * `packages/test/local-server-tests` asserts these match the authoritative
 * values; do not change them in isolation.
 *
 * Authoritative sources:
 * - `blobsTreeName`, `redirectTableBlobName`: `packages/runtime/container-runtime/src/blobManager/blobManagerSnapSum.ts`
 * @internal
 */
export const wireFormatConstants = {
	blobsTreeName: ".blobs",
	redirectTableBlobName: ".redirectTable",
} as const;

const { blobsTreeName, redirectTableBlobName } = wireFormatConstants;
const embeddedBlobsTreeName = ".embeddedDetachedBlobs";

/** Reader that returns a blob's contents for a given storage id. */
type BlobReader = (id: string) => Promise<ArrayBufferLike>;

/**
 * Upper bound on concurrent `readBlob` calls. Driver/service back-pressure is
 * real for large documents, and unbounded `Promise.all` can trigger throttling
 * or spike memory. The value is a pragmatic middle ground — high enough to
 * keep a typical driver's request pipeline full, low enough to avoid storms.
 */
export const maxReadConcurrency = 32;

/**
 * Runs `fn` over `items` with at most `limit` promises in flight. Preserves
 * input order on output (not that any caller depends on it today).
 *
 * Exported for unit tests; not part of the package public API.
 *
 * @internal
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	let cursor = 0;
	const workerCount = Math.min(limit, items.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			const item = items[index];
			if (item !== undefined) {
				results[index] = await fn(item);
			}
		}
	});
	await Promise.all(workers);
	return results;
}

/**
 * Walks a snapshot and inlines every structural blob present in it.
 * Unreferenced-but-unswept content is retained because saved ops after the
 * snapshot may revive it.
 *
 * The root-level `.blobs` subtree is special-cased because its direct blob
 * entries are attachment payloads captured separately via
 * {@link captureReferencedAttachmentBlobs}. Its `.redirectTable` and blobs in
 * child trees are ordinary structural summary data and are captured here.
 *
 * Returned values are the original bytes. The caller performs the single
 * UTF-8/base64 serialization pass.
 */
export async function readReferencedSnapshotBlobs(
	snapshot: ISnapshot | ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<Map<string, ArrayBufferLike>> {
	const { tree, read } = toTreeAndReader(snapshot, storage);
	const ids = new Set<string>();
	collectReferencedBlobIds(tree, true, ids);
	const blobs = new Map<string, ArrayBufferLike>();
	await mapWithConcurrency([...ids], maxReadConcurrency, async (id) => {
		blobs.set(id, await read(id));
	});
	return blobs;
}

/**
 * Synchronously walks the snapshot tree and gathers the structural blob ids
 * that should be inlined. The root-level `.blobs` subtree is special-cased:
 * direct attachment entries are skipped, while its `.redirectTable` and
 * structural child-tree blobs are collected.
 */
function collectReferencedBlobIds(
	tree: ISnapshotTree,
	isRoot: boolean,
	ids: Set<string>,
): void {
	for (const blobId of Object.values(tree.blobs)) {
		ids.add(blobId);
	}
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (isRoot && key === blobsTreeName) {
			const tableBlobId = subTree.blobs[redirectTableBlobName];
			if (tableBlobId !== undefined) {
				ids.add(tableBlobId);
			}
			for (const childTree of Object.values(subTree.trees)) {
				collectReferencedBlobIds(childTree, false, ids);
			}
		} else {
			collectReferencedBlobIds(subTree, false, ids);
		}
	}
}

function toTreeAndReader(
	snapshot: ISnapshot | ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): { tree: ISnapshotTree; read: BlobReader } {
	if ("snapshotTree" in snapshot) {
		const blobContents = snapshot.blobContents;
		return {
			tree: snapshot.snapshotTree,
			read: async (id) => blobContents.get(id) ?? storage.readBlob(id),
		};
	}
	return { tree: snapshot, read: async (id) => storage.readBlob(id) };
}

/**
 * Fetches every attachment blob present in the snapshot redirect table.
 * Unreferenced-but-unswept content is retained because saved ops after the
 * snapshot may revive it.
 *
 * The returned map is keyed by attachment blob storage id. Values are the
 * raw bytes encoded as **base64** strings for JSON transport. Structural
 * snapshot blobs returned by {@link readReferencedSnapshotBlobs}
 * remain raw until their caller serializes them. Callers keep the maps on
 * separate pending-state fields because structural snapshot capture and
 * attachment capture have distinct responsibilities and key spaces.
 */
export async function captureReferencedAttachmentBlobs(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<IBase64BlobContents> {
	const blobsTree: ISnapshotTree | undefined = baseSnapshot.trees[blobsTreeName];
	if (blobsTree === undefined) {
		return {};
	}
	const localIdToStorageId = await readRedirectTable(blobsTree, storage);
	if (localIdToStorageId.size === 0) {
		return {};
	}

	const storageIdsToFetch = new Set<string>();
	for (const storageId of localIdToStorageId.values()) {
		storageIdsToFetch.add(storageId);
	}

	const contents: IBase64BlobContents = {};
	await mapWithConcurrency([...storageIdsToFetch], maxReadConcurrency, async (storageId) => {
		const buffer = await storage.readBlob(storageId);
		contents[storageId] = bufferToString(buffer, "base64");
	});
	return contents;
}

/**
 * Reconstructs the BlobManager's redirect table from a `.blobs` subtree.
 * Mirrors `toRedirectTable` in blobManagerSnapSum.ts.
 */
async function readRedirectTable(
	blobsTree: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<Map<string, string>> {
	const redirectTable = new Map<string, string>();
	const tableBlobId: string | undefined = blobsTree.blobs[redirectTableBlobName];
	if (tableBlobId !== undefined) {
		const entries = await readAndParse<[string, string][]>(storage, tableBlobId);
		for (const [localId, storageId] of entries) {
			redirectTable.set(localId, storageId);
		}
	}
	for (const [key, storageId] of Object.entries(blobsTree.blobs)) {
		if (key !== redirectTableBlobName) {
			// Identity mapping: storage ids referenced directly in handles (legacy).
			redirectTable.set(storageId, storageId);
		}
	}
	return redirectTable;
}

/**
 * A blob reference extracted from a `BlobAttach` op. `localId` is the
 * `BlobManager` GC identity for the blob; `storageId` is the id used for
 * `IDocumentStorageService.readBlob`.
 *
 * @internal
 */
export interface IBlobAttachReference {
	readonly localId: string;
	readonly storageId: string;
}

interface IBlobAttachLikeMetadata {
	readonly localId: string;
	readonly blobId: string;
}

function isBlobAttachLikeMetadata(metadata: unknown): metadata is IBlobAttachLikeMetadata {
	if (typeof metadata !== "object" || metadata === null) {
		return false;
	}
	const candidate = metadata as { localId?: unknown; blobId?: unknown };
	return typeof candidate.localId === "string" && typeof candidate.blobId === "string";
}

/**
 * Extracts every `BlobAttach` reference an op carries. Returns an empty array
 * for non-blobAttach ops.
 *
 * This is the single place in the loader that interprets the BlobAttach
 * wire format. Capture and load-side reasoning about ops should call into
 * this function rather than reading `op.metadata` directly, so a future
 * protocol change touches one site.
 *
 * BlobAttach ops carry `(localId, storageId)` directly on
 * `ISequencedDocumentMessage.metadata` and are not grouped — the container
 * runtime routes them through a separate `outbox.submitBlobAttach` lane,
 * and `OpGroupingManager.groupBatch` asserts (0x5dd) that no op carrying
 * non-batch metadata enters a grouped batch. If either guarantee changes,
 * extend this function rather than each call site.
 *
 * @internal
 */
export function extractBlobAttachReferences(
	op: Pick<ISequencedDocumentMessage, "metadata">,
): IBlobAttachReference[] {
	if (!isBlobAttachLikeMetadata(op.metadata)) {
		return [];
	}
	return [{ localId: op.metadata.localId, storageId: op.metadata.blobId }];
}

/**
 * Inline attachment blob contents for the given `(localId, storageId)`
 * references. Skips entries already present in `existing` (de-dupe with the
 * snapshot path). Returns only the freshly-read entries; the caller merges
 * them into the existing map.
 *
 * @internal
 */
export async function inlineAttachmentBlobsByReference(
	references: readonly IBlobAttachReference[],
	storage: Pick<IDocumentStorageService, "readBlob">,
	existing: Readonly<IBase64BlobContents>,
): Promise<IBase64BlobContents> {
	const storageIdsToFetch = new Set<string>();
	for (const { storageId } of references) {
		if (existing[storageId] !== undefined) {
			continue;
		}
		storageIdsToFetch.add(storageId);
	}
	const added: IBase64BlobContents = {};
	if (storageIdsToFetch.size === 0) {
		return added;
	}
	await mapWithConcurrency([...storageIdsToFetch], maxReadConcurrency, async (storageId) => {
		const buffer = await storage.readBlob(storageId);
		added[storageId] = bufferToString(buffer, "base64");
	});
	return added;
}

/**
 * Returns true if any subtree other than the reserved embedded-blob subtree
 * declares a `groupId`.
 *
 * `captureFullContainerState` does not yet support loading groups: prefetching
 * per-group snapshots adds a code path that has no end-to-end coverage and no
 * known production consumer. Callers use this to fail fast with a `UsageError`
 * rather than silently producing a pending state that omits group data.
 */
export function snapshotHasLoadingGroups(baseSnapshot: ISnapshotTree): boolean {
	if (baseSnapshot.groupId !== undefined) {
		return true;
	}
	return Object.entries(baseSnapshot.trees).some(([key, child]) =>
		key === blobsTreeName
			? blobManagerTreeHasUnsupportedLoadingGroups(child)
			: subtreeHasLoadingGroups(child),
	);
}

function blobManagerTreeHasUnsupportedLoadingGroups(blobManagerTree: ISnapshotTree): boolean {
	if (blobManagerTree.groupId !== undefined) {
		return true;
	}
	return Object.entries(blobManagerTree.trees).some(([key, child]) =>
		key === embeddedBlobsTreeName
			? Object.values(child.trees).some(subtreeHasLoadingGroups)
			: subtreeHasLoadingGroups(child),
	);
}

function subtreeHasLoadingGroups(subtree: ISnapshotTree): boolean {
	if (subtree.groupId !== undefined) {
		return true;
	}
	return Object.values(subtree.trees).some(subtreeHasLoadingGroups);
}
