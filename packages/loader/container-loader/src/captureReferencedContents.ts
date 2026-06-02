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

import type {
	IBase64BlobContents,
	ISerializableBlobContents,
} from "./containerStorageAdapter.js";

/**
 * Wire-format constants this module needs to walk and filter snapshots.
 * Authoritative definitions live in `container-runtime` and
 * `runtime-definitions`; the values are duplicated here to avoid a
 * loader → runtime layering dependency. A contract test in
 * `packages/test/local-server-tests` asserts these match the authoritative
 * values; do not change them in isolation.
 *
 * Authoritative sources:
 * - `blobsTreeName`, `redirectTableBlobName`: `packages/runtime/container-runtime/src/blobManager/blobManagerSnapSum.ts`
 * - `blobManagerBasePath`: `packages/runtime/container-runtime/src/blobManager/blobManager.ts`
 * - `gcTreeKey`, `gcBlobPrefix`, `gcTombstoneBlobKey`, `gcDeletedBlobKey`: `packages/runtime/runtime-definitions/src/garbageCollectionDefinitions.ts`
 *
 * @internal
 */
export const wireFormatConstants = {
	blobsTreeName: ".blobs",
	redirectTableBlobName: ".redirectTable",
	blobManagerBasePath: "_blobs",
	gcTreeKey: "gc",
	gcBlobPrefix: "__gc",
	gcTombstoneBlobKey: "__tombstones",
	gcDeletedBlobKey: "__deletedNodes",
} as const;

const {
	blobsTreeName,
	redirectTableBlobName,
	blobManagerBasePath,
	gcTreeKey,
	gcBlobPrefix,
	gcTombstoneBlobKey,
	gcDeletedBlobKey,
} = wireFormatConstants;

interface IGcNodeData {
	outboundRoutes: string[];
	unreferencedTimestampMs?: number;
}

interface IGcState {
	gcNodes: { [id: string]: IGcNodeData };
}

/**
 * The parsed subset of the `gc` subtree that drives reachability decisions.
 */
export interface IGcSnapshotData {
	gcState: IGcState | undefined;
	tombstones: string[] | undefined;
	deletedNodes: string[] | undefined;
}

/** Reader that returns a blob's contents for a given storage id. */
type BlobReader = (id: string) => Promise<ArrayBufferLike>;

/**
 * Upper bound on concurrent `readBlob` calls. Driver/service back-pressure is
 * real for large documents, and unbounded `Promise.all` can trigger throttling
 * or spike memory. The value is a pragmatic middle ground — high enough to
 * keep a typical driver's request pipeline full, low enough to avoid storms.
 */
const maxReadConcurrency = 32;

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
 * Parses the `gc` subtree of a base snapshot. Returns `undefined` if the
 * snapshot has no GC tree (GC disabled or pre-GC document).
 */
