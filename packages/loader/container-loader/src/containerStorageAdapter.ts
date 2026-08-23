/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISnapshotTreeWithBlobContents,
	IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import type { IDisposable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	FetchSource,
	IDocumentService,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshot,
	ISnapshotFetchOptions,
	ISummaryContext,
	ICreateBlobResponse,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { isInstanceOfISnapshot, UsageError } from "@fluidframework/driver-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { MemoryDetachedBlobStorage } from "./memoryBlobStorage.js";
import { ProtocolTreeStorageService } from "./protocolTreeDocumentStorageService.js";
import { RetriableDocumentStorageService } from "./retriableDocumentStorageService.js";
import type {
	ISerializedStateManagerDocumentStorageService,
	SerializedSnapshotInfo,
} from "./serializedStateManager.js";
import { convertSnapshotInfoToSnapshot } from "./utils.js";

/**
 * Legacy stringified blobs from a summary/snapshot tree, keyed by blob id.
 * Values are interpreted as UTF-8 when loading old pending or detached
 * container state. New serialization paths use {@link IBase64BlobContents}
 * so arbitrary snapshot bytes round-trip losslessly.
 * @internal
 */
export interface ISerializableBlobContents {
	[id: string]: string;
}

/**
 * Raw blob bytes encoded as base64 for transport inside JSON state artifacts,
 * keyed by blob id. This type is used by both structural snapshot capture and
 * attachment capture; callers keep those maps separate because they represent
 * distinct capture responsibilities.
 *
 * Structurally identical to {@link ISerializableBlobContents}; the two types
 * exist to keep the decoding contract visible at every call site.
 * @internal
 */
export interface IBase64BlobContents {
	[id: string]: string;
}

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter
	implements
		ISerializedStateManagerDocumentStorageService,
		IContainerStorageService,
		IDisposable
{
	private _storageService: IDocumentStorageService & Partial<IDisposable>;

	private _summarizeProtocolTree: boolean | undefined;
	/**
	 * Whether the adapter will enforce sending combined summary trees.
	 */
	public get summarizeProtocolTree(): boolean {
		return this._summarizeProtocolTree === true;
	}

	private _loadedGroupIdSnapshots: Record<string, ISnapshot> = {};
	/**
	 * Any loading group id (virtualized) snapshot download from storage will be stored here.
	 */
	public get loadedGroupIdSnapshots(): Record<string, ISnapshot> {
		return this._loadedGroupIdSnapshots;
	}

	/**
	 * ArrayBufferLikes  containing blobs from a snapshot
	 */
	private readonly blobContents: { [id: string]: ArrayBufferLike } = {};

	/**
	 * An adapter that ensures we're using detachedBlobStorage up until we connect to a real service, and then
	 * after connecting to a real service augments it with retry and combined summary tree enforcement.
	 * @param detachedBlobStorage - The detached blob storage to use up until we connect to a real service
	 * @param logger - Telemetry logger
	 * @param loadingGroupIdSnapshotsFromPendingState - in offline mode, any loading group snapshots we've downloaded from the service that were stored in the pending state
	 * @param addProtocolSummaryIfMissing - a callback to permit the container to inspect the summary we're about to
	 * upload, and fix it up with a protocol tree if needed
	 * @param enableSummarizeProtocolTree - Enable uploading a protocol summary. Note: preference is given to service policy's "summarizeProtocolTree" before this value.
	 */
	public constructor(
		detachedBlobStorage: MemoryDetachedBlobStorage | undefined,
		private readonly logger: TelemetryLoggerExt,
		private loadingGroupIdSnapshotsFromPendingState:
			| Record<string, SerializedSnapshotInfo>
			| undefined,
		private readonly addProtocolSummaryIfMissing: (summaryTree: ISummaryTree) => ISummaryTree,
		private readonly enableSummarizeProtocolTree: boolean | undefined,
	) {
		this._storageService = new BlobOnlyStorage(detachedBlobStorage, logger);
	}

	disposed: boolean = false;
	dispose(error?: Error): void {
		this._storageService?.dispose?.(error);
		this.disposed = true;
	}

	public connectToService(service: IDocumentService, maxRetries?: number): void {
		if (!(this._storageService instanceof BlobOnlyStorage)) {
			return;
		}

		const storageServiceP = service.connectToStorage();
		const retriableStorage = (this._storageService = new RetriableDocumentStorageService(
			storageServiceP,
			this.logger,
			maxRetries,
		));

		// A storage service wrapper which intercept calls to uploadSummaryWithContext and ensure they include
		// the protocol summary, provided single-commit summary is enabled.
		this._storageService = new ProtocolTreeStorageService(
			retriableStorage,
			(...props) => {
				this.logger.sendTelemetryEvent({ eventName: "summarizeProtocolTreeEnabled" });
				return this.addProtocolSummaryIfMissing(...props);
			},
			// A callback to ensure we fetch the most updated value of service.policies.summarizeProtocolTree, which could be set
			// based on the response received from the service after connection is established.
			() => {
				// Determine whether or not container should upload the protocol summary along with the summary.
				// This is determined based on what value is set for serve policy's summariProtocolTree value or the enableSummarizeProtocolTree
				// retrievd from the loader options or monitoring context config.
				const shouldSummarizeProtocolTree =
					service.policies?.summarizeProtocolTree ?? this.enableSummarizeProtocolTree ?? false;

				if (this._summarizeProtocolTree !== shouldSummarizeProtocolTree) {
					this.logger.sendTelemetryEvent({
						eventName: "isSummarizeProtocolTreeEnabled",
						details: { value: shouldSummarizeProtocolTree },
					});
				}
				this._summarizeProtocolTree = shouldSummarizeProtocolTree;
				return this._summarizeProtocolTree;
			},
		);
	}

	public cacheSnapshotBlobs(snapshotBlobs: Map<string, ArrayBuffer>): void {
		for (const [id, value] of snapshotBlobs.entries()) {
			this.blobContents[id] ??= value;
		}
	}

	public clearPendingState(): void {
		this.loadingGroupIdSnapshotsFromPendingState = undefined;
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		// back-compat 0.40 containerRuntime requests policies even in detached container if storage is present
		// and storage is always present in >=0.41.
		try {
			return this._storageService.policies;
		} catch {
			// No-op
		}
		return undefined;
	}

	public get maximumCacheDurationMs(): IDocumentStorageServicePolicies["maximumCacheDurationMs"] {
		return this.policies?.maximumCacheDurationMs;
	}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
		// API called below uses null
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		return this._storageService.getSnapshotTree(version, scenarioName);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		let snapshot: ISnapshot;
		if (
			this.loadingGroupIdSnapshotsFromPendingState !== undefined &&
			snapshotFetchOptions?.loadingGroupIds !== undefined
		) {
			const localSnapshot =
				this.loadingGroupIdSnapshotsFromPendingState[snapshotFetchOptions.loadingGroupIds[0]];
			assert(localSnapshot !== undefined, 0x970 /* Local snapshot must be present */);
			snapshot = convertSnapshotInfoToSnapshot(localSnapshot);
		} else {
			if (this._storageService.getSnapshot === undefined) {
				throw new UsageError(
					"getSnapshot api should exist in internal storage in ContainerStorageAdapter",
				);
			}
			snapshot = await this._storageService.getSnapshot(snapshotFetchOptions);
		}

		// Track the latest snapshot for each loading group id
		const loadingGroupIds = snapshotFetchOptions?.loadingGroupIds;
		assert(
			snapshot.sequenceNumber !== undefined,
			0x971 /* Snapshot must have sequence number */,
		);
		if (loadingGroupIds !== undefined) {
			for (const loadingGroupId of loadingGroupIds) {
				// Do we actually want to update the stored snapshot?
				// What if the incoming snapshot is way newer than the stored snapshot?
				// We only want to update the stored snapshot if the incoming snapshot is newer (stored sequence number < incoming sequence number)
				const storedSeqNum =
					this._loadedGroupIdSnapshots[loadingGroupId]?.sequenceNumber ?? -1;
				if (storedSeqNum < snapshot.sequenceNumber) {
					this._loadedGroupIdSnapshots[loadingGroupId] = snapshot;
				}
			}
		}
		return snapshot;
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const maybeBlob = this.blobContents[id];
		if (maybeBlob !== undefined) {
			return maybeBlob;
		}
		return this._storageService.readBlob(id);
	}

	public async getVersions(
		// API used below uses null
		// eslint-disable-next-line @rushstack/no-new-null
		versionId: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<IVersion[]> {
		return this._storageService.getVersions(versionId, count, scenarioName, fetchSource);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		return this._storageService.uploadSummaryWithContext(summary, context);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this._storageService.createBlob(file);
	}
}

/**
 * Storage which only supports createBlob() and readBlob(). This is used with IDetachedBlobStorage to support
 * blobs in detached containers.
 */
class BlobOnlyStorage implements IDocumentStorageService {
	constructor(
		private readonly detachedStorage: MemoryDetachedBlobStorage | undefined,
		private readonly logger: TelemetryLoggerExt,
	) {}

	public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.verifyStorage().createBlob(content);
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		return this.verifyStorage().readBlob(blobId);
	}

	private verifyStorage(): MemoryDetachedBlobStorage {
		if (this.detachedStorage === undefined) {
			throw new UsageError("Real storage calls not allowed in Unattached container");
		}
		return this.detachedStorage;
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.notCalled();
	}

	/* eslint-disable @typescript-eslint/unbound-method */
	// eslint-disable-next-line @rushstack/no-new-null
	public getSnapshotTree: () => Promise<ISnapshotTree | null> = this.notCalled;
	public getSnapshot: () => Promise<ISnapshot> = this.notCalled;
	public getVersions: () => Promise<IVersion[]> = this.notCalled;
	public write: () => Promise<IVersion> = this.notCalled;
	public uploadSummaryWithContext: () => Promise<string> = this.notCalled;
	public downloadSummary: () => Promise<ISummaryTree> = this.notCalled;
	/* eslint-enable @typescript-eslint/unbound-method */

	private notCalled(): never {
		this.verifyStorage();
		try {
			// some browsers may not populate stack unless exception is thrown
			throw new Error("BlobOnlyStorage not implemented method used");
		} catch (error) {
			this.logger.sendTelemetryEvent({ eventName: "BlobOnlyStorageWrongCall" }, error);
			throw error;
		}
	}
}

