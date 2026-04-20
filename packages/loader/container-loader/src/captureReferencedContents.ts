/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";

import type { ISerializableBlobContents } from "./containerStorageAdapter.js";
import type { SerializedSnapshotInfo } from "./serializedStateManager.js";
import { getDocumentAttributes } from "./utils.js";

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
 * Parses the `gc` subtree of a base snapshot. Returns `undefined` if the
 * snapshot has no GC tree (GC disabled or pre-GC document).
 */
export async function parseGcSnapshotData(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<IGcSnapshotData | undefined> {
	const gcSnapshotTree = baseSnapshot.trees[gcTreeKey];
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
	const blobs: ISerializableBlobContents = {};
	await walkForBlobs(tree, true, blobs, read);
	return blobs;
}

async function walkForBlobs(
	tree: ISnapshotTree,
	isRoot: boolean,
	blobs: ISerializableBlobContents,
	read: BlobReader,
): Promise<void> {
	if (tree.unreferenced === true) {
		return;
	}
	const promises: Promise<unknown>[] = [];
	for (const blobId of Object.values(tree.blobs)) {
		promises.push(readAndStore(blobId, blobs, read));
	}
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (isRoot && key === blobsTreeName) {
			// Attachment blob contents are captured separately; only inline
			// the redirect table so BlobManager can rehydrate identity
			// mappings.
			const tableBlobId = subTree.blobs[redirectTableBlobName];
			if (tableBlobId !== undefined) {
				promises.push(readAndStore(tableBlobId, blobs, read));
			}
		} else {
			promises.push(walkForBlobs(subTree, false, blobs, read));
		}
	}
	await Promise.all(promises);
}

async function readAndStore(
	blobId: string,
	blobs: ISerializableBlobContents,
	read: BlobReader,
): Promise<void> {
	const data = await read(blobId);
	blobs[blobId] = bufferToString(data, "utf8");
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
 * The returned map is keyed by attachment blob storage id and can be merged
 * directly into a pending-state {@link ISerializableBlobContents} map.
 */
export async function captureReferencedAttachmentBlobs(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
	gcData: IGcSnapshotData | undefined,
): Promise<ISerializableBlobContents> {
	const blobsTree = baseSnapshot.trees[blobsTreeName];
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
 * Reconstructs the BlobManager's redirect table from a `.blobs` subtree.
 * Mirrors `toRedirectTable` in blobManagerSnapSum.ts.
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
			// Identity mapping: storage ids referenced directly in handles (legacy).
			redirectTable.set(storageId, storageId);
		}
	}
	return redirectTable;
}

/**
 * Extracts the set of blob localIds that GC has explicitly marked as
 * unreferenced, tombstoned, or deleted.
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

/**
 * Enumerates the set of loading-group ids declared by datastores in the
 * snapshot, skipping any subtree flagged `unreferenced`.
 */
function collectGroupIds(tree: ISnapshotTree): Set<string> {
	const ids = new Set<string>();
	const visit = (node: ISnapshotTree): void => {
		if (node.unreferenced === true) {
			return;
		}
		if (node.groupId !== undefined) {
			ids.add(node.groupId);
		}
		for (const child of Object.values(node.trees)) {
			visit(child);
		}
	};
	visit(tree);
	return ids;
}

/**
 * Fetches each loading-group snapshot declared by the base snapshot and
 * serializes it into {@link SerializedSnapshotInfo} form. Each group
 * snapshot is walked with the same `unreferenced` filter as the main
 * snapshot.
 *
 * Returns an empty record if the driver lacks `getSnapshot` support or the
 * snapshot has no group ids. Callers can place the result directly into
 * `IPendingContainerState.loadedGroupIdSnapshots`.
 */
export async function captureGroupIdSnapshots(
	baseSnapshot: ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob"> & {
		getSnapshot?: IDocumentStorageService["getSnapshot"];
	},
	versionId: string | undefined,
	scenarioName: string,
): Promise<Record<string, SerializedSnapshotInfo>> {
	const getSnapshot = storage.getSnapshot;
	if (getSnapshot === undefined) {
		return {};
	}
	const groupIds = collectGroupIds(baseSnapshot);
	if (groupIds.size === 0) {
		return {};
	}
	const result: Record<string, SerializedSnapshotInfo> = {};
	await Promise.all(
		[...groupIds].map(async (groupId) => {
			const groupSnapshot = await getSnapshot({
				versionId,
				loadingGroupIds: [groupId],
				scenarioName: `${scenarioName}.group`,
			});
			const snapshotBlobs = await readReferencedSnapshotBlobs(groupSnapshot, storage);
			let sequenceNumber = groupSnapshot.sequenceNumber;
			if (sequenceNumber === undefined) {
				const groupAttributes = await getDocumentAttributes(
					storage,
					groupSnapshot.snapshotTree,
				);
				sequenceNumber = groupAttributes.sequenceNumber;
			}
			result[groupId] = {
				baseSnapshot: groupSnapshot.snapshotTree,
				snapshotBlobs,
				snapshotSequenceNumber: sequenceNumber,
			};
		}),
	);
	return result;
}
