/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions";
import {
	FetchSource,
	IDocumentService,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISummaryContext,
} from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import {
	ICreateBlobResponse,
	ISnapshotTree,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import { IDetachedBlobStorage } from "./loader";
import { ProtocolTreeStorageService } from "./protocolTreeDocumentStorageService";
import { RetriableDocumentStorageService } from "./retriableDocumentStorageService";

/**
 * Stringified blobs from a summary/snapshot tree.
 * @internal
 */
export interface ISerializableBlobContents {
	[id: string]: string;
}

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter implements IDocumentStorageService, IDisposable {
	private _storageService: IDocumentStorageService & Partial<IDisposable>;

	private _summarizeProtocolTree: boolean | undefined;
	/**
	 * Whether the adapter will enforce sending combined summary trees.
	 */
	public get summarizeProtocolTree() {
		return this._summarizeProtocolTree === true;
	}

	/**
	 * An adapter that ensures we're using detachedBlobStorage up until we connect to a real service, and then
	 * after connecting to a real service augments it with retry and combined summary tree enforcement.
	 * @param detachedBlobStorage - The detached blob storage to use up until we connect to a real service
	 * @param logger - Telemetry logger
	 * @param addProtocolSummaryIfMissing - a callback to permit the container to inspect the summary we're about to
	 * upload, and fix it up with a protocol tree if needed
	 * @param forceEnableSummarizeProtocolTree - Enforce uploading a protocol summary regardless of the service's policy
	 */
	public constructor(
		detachedBlobStorage: IDetachedBlobStorage | undefined,
		private readonly logger: ITelemetryLoggerExt,
		/**
		 * ArrayBufferLikes or utf8 encoded strings, containing blobs from a snapshot
		 */
		private readonly blobContents: { [id: string]: ArrayBufferLike | string } = {},
		private readonly addProtocolSummaryIfMissing: (summaryTree: ISummaryTree) => ISummaryTree,
		forceEnableSummarizeProtocolTree: boolean | undefined,
	) {
		this._storageService = new BlobOnlyStorage(detachedBlobStorage, logger);
		this._summarizeProtocolTree = forceEnableSummarizeProtocolTree;
	}

	disposed: boolean = false;
	dispose(error?: Error): void {
		this._storageService?.dispose?.(error);
		this.disposed = true;
	}

	public connectToService(service: IDocumentService): void {
		if (!(this._storageService instanceof BlobOnlyStorage)) {
			return;
		}

		const storageServiceP = service.connectToStorage();
		const retriableStorage = (this._storageService = new RetriableDocumentStorageService(
			storageServiceP,
			this.logger,
		));

		this._summarizeProtocolTree =
			this._summarizeProtocolTree ?? service.policies?.summarizeProtocolTree;
		if (this.summarizeProtocolTree) {
			this.logger.sendTelemetryEvent({ eventName: "summarizeProtocolTreeEnabled" });
			this._storageService = new ProtocolTreeStorageService(
				retriableStorage,
				this.addProtocolSummaryIfMissing,
			);
		}
	}

	public loadSnapshotForRehydratingContainer(snapshotTree: ISnapshotTreeWithBlobContents) {
		this.getBlobContents(snapshotTree);
	}

	private getBlobContents(snapshotTree: ISnapshotTreeWithBlobContents) {
		if (snapshotTree.blobsContents !== undefined) {
			for (const [id, value] of Object.entries(snapshotTree.blobsContents ?? {})) {
				this.blobContents[id] = value;
			}
		}
		for (const [_, tree] of Object.entries(snapshotTree.trees)) {
			this.getBlobContents(tree);
		}
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		// back-compat 0.40 containerRuntime requests policies even in detached container if storage is present
		// and storage is always present in >=0.41.
		try {
			return this._storageService.policies;
		} catch (e) {}
		return undefined;
	}

	public get repositoryUrl(): string {
		return this._storageService.repositoryUrl;
	}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
	): Promise<ISnapshotTree | null> {
		return this._storageService.getSnapshotTree(version, scenarioName);
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const maybeBlob = this.blobContents[id];
		if (maybeBlob !== undefined) {
			if (typeof maybeBlob === "string") {
				const blob = stringToBuffer(maybeBlob, "utf8");
				return blob;
			}
			return maybeBlob;
		}
		return this._storageService.readBlob(id);
	}

	public async getVersions(
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

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this._storageService.downloadSummary(handle);
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
		private readonly detachedStorage: IDetachedBlobStorage | undefined,
		private readonly logger: ITelemetryLoggerExt,
	) {}

	public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.verifyStorage().createBlob(content);
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		return this.verifyStorage().readBlob(blobId);
	}

	private verifyStorage(): IDetachedBlobStorage {
		if (this.detachedStorage === undefined) {
			throw new UsageError("Real storage calls not allowed in Unattached container");
		}
		return this.detachedStorage;
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.notCalled();
	}

	public get repositoryUrl(): string {
		return this.notCalled();
	}

	/* eslint-disable @typescript-eslint/unbound-method */
	public getSnapshotTree: () => Promise<ISnapshotTree | null> = this.notCalled;
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
		} catch (err) {
			this.logger.sendTelemetryEvent({ eventName: "BlobOnlyStorageWrongCall" }, err);
			throw err;
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
 * Get blob contents of a snapshot tree from storage (or, ideally, cache)
 */
export async function getBlobContentsFromTree(
	snapshot: ISnapshotTree,
	storage: IDocumentStorageService,
): Promise<ISerializableBlobContents> {
	const blobs = {};
	await getBlobContentsFromTreeCore(snapshot, blobs, storage);
	return blobs;
}

async function getBlobContentsFromTreeCore(
	tree: ISnapshotTree,
	blobs: ISerializableBlobContents,
	storage: IDocumentStorageService,
	root = true,
) {
	const treePs: Promise<any>[] = [];
	for (const [key, subTree] of Object.entries(tree.trees)) {
		if (root && key === blobsTreeName) {
			treePs.push(getBlobManagerTreeFromTree(subTree, blobs, storage));
		} else {
			treePs.push(getBlobContentsFromTreeCore(subTree, blobs, storage, false));
		}
	}
	for (const id of Object.values(tree.blobs)) {
		const blob = await storage.readBlob(id);
		// ArrayBufferLike will not survive JSON.stringify()
		blobs[id] = bufferToString(blob, "utf8");
	}
	return Promise.all(treePs);
}

// save redirect table from .blobs tree but nothing else
async function getBlobManagerTreeFromTree(
	tree: ISnapshotTree,
	blobs: ISerializableBlobContents,
	storage: IDocumentStorageService,
) {
	const id = tree.blobs[redirectTableBlobName];
	const blob = await storage.readBlob(id);
	// ArrayBufferLike will not survive JSON.stringify()
	blobs[id] = bufferToString(blob, "utf8");
}

/**
 * Extract blob contents from a snapshot tree with blob contents
 */
export function getBlobContentsFromTreeWithBlobContents(
	snapshot: ISnapshotTreeWithBlobContents,
): ISerializableBlobContents {
	const blobs = {};
	getBlobContentsFromTreeWithBlobContentsCore(snapshot, blobs);
	return blobs;
}

function getBlobContentsFromTreeWithBlobContentsCore(
	tree: ISnapshotTreeWithBlobContents,
	blobs: ISerializableBlobContents,
	root = true,
) {
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
		// ArrayBufferLike will not survive JSON.stringify()
		blobs[id] = bufferToString(blob, "utf8");
	}
}

// save redirect table from .blobs tree but nothing else
function getBlobManagerTreeFromTreeWithBlobContents(
	tree: ISnapshotTreeWithBlobContents,
	blobs: ISerializableBlobContents,
) {
	const id = tree.blobs[redirectTableBlobName];
	const blob = tree.blobsContents?.[id];
	assert(blob !== undefined, 0x70f /* Blob must be present in blobsContents */);
	// ArrayBufferLike will not survive JSON.stringify()
	blobs[id] = bufferToString(blob, "utf8");
}