// runtime will write a tree to the summary containing "attachment" type entries
// which reference attachment blobs by ID, along with a blob containing the blob redirect table.
// However, some drivers do not support the "attachment" type and will convert them to "blob" type
// entries. We want to avoid saving these to reduce the size of stashed change blobs, but we
// need to make sure the blob redirect table is saved.
const blobsTreeName = ".blobs";
const redirectTableBlobName = ".redirectTable";

/**
 * Gets raw structural snapshot blob contents from storage (or, ideally,
 * cache). Direct attachment entries in the root `.blobs` tree are excluded;
 * structural child trees are included.
 */
export async function getBlobContentsFromTree(
	snapshot: ISnapshot | ISnapshotTree,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<Map<string, ArrayBufferLike>> {
	const blobs = new Map<string, ArrayBufferLike>();
	if (isInstanceOfISnapshot(snapshot)) {
		for (const [id, content] of snapshot.blobContents) {
			blobs.set(id, content);
		}
		const blobManagerTree = snapshot.snapshotTree.trees[blobsTreeName];
		if (blobManagerTree !== undefined) {
			await getBlobManagerTreeFromTree(blobManagerTree, blobs, {
				readBlob: async (id) => snapshot.blobContents.get(id) ?? storage.readBlob(id),
			});
		}
	} else {
		await getBlobContentsFromTreeCore(snapshot, blobs, storage);
	}
	return blobs;
}

async function getBlobContentsFromTreeCore(
	tree: ISnapshotTree,
	blobs: Map<string, ArrayBufferLike>,
	storage: Pick<IDocumentStorageService, "readBlob">,
	root = true,
): Promise<unknown[]> {
	const treePs: Promise<unknown>[] = [];
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (root && key === blobsTreeName) {
			treePs.push(getBlobManagerTreeFromTree(subTree, blobs, storage));
		} else {
			treePs.push(getBlobContentsFromTreeCore(subTree, blobs, storage, false));
		}
	}
	for (const id of Object.values(tree.blobs)) {
		const blob = await storage.readBlob(id);
		blobs.set(id, blob);
	}
	return Promise.all(treePs);
}