export async function parseGcSnapshotData(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<IGcSnapshotData | undefined> {
	const gcSnapshotTree: ISnapshotTree | undefined = baseSnapshot.trees[gcTreeKey];
	if (gcSnapshotTree === undefined) {
		return undefined;
	}
	let gcState: IGcState | undefined;
	let tombstones: string[] | undefined;
	let deletedNodes: string[] | undefined;
	for (const [key, blobId] of Object.entries(gcSnapshotTree.blobs)) {
		if (key === gcDeletedBlobKey) {
			deletedNodes = await readAndParse<string[]>(storage, blobId);
		} else if (key === gcTombstoneBlobKey) {
			tombstones = await readAndParse<string[]>(storage, blobId);
		} else if (key.startsWith(gcBlobPrefix)) {
			const partial = await readAndParse<IGcState>(storage, blobId);
			if (gcState === undefined) {
				gcState = { gcNodes: { ...partial.gcNodes } };
			} else {
				for (const [nodeId, nodeData] of Object.entries(partial.gcNodes)) {
					gcState.gcNodes[nodeId] ??= nodeData;
				}
			}
		}
	}
	return { gcState, tombstones, deletedNodes };
}

/**
 * Walks a snapshot and inlines the contents of every blob reachable without
 * crossing an `unreferenced` subtree boundary. Subtrees flagged
 * `unreferenced: true` are skipped entirely — the summarizer sets that flag
 * from GC state, so honouring it filters out dead subtrees without a
 * separate GC-path traversal.
 *
 * The root-level `.blobs` subtree is special-cased: only its `.redirectTable`
 * blob is read, because attachment blob contents are captured separately via
 * {@link captureReferencedAttachmentBlobs}.
 */
export async function readReferencedSnapshotBlobs(
	snapshot: ISnapshot | ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<ISerializableBlobContents> {
	const { tree, read } = toTreeAndReader(snapshot, storage);
	const ids = new Set<string>();
	collectReferencedBlobIds(tree, true, ids);
	const blobs: ISerializableBlobContents = {};
	await mapWithConcurrency([...ids], maxReadConcurrency, async (id) => {
		const data = await read(id);
		blobs[id] = bufferToString(data, "utf8");
	});
	return blobs;
}

/**
 * Synchronously walks the snapshot tree and gathers the set of blob ids that
 * should be inlined. Subtrees flagged `unreferenced: true` are skipped
 * entirely. The root-level `.blobs` subtree is special-cased: only its
 * `.redirectTable` id is collected, because attachment blob contents are
 * captured separately via {@link captureReferencedAttachmentBlobs}.
 */
function collectReferencedBlobIds(
	tree: ISnapshotTree,
	isRoot: boolean,
	ids: Set<string>,
): void {
	if (tree.unreferenced === true) {
		return;
	}
	for (const blobId of Object.values(tree.blobs)) {
		ids.add(blobId);
	}
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (isRoot && key === blobsTreeName) {
			const tableBlobId = subTree.blobs[redirectTableBlobName];
			if (tableBlobId !== undefined) {
				ids.add(tableBlobId);
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
 * Fetches attachment blob contents from a snapshot, filtered by GC
 * reachability. Blobs GC has explicitly marked unreferenced, tombstoned, or
 * deleted are skipped. Blobs absent from the GC graph are kept — GC state
 * lags behind recent attachments and dropping them would lose live data.
 * If `gcData` is `undefined`, every attachment blob is returned.
 *
 * The returned map is keyed by attachment blob storage id. Values are the
 * raw bytes encoded as **base64** strings — attachment blobs may carry
 * arbitrary binary payloads (images, encrypted data, etc.) and a
 * UTF-8 round-trip would silently corrupt non-UTF-8 byte sequences with
 * replacement characters. The runtime's own pending-blob serializer uses
 * base64 for the same reason. This diverges from the structural-blob path
 * in {@link readReferencedSnapshotBlobs}, which encodes UTF-8 because those
 * blobs are JSON or other text the runtime authored. Callers must keep the
 * two encodings on separate fields of the pending state so the load side
 * can decode each correctly.
 */
export async function captureReferencedAttachmentBlobs(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
	gcData: IGcSnapshotData | undefined,
): Promise<IBase64BlobContents> {
	const blobsTree: ISnapshotTree | undefined = baseSnapshot.trees[blobsTreeName];
	if (blobsTree === undefined) {
		return {};
	}
	const localIdToStorageId = await readRedirectTable(blobsTree, storage);
	if (localIdToStorageId.size === 0) {
		return {};
	}

	const unreferencedLocalIds =
		gcData === undefined ? undefined : collectUnreferencedBlobLocalIds(gcData);

	const storageIdsToFetch = new Set<string>();
	for (const [localId, storageId] of localIdToStorageId) {
		if (unreferencedLocalIds?.has(localId) !== true) {
			storageIdsToFetch.add(storageId);
		}
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
 * Collects the set of blob localIds that GC has explicitly marked as
 * unreferenced (via `unreferencedTimestampMs` on a gc node), tombstoned, or
 * deleted. Tombstones and deletedNodes are applied regardless of whether
 * `gcState` is present — they are authoritative on their own and must not
 * be silently dropped when gc state is absent but tombstone/deleted lists
 * exist.
 */
function collectUnreferencedBlobLocalIds(gcData: IGcSnapshotData): Set<string> {
	const blobPathPrefix = `/${blobManagerBasePath}/`;
	const unreferenced = new Set<string>();
	if (gcData.gcState !== undefined) {
		for (const [nodePath, nodeData] of Object.entries(gcData.gcState.gcNodes)) {
			if (
				nodePath.startsWith(blobPathPrefix) &&
				nodeData.unreferencedTimestampMs !== undefined
			) {
				unreferenced.add(nodePath.slice(blobPathPrefix.length));
			}
		}
	}
	for (const nodePath of [...(gcData.tombstones ?? []), ...(gcData.deletedNodes ?? [])]) {
		if (nodePath.startsWith(blobPathPrefix)) {
			unreferenced.add(nodePath.slice(blobPathPrefix.length));
		}
	}
	return unreferenced;
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
 * Set of attachment-blob localIds that GC has marked unreferenced,
 * tombstoned, or deleted in the base snapshot. `undefined` if `gcData`
 * is `undefined` (GC disabled / pre-GC document).
 *
 * @internal
 */
export function unreferencedAttachmentBlobLocalIds(
	gcData: IGcSnapshotData | undefined,
): Set<string> | undefined {
	return gcData === undefined ? undefined : collectUnreferencedBlobLocalIds(gcData);
}

/**
 * Inline attachment blob contents for the given `(localId, storageId)`
 * references. Skips entries already present in `existing` (de-dupe with
 * the snapshot path) and entries whose `localId` is in
 * `unreferencedLocalIds`. Returns only the freshly-read entries; the
 * caller merges them into the existing map.
 *
 * @internal
 */
export async function inlineAttachmentBlobsByReference(
	references: readonly IBlobAttachReference[],
	storage: Pick<IDocumentStorageService, "readBlob">,
	unreferencedLocalIds: ReadonlySet<string> | undefined,
	existing: Readonly<IBase64BlobContents>,
): Promise<IBase64BlobContents> {
	const storageIdsToFetch = new Set<string>();
	for (const { localId, storageId } of references) {
		if (unreferencedLocalIds?.has(localId) === true) {
			continue;
		}
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
 * Returns true if any referenced subtree of `baseSnapshot` declares a
 * `groupId` — the snapshot-tree wire field that carries the runtime's
 * loading-group identifier. Subtrees flagged `unreferenced` are skipped —
 * a dead subtree's `groupId` would not be loaded by the runtime either.
 *
 * `captureFullContainerState` does not yet support loading groups: prefetching
 * per-group snapshots adds a code path that has no end-to-end coverage and no
 * known production consumer. Callers use this to fail fast with a `UsageError`
 * rather than silently producing a pending state that omits group data.
 */
export function snapshotHasLoadingGroups(baseSnapshot: ISnapshotTree): boolean {
	if (baseSnapshot.unreferenced === true) {
		return false;
	}
	if (baseSnapshot.groupId !== undefined) {
		return true;
	}
	for (const child of Object.values(baseSnapshot.trees)) {
		if (snapshotHasLoadingGroups(child)) {
			return true;
		}
	}
	return false;
}
