/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";

import type { ISerializableBlobContents } from "./containerStorageAdapter.js";

// The following names are defined authoritatively in container-runtime and
// runtime-definitions. They are duplicated here to avoid a loader → runtime
// layering dependency. Keep in sync with:
//   packages/runtime/container-runtime/src/blobManager/blobManagerSnapSum.ts
//   packages/runtime/container-runtime/src/blobManager/blobManager.ts
//   packages/runtime/runtime-definitions/src/garbageCollectionDefinitions.ts
const blobsTreeName = ".blobs";
const redirectTableBlobName = ".redirectTable";
const blobManagerBasePath = "_blobs";
const gcTreeKey = "gc";
const gcBlobPrefix = "__gc";
const gcTombstoneBlobKey = "__tombstones";
const gcDeletedBlobKey = "__deletedNodes";

interface IGcNodeData {
	outboundRoutes: string[];
	unreferencedTimestampMs?: number;
}

interface IGcState {
	gcNodes: { [id: string]: IGcNodeData };
}

interface IGcSnapshotData {
	gcState: IGcState | undefined;
	tombstones: string[] | undefined;
	deletedNodes: string[] | undefined;
}

/**
 * Fetches attachment blob contents from a snapshot, filtered to the blobs that
 * are reachable according to the snapshot's GC state.
 *
 * If the snapshot has no GC tree (e.g., GC is disabled or the document
 * predates GC), every attachment blob referenced by the blob manager is
 * returned — no filtering is applied.
 *
 * Returned map is keyed by attachment blob storage ID. Values are the
 * utf-8 stringified blob payloads, matching the {@link ISerializableBlobContents}
 * shape so callers can merge them straight into a pending-state blob map.
 */
export async function captureReferencedAttachmentBlobs(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<ISerializableBlobContents> {
	const blobsTree = baseSnapshot.trees[blobsTreeName];
	if (blobsTree === undefined) {
		return {};
	}

	const localIdToStorageId = await readRedirectTable(blobsTree, storage);
	if (localIdToStorageId.size === 0) {
		return {};
	}

	const gcSnapshotTree = baseSnapshot.trees[gcTreeKey];
	const unreferencedLocalIds =
		gcSnapshotTree === undefined
			? undefined // no GC data → include everything
			: collectUnreferencedBlobLocalIds(await parseGcSnapshotData(gcSnapshotTree, storage));

	const storageIdsToFetch = new Set<string>();
	for (const [localId, storageId] of localIdToStorageId) {
		if (unreferencedLocalIds?.has(localId) !== true) {
			storageIdsToFetch.add(storageId);
		}
	}

	const contents: ISerializableBlobContents = {};
	await Promise.all(
		[...storageIdsToFetch].map(async (storageId) => {
			const buffer = await storage.readBlob(storageId);
			contents[storageId] = bufferToString(buffer, "utf8");
		}),
	);
	return contents;
}

/**
 * Reconstructs the BlobManager's redirect table from a `.blobs` subtree. The
 * table maps user-facing local IDs to storage IDs. Entries come from two
 * sources: the `.redirectTable` blob (non-identity mappings) and the tree's
 * other blob entries (identity mappings for storage IDs that are referenced
 * directly). Mirrors `toRedirectTable` in blobManagerSnapSum.ts.
 */
async function readRedirectTable(
	blobsTree: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<Map<string, string>> {
	const redirectTable = new Map<string, string>();
	const tableBlobId = blobsTree.blobs[redirectTableBlobName];
	if (tableBlobId !== undefined) {
		const entries = await readAndParse<[string, string][]>(storage, tableBlobId);
		for (const [localId, storageId] of entries) {
			redirectTable.set(localId, storageId);
		}
	}
	for (const [key, storageId] of Object.entries(blobsTree.blobs)) {
		if (key !== redirectTableBlobName) {
			// Identity mapping: storage IDs referenced directly in handles (legacy).
			redirectTable.set(storageId, storageId);
		}
	}
	return redirectTable;
}

/**
 * Parses the gc subtree into the subset of data needed for reachability
 * filtering. Mirrors `getGCDataFromSnapshot` in gcHelpers.ts.
 */
async function parseGcSnapshotData(
	gcSnapshotTree: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<IGcSnapshotData> {
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
 * Extracts the set of blob localIds that GC has explicitly marked as
 * unreferenced, tombstoned, or deleted — i.e., blobs that are safe to drop.
 * Blobs absent from the GC graph are *not* treated as unreferenced: GC state
 * is a snapshot of the last run and can lag behind recent attachments, so the
 * safer default is to keep them.
 *
 * Returns `undefined` if the GC state is missing altogether, signalling that
 * the caller should include every attachment blob.
 */
function collectUnreferencedBlobLocalIds(gcData: IGcSnapshotData): Set<string> | undefined {
	if (gcData.gcState === undefined) {
		return undefined;
	}
	const blobPathPrefix = `/${blobManagerBasePath}/`;
	const unreferenced = new Set<string>();
	for (const [nodePath, nodeData] of Object.entries(gcData.gcState.gcNodes)) {
		if (
			nodePath.startsWith(blobPathPrefix) &&
			nodeData.unreferencedTimestampMs !== undefined
		) {
			unreferenced.add(nodePath.slice(blobPathPrefix.length));
		}
	}
	for (const nodePath of [...(gcData.tombstones ?? []), ...(gcData.deletedNodes ?? [])]) {
		if (nodePath.startsWith(blobPathPrefix)) {
			unreferenced.add(nodePath.slice(blobPathPrefix.length));
		}
	}
	return unreferenced;
}