// Save the redirect table and structural child trees from .blobs, but skip direct attachment entries.
async function getBlobManagerTreeFromTree(
	tree: ISnapshotTree,
	blobs: Map<string, ArrayBufferLike>,
	storage: Pick<IDocumentStorageService, "readBlob">,
): Promise<void> {
	const id = tree.blobs[redirectTableBlobName];
	if (id !== undefined) {
		const blob = await storage.readBlob(id);
		blobs.set(id, blob);
	}
	await Promise.all(
		Object.values(tree.trees).map(async (subTree) =>
			getBlobContentsFromTreeCore(subTree, blobs, storage, false),
		),
	);
}

/**
 * Extracts raw structural blob contents from a snapshot tree with in-memory
 * blob contents.
 */
export function getBlobContentsFromTreeWithBlobContents(
	snapshot: ISnapshotTreeWithBlobContents,
): Map<string, ArrayBufferLike> {
	const blobs = new Map<string, ArrayBufferLike>();
	getBlobContentsFromTreeWithBlobContentsCore(snapshot, blobs);
	return blobs;
}

function getBlobContentsFromTreeWithBlobContentsCore(
	tree: ISnapshotTreeWithBlobContents,
	blobs: Map<string, ArrayBufferLike>,
	root = true,
): void {
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (root && key === blobsTreeName) {
			getBlobManagerTreeFromTreeWithBlobContents(subTree, blobs);
		} else {
			getBlobContentsFromTreeWithBlobContentsCore(subTree, blobs, false);
		}
	}
	for (const id of Object.values(tree.blobs)) {
		const blob = tree.blobsContents?.[id];
		assert(blob !== undefined, 0x2ec /* "Blob must be present in blobsContents" */);
		blobs.set(id, blob);
	}
}

// Save the redirect table and structural child trees from .blobs, but skip direct attachment entries.
function getBlobManagerTreeFromTreeWithBlobContents(
	tree: ISnapshotTreeWithBlobContents,
	blobs: Map<string, ArrayBufferLike>,
): void {
	const id = tree.blobs[redirectTableBlobName];
	if (id !== undefined) {
		const blob = tree.blobsContents?.[id];
		assert(blob !== undefined, 0x70f /* Blob must be present in blobsContents */);
		blobs.set(id, blob);
	}
	for (const subTree of Object.values(tree.trees)) {
		getBlobContentsFromTreeWithBlobContentsCore(subTree, blobs, false);
	}
}
