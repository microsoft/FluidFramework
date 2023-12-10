/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
	ISequencedDocumentMessage,
	ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
	createResponseError,
	generateHandleContextPath,
	responseToException,
	SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import { assert, Deferred } from "@fluidframework/core-utils";
import { bufferToString, stringToBuffer, TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	IContainerRuntime,
	IContainerRuntimeEvents,
} from "@fluidframework/container-runtime-definitions";
import { AttachState, ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	createChildMonitoringContext,
	GenericError,
	LoggingError,
	MonitoringContext,
	PerformanceEvent,
	wrapError,
} from "@fluidframework/telemetry-utils";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";

import { canRetryOnError, runWithRetry } from "@fluidframework/driver-utils";
import { disableAttachmentBlobSweepKey } from "./gc";
import { IBlobMetadata } from "./metadata";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IFluidHandle<ArrayBufferLike> {
	private attached: boolean = false;

	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	public readonly absolutePath: string;

	constructor(
		public readonly path: string,
		public readonly routeContext: IFluidHandleContext,
		public get: () => Promise<any>,
		private readonly onAttachGraph?: () => void,
	) {
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	public attachGraph() {
		if (!this.attached) {
			this.attached = true;
			this.onAttachGraph?.();
		}
	}

	public bind(handle: IFluidHandle) {
		throw new Error("Cannot bind to blob handle");
	}
}

/**
 * Information from a snapshot needed to load BlobManager
 * @alpha
 */
export interface IBlobManagerLoadInfo {
	ids?: string[];
	redirectTable?: [string, string][];
}

// Restrict the IContainerRuntime interface to the subset required by BlobManager.  This helps to make
// the contract explicit and reduces the amount of mocking required for tests.
export type IBlobManagerRuntime = Pick<
	IContainerRuntime,
	"attachState" | "connected" | "logger" | "clientDetails"
> &
	TypedEventEmitter<IContainerRuntimeEvents>;

type ICreateBlobResponseWithTTL = ICreateBlobResponse & Partial<Record<"minTTLInSeconds", number>>;

interface PendingBlob {
	blob: ArrayBufferLike;
	uploading?: boolean;
	opsent?: boolean;
	storageId?: string;
	handleP: Deferred<BlobHandle>;
	uploadP?: Promise<ICreateBlobResponse | void>;
	uploadTime?: number;
	minTTLInSeconds?: number;
	attached?: boolean;
	acked?: boolean;
	abortSignal?: AbortSignal;
	pendingStashed?: boolean;
}

export interface IPendingBlobs {
	[id: string]: {
		blob: string;
		storageId?: string;
		uploadTime?: number;
		minTTLInSeconds?: number;
		attached?: boolean;
		acked?: boolean;
	};
}

export interface IBlobManagerEvents {
	(event: "noPendingBlobs", listener: () => void);
}

export class BlobManager extends TypedEventEmitter<IBlobManagerEvents> {
	public static readonly basePath = "_blobs";
	private static readonly redirectTableBlobName = ".redirectTable";
	private readonly mc: MonitoringContext;

	/**
	 * Map of local IDs to storage IDs. Contains identity entries (id → id) for storage IDs. All requested IDs should
	 * be a key in this map. Blobs created while the container is detached are stored in IDetachedBlobStorage which
	 * gives local IDs; the storage IDs are filled in at attach time.
	 * Note: It contains mappings from all clients, i.e., from remote clients as well. local ID comes from the client
	 * that uploaded the blob but its mapping to storage ID is needed in all clients in order to retrieve the blob.
	 */
	private readonly redirectTable: Map<string, string | undefined>;

	/**
	 * Blobs which we have not yet seen a BlobAttach op round-trip and not yet attached to a DDS.
	 */
	private readonly pendingBlobs: Map<string, PendingBlob> = new Map();

	/**
	 * Track ops in flight for online flow. This is used for optimizations where if we receive an ack for a storage ID,
	 * we can resolve all pending blobs with the same storage ID even though they may have different local IDs. That's
	 * because we know that the server will not delete the blob corresponding to that storage ID.
	 */
	private readonly opsInFlight: Map<string, string[]> = new Map();

	/**
	 * This stores IDs of tombstoned blobs.
	 * Tombstone is a temporary feature that imitates a blob getting swept by garbage collection.
	 */
	private readonly tombstonedBlobs: Set<string> = new Set();

	private readonly sendBlobAttachOp: (localId: string, storageId?: string) => void;
	private stopAttaching: boolean = false;

	constructor(
		private readonly routeContext: IFluidHandleContext,
		snapshot: IBlobManagerLoadInfo,
		private readonly getStorage: () => IDocumentStorageService,
		/**
		 * Submit a BlobAttach op. When a blob is uploaded, there is a short grace period before which the blob is
		 * deleted. The BlobAttach op notifies the server that blob is in use. The server will then not delete the
		 * the blob as long as it is listed as referenced in future summaries. The summarizing client will know to
		 * include the storage ID in the summary when it sees the op.
		 *
		 * The op will also include a local ID to inform all clients of the relation to the storage ID, without
		 * knowledge of which they cannot request the blob from storage. It's important that this op is sequenced
		 * before any ops that reference the local ID, otherwise, an invalid handle could be added to the document.
		 */
		sendBlobAttachOp: (localId: string, storageId?: string) => void,
		// Called when a blob node is requested. blobPath is the path of the blob's node in GC's graph.
		// blobPath's format - `/<BlobManager.basePath>/<blobId>`.
		private readonly blobRequested: (blobPath: string) => void,
		// Called to check if a blob has been deleted by GC.
		// blobPath's format - `/<BlobManager.basePath>/<blobId>`.
		private readonly isBlobDeleted: (blobPath: string) => boolean,
		private readonly runtime: IBlobManagerRuntime,
		stashedBlobs: IPendingBlobs = {},
		private readonly closeContainer: (error?: ICriticalContainerError) => void,
	) {
		super();
		this.mc = createChildMonitoringContext({
			logger: this.runtime.logger,
			namespace: "BlobManager",
		});

		this.redirectTable = this.load(snapshot);

		// Begin uploading stashed blobs from previous container instance
		Object.entries(stashedBlobs).forEach(([localId, entry]) => {
			const blob = stringToBuffer(entry.blob, "base64");
			const attached = entry.attached;
			const acked = entry.acked;
			const storageId = entry.storageId; // entry.storageId = response.id
			if (entry.minTTLInSeconds && entry.uploadTime) {
				const timeLapseSinceLocalUpload = (Date.now() - entry.uploadTime) / 1000;
				// stashed entries with more than half-life in storage will not be reuploaded
				if (entry.minTTLInSeconds - timeLapseSinceLocalUpload > entry.minTTLInSeconds / 2) {
					this.pendingBlobs.set(localId, {
						blob,
						uploading: false,
						opsent: true,
						handleP: new Deferred(),
						storageId,
						uploadP: undefined,
						uploadTime: entry.uploadTime,
						minTTLInSeconds: entry.minTTLInSeconds,
						attached,
						acked,
					});
					return;
				}
			}
			this.pendingBlobs.set(localId, {
				blob,
				uploading: true,
				handleP: new Deferred(),
				uploadP: this.uploadBlob(localId, blob),
				attached,
				acked,
				opsent: true,
				pendingStashed: true,
			});
		});

		this.sendBlobAttachOp = (localId: string, blobId?: string) => {
			const pendingEntry = this.pendingBlobs.get(localId);
			assert(
				pendingEntry !== undefined,
				0x725 /* Must have pending blob entry for upcoming op */,
			);
			if (pendingEntry?.uploadTime && pendingEntry?.minTTLInSeconds) {
				const secondsSinceUpload = (Date.now() - pendingEntry.uploadTime) / 1000;
				const expired = pendingEntry.minTTLInSeconds - secondsSinceUpload < 0;
				this.mc.logger.sendTelemetryEvent({
					eventName: "sendBlobAttach",
					secondsSinceUpload,
					minTTLInSeconds: pendingEntry.minTTLInSeconds,
					expired,
				});
				if (expired) {
					// we want to avoid submitting ops with broken handles
					this.closeContainer(
						new GenericError(
							"Trying to submit a BlobAttach for expired blob",
							undefined,
							{
								localId,
								blobId,
								secondsSinceUpload,
							},
						),
					);
				}
			}
			pendingEntry.opsent = true;
			return sendBlobAttachOp(localId, blobId);
		};
	}

	public get allBlobsAttached(): boolean {
		for (const [, entry] of this.pendingBlobs) {
			if (entry.attached === false) {
				return false;
			}
		}
		return true;
	}

	public get hasPendingBlobs(): boolean {
		return (
			(this.runtime.attachState !== AttachState.Attached && this.redirectTable.size > 0) ||
			this.pendingBlobs.size > 0
		);
	}

	private createAbortError(pending?: PendingBlob) {
		return new LoggingError("uploadBlob aborted", {
			acked: pending?.acked,
			uploadTime: pending?.uploadTime,
		});
	}

	public hasPendingStashedBlobs(): boolean {
		return Array.from(this.pendingBlobs.values()).some((e) => e.pendingStashed === true);
	}
	/**
	 * Upload blobs added while offline. This must be completed before connecting and resubmitting ops.
	 */
	public async processStashedChanges() {
		const pendingUploads = Array.from(this.pendingBlobs.values())
			.filter((e) => e.pendingStashed === true)
			.map(async (e) => e.uploadP);
		await PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "BlobUploadProcessStashedChanges",
				count: pendingUploads.length,
			},
			async () => Promise.all(pendingUploads),
			{ start: true, end: true },
		);
	}

	/**
	 * Set of actual storage IDs (i.e., IDs that can be requested from storage). This will be empty if the container is
	 * detached or there are no (non-pending) attachment blobs in the document
	 */
	private get storageIds(): Set<string> {
		const ids = new Set<string | undefined>(this.redirectTable.values());

		// If we are detached, we will not have storage IDs, only undefined
		const undefinedValueInTable = ids.delete(undefined);

		// For a detached container, entries are inserted into the redirect table with an undefined storage ID.
		// For an attached container, entries are inserted w/storage ID after the BlobAttach op round-trips.
		assert(
			!undefinedValueInTable ||
				(this.runtime.attachState === AttachState.Detached && ids.size === 0),
			0x382 /* 'redirectTable' must contain only undefined while detached / defined values while attached */,
		);

		return ids as Set<string>;
	}

	public async getBlob(blobId: string): Promise<ArrayBufferLike> {
		// Verify that the blob is not deleted, i.e., it has not been garbage collected. If it is, this will throw
		// an error, failing the call.
		this.verifyBlobNotDeleted(blobId);
		// Let runtime know that the corresponding GC node was requested.
		// Note that this will throw if the blob is inactive or tombstoned and throwing on incorrect usage
		// is configured.
		this.blobRequested(getGCNodePathFromBlobId(blobId));

		const pending = this.pendingBlobs.get(blobId);
		if (pending) {
			return pending.blob;
		}

		let storageId: string;
		if (this.runtime.attachState === AttachState.Detached) {
			assert(this.redirectTable.has(blobId), 0x383 /* requesting unknown blobs */);

			// Blobs created while the container is detached are stored in IDetachedBlobStorage.
			// The 'IDocumentStorageService.readBlob()' call below will retrieve these via localId.
			storageId = blobId;
		} else {
			const attachedStorageId = this.redirectTable.get(blobId);
			assert(!!attachedStorageId, 0x11f /* "requesting unknown blobs" */);
			storageId = attachedStorageId;
		}

		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{ eventName: "AttachmentReadBlob", id: storageId },
			async () => {
				return this.getStorage().readBlob(storageId);
			},
			{ end: true, cancel: "error" },
		);
	}

	private getBlobHandle(id: string): BlobHandle {
		assert(
			this.redirectTable.has(id) || this.pendingBlobs.has(id),
			0x384 /* requesting handle for unknown blob */,
		);
		const pending = this.pendingBlobs.get(id);
		const callback = pending
			? () => {
					pending.attached = true;
					this.emit("blobAttached", pending);
					this.deletePendingBlobMaybe(id);
			  }
			: undefined;
		return new BlobHandle(
			`${BlobManager.basePath}/${id}`,
			this.routeContext,
			async () => this.getBlob(id),
			callback,
		);
	}

	private async createBlobDetached(
		blob: ArrayBufferLike,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		// Blobs created while the container is detached are stored in IDetachedBlobStorage.
		// The 'IDocumentStorageService.createBlob()' call below will respond with a localId.
		const response = await this.getStorage().createBlob(blob);
		this.setRedirection(response.id, undefined);
		return this.getBlobHandle(response.id);
	}

	public async createBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		if (this.runtime.attachState === AttachState.Detached) {
			return this.createBlobDetached(blob);
		}
		if (this.runtime.attachState === AttachState.Attaching) {
			// blob upload is not supported in "Attaching" state
			this.mc.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
			await new Promise<void>((resolve) => this.runtime.once("attached", resolve));
		}
		assert(
			this.runtime.attachState === AttachState.Attached,
			0x385 /* For clarity and paranoid defense against adding future attachment states */,
		);

		if (signal?.aborted) {
			throw this.createAbortError();
		}

		// Create a local ID for the blob. After uploading it to storage and before returning it, a local ID to
		// storage ID mapping is created.
		const localId = uuid();
		const pendingEntry: PendingBlob = {
			blob,
			uploading: true,
			handleP: new Deferred(),
			uploadP: this.uploadBlob(localId, blob),
			attached: false,
			acked: false,
			abortSignal: signal,
			opsent: false,
		};
		this.pendingBlobs.set(localId, pendingEntry);

		const abortListener = () => {
			if (!pendingEntry.acked) {
				pendingEntry.handleP.reject(this.createAbortError(pendingEntry));
			}
		};
		signal?.addEventListener("abort", abortListener, { once: true });

		return pendingEntry.handleP.promise.finally(() => {
			signal?.removeEventListener("abort", abortListener);
		});
	}

	private async uploadBlob(
		localId: string,
		blob: ArrayBufferLike,
	): Promise<ICreateBlobResponse | void> {
		return runWithRetry(
			async () => {
				try {
					return await this.getStorage().createBlob(blob);
				} catch (error) {
					const entry = this.pendingBlobs.get(localId);
					assert(
						!!entry,
						0x387 /* Must have pending blob entry for blob which failed to upload */,
					);
					if (entry.opsent && !canRetryOnError(error)) {
						throw wrapError(
							error,
							() => new LoggingError(`uploadBlob error`, { canRetry: true }),
						);
					}
					throw error;
				}
			},
			"createBlob",
			this.mc.logger,
			{
				cancel: this.pendingBlobs.get(localId)?.abortSignal,
			},
		).then(
			(response) => this.onUploadResolve(localId, response),
			(error) => {
				// it will only reject if we haven't sent an op
				// and is a non-retriable error. It will only reject
				// the promise but not throw any error outside.
				this.pendingBlobs.get(localId)?.handleP.reject(error);
				this.deletePendingBlob(localId);
			},
		);
	}

	/**
	 * Set up a mapping in the redirect table from fromId to toId. Also, notify the runtime that a reference is added
	 * which is required for GC.
	 */
	private setRedirection(fromId: string, toId: string | undefined) {
		this.redirectTable.set(fromId, toId);
	}

	private deletePendingBlobMaybe(id: string) {
		if (this.pendingBlobs.has(id)) {
			const entry = this.pendingBlobs.get(id);
			if (entry?.attached && entry?.acked) {
				this.deletePendingBlob(id);
			}
		}
	}

	private deletePendingBlob(id: string) {
		if (this.pendingBlobs.delete(id) && !this.hasPendingBlobs) {
			this.emit("noPendingBlobs");
		}
	}

	private onUploadResolve(localId: string, response: ICreateBlobResponseWithTTL) {
		const entry = this.pendingBlobs.get(localId);
		assert(entry !== undefined, 0x6c8 /* pending blob entry not found for uploaded blob */);
		if ((entry.abortSignal?.aborted === true && !entry.opsent) || this.stopAttaching) {
			this.deletePendingBlob(localId);
			return;
		}
		assert(
			entry.uploading === true,
			0x386 /* Must have pending blob entry for uploaded blob */,
		);
		entry.storageId = response.id;
		entry.uploadTime = Date.now();
		entry.minTTLInSeconds = response.minTTLInSeconds;
		// Send a blob attach op. This serves two purposes:
		// 1. If its a new blob, i.e., it isn't de-duped, the server will keep the blob alive if it sees this op
		//    until its storage ID is added to the next summary.
		// 2. It will create a local ID to storage ID mapping in all clients which is needed to retrieve the
		//    blob from the server via the storage ID.
		if (!entry.opsent) {
			this.sendBlobAttachOp(localId, response.id);
		}
		if (this.storageIds.has(response.id)) {
			// The blob is de-duped. Set up a local ID to storage ID mapping and return the blob. Since this is
			// an existing blob, we don't have to wait for the op to be ack'd since this step has already
			// happened before and so, the server won't delete it.
			this.setRedirection(localId, response.id);
			entry.handleP.resolve(this.getBlobHandle(localId));
			this.deletePendingBlobMaybe(localId);
		} else {
			// If there is already an op for this storage ID, append the local ID to the list. Once any op for
			// this storage ID is ack'd, all pending blobs for it can be resolved since the op will keep the
			// blob alive in storage.
			this.opsInFlight.set(
				response.id,
				(this.opsInFlight.get(response.id) ?? []).concat(localId),
			);
		}
		return response;
	}

	/**
	 * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
	 * submitted to runtime while disconnected.
	 * @param metadata - op metadata containing storage and/or local IDs
	 */
	public reSubmit(metadata: Record<string, unknown> | undefined) {
		assert(!!metadata, 0x38b /* Resubmitted ops must have metadata */);
		const { localId, blobId }: { localId?: string; blobId?: string } = metadata;
		assert(localId !== undefined, 0x50d /* local ID not available on reSubmit */);
		const pendingEntry = this.pendingBlobs.get(localId);

		if (!blobId) {
			// We submitted this op while offline. The blob should have been uploaded by now.
			assert(
				pendingEntry?.opsent === true && !!pendingEntry?.storageId,
				0x38d /* blob must be uploaded before resubmitting BlobAttach op */,
			);
			return this.sendBlobAttachOp(localId, pendingEntry?.storageId);
		}
		return this.sendBlobAttachOp(localId, blobId);
	}

	public processBlobAttachOp(message: ISequencedDocumentMessage, local: boolean) {
		const localId = (message.metadata as IBlobMetadata | undefined)?.localId;
		const blobId = (message.metadata as IBlobMetadata | undefined)?.blobId;

		if (localId) {
			const pendingEntry = this.pendingBlobs.get(localId);
			if (pendingEntry?.abortSignal?.aborted) {
				this.deletePendingBlob(localId);
				return;
			}
			if (pendingEntry?.pendingStashed) {
				pendingEntry.pendingStashed = false;
			}
		}
		assert(blobId !== undefined, 0x12a /* "Missing blob id on metadata" */);

		// Set up a mapping from local ID to storage ID. This is crucial since without this the blob cannot be
		// requested from the server.
		// Note: The check for undefined is needed for back-compat when localId was not part of the BlobAttach op that
		// was sent when online.
		if (localId !== undefined) {
			this.setRedirection(localId, blobId);
		}
		// set identity (id -> id) entry
		this.setRedirection(blobId, blobId);

		if (local) {
			assert(localId !== undefined, 0x50e /* local ID not present in blob attach message */);
			const waitingBlobs = this.opsInFlight.get(blobId);
			if (waitingBlobs !== undefined) {
				// For each op corresponding to this storage ID that we are waiting for, resolve the pending blob.
				// This is safe because the server will keep the blob alive and the op containing the local ID to
				// storage ID is already in flight and any op containing this local ID will be sequenced after that.
				waitingBlobs.forEach((pendingLocalId) => {
					const entry = this.pendingBlobs.get(pendingLocalId);
					assert(
						entry !== undefined,
						0x38f /* local online BlobAttach op with no pending blob entry */,
					);
					this.setRedirection(pendingLocalId, blobId);
					entry.acked = true;
					entry.handleP.resolve(this.getBlobHandle(pendingLocalId));
					this.deletePendingBlobMaybe(pendingLocalId);
				});
				this.opsInFlight.delete(blobId);
			}
			const localEntry = this.pendingBlobs.get(localId);
			if (localEntry) {
				localEntry.acked = true;
				localEntry.handleP.resolve(this.getBlobHandle(localId));
				this.deletePendingBlobMaybe(localId);
			}
		}
	}

	/**
	 * Reads blobs needed to load BlobManager from storage.
	 * @param blobsTree - Tree containing IDs of previously attached blobs. We
	 * look for the IDs in the blob entries of the tree since the both the r11s
	 * and SPO drivers replace the attachment types returned in snapshot() with blobs.
	 */
	public static async load(
		blobsTree: ISnapshotTree | undefined,
		tryFetchBlob: (id: string) => Promise<[string, string][]>,
	): Promise<IBlobManagerLoadInfo> {
		if (!blobsTree) {
			return {};
		}
		let redirectTable;
		const tableId = blobsTree.blobs[this.redirectTableBlobName];
		if (tableId) {
			redirectTable = await tryFetchBlob(tableId);
		}
		const ids = Object.entries(blobsTree.blobs)
			.filter(([k, _]) => k !== this.redirectTableBlobName)
			.map(([_, v]) => v);
		return { ids, redirectTable };
	}

	/**
	 * Load a set of previously attached blob IDs and redirect table from a previous snapshot.
	 */
	private load(snapshot: IBlobManagerLoadInfo): Map<string, string | undefined> {
		this.mc.logger.sendTelemetryEvent({
			eventName: "AttachmentBlobsLoaded",
			count: snapshot.ids?.length ?? 0,
			redirectTable: snapshot.redirectTable?.length,
		});
		const table = new Map<string, string | undefined>(snapshot.redirectTable);
		if (snapshot.ids) {
			const detached = this.runtime.attachState === AttachState.Detached;
			// If we are detached, we don't have storage IDs yet, so set to undefined
			// Otherwise, set identity (id -> id) entries
			snapshot.ids.forEach((entry) => table.set(entry, detached ? undefined : entry));
		}
		return table;
	}

	public summarize(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		// if storageIds is empty, it means we are detached and have only local IDs, or that there are no blobs attached
		const blobIds =
			this.storageIds.size > 0
				? Array.from(this.storageIds)
				: Array.from(this.redirectTable.keys());
		const builder = new SummaryTreeBuilder();
		blobIds.forEach((blobId) => {
			builder.addAttachment(blobId);
		});

		// Any non-identity entries in the table need to be saved in the summary
		if (this.redirectTable.size > blobIds.length) {
			builder.addBlob(
				BlobManager.redirectTableBlobName,
				// filter out identity entries
				JSON.stringify(
					Array.from(this.redirectTable.entries()).filter(
						([localId, storageId]) => localId !== storageId,
					),
				),
			);
		}

		return builder.getSummaryTree();
	}

	/**
	 * Generates data used for garbage collection. Each blob uploaded represents a node in the GC graph as it can be
	 * individually referenced by storing its handle in a referenced DDS. Returns the list of blob ids as GC nodes.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data. BlobManager doesn't care
	 * about this for now because the data is a simple list of blob ids.
	 */
	public getGCData(fullGC: boolean = false): IGarbageCollectionData {
		const gcData: IGarbageCollectionData = { gcNodes: {} };
		for (const [localId, storageId] of this.redirectTable) {
			assert(!!storageId, 0x390 /* Must be attached to get GC data */);
			// Only return local ids as GC nodes because a blob can only be referenced via its local id. The storage
			// id entries have the same key and value, ignore them.
			// The outbound routes are empty because a blob node cannot reference other nodes. It can only be referenced
			// by adding its handle to a referenced DDS.
			if (localId !== storageId) {
				gcData.gcNodes[getGCNodePathFromBlobId(localId)] = [];
			}
		}
		return gcData;
	}

	/**
	 * This is called to update blobs whose routes are unused. The unused blobs are deleted.
	 * @param unusedRoutes - The routes of the blob nodes that are unused. These routes will be based off of local ids.
	 */
	public updateUnusedRoutes(unusedRoutes: readonly string[]): void {
		this.deleteBlobsFromRedirectTable(unusedRoutes);
	}

	/**
	 * Delete attachment blobs that are sweep ready.
	 * @param sweepReadyBlobRoutes - The routes of blobs that are sweep ready and should be deleted. These routes will
	 * be based off of local ids.
	 * @returns The routes of blobs that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyBlobRoutes: readonly string[]): readonly string[] {
		// If sweep for attachment blobs is not enabled, return empty list indicating nothing is deleted.
		if (this.mc.config.getBoolean(disableAttachmentBlobSweepKey) === true) {
			return [];
		}

		this.deleteBlobsFromRedirectTable(sweepReadyBlobRoutes);
		return Array.from(sweepReadyBlobRoutes);
	}

	/**
	 * Delete blobs with the given routes from the redirect table.
	 * The routes are GC nodes paths of format -`/<BlobManager.basePath>/<blobId>`. The blob ids are all local ids.
	 * Deleting the blobs involves 2 steps:
	 * 1. The redirect table entry for the local ids are deleted.
	 * 2. If the storage ids corresponding to the deleted local ids are not in-use anymore, the redirect table entries
	 * for the storage ids are deleted as well.
	 *
	 * Note that this does not delete the blobs from storage service immediately. Deleting the blobs from redirect table
	 * will remove them the next summary. The service would them delete them some time in the future.
	 */
	private deleteBlobsFromRedirectTable(blobRoutes: readonly string[]) {
		if (blobRoutes.length === 0) {
			return;
		}

		// This tracks the storage ids of local ids that are deleted. After the local ids have been deleted, if any of
		// these storage ids are unused, they will be deleted as well.
		const maybeUnusedStorageIds: Set<string> = new Set();
		for (const route of blobRoutes) {
			const blobId = getBlobIdFromGCNodePath(route);
			if (!this.redirectTable.has(blobId)) {
				this.mc.logger.sendErrorEvent({
					eventName: "DeletedAttachmentBlobNotFound",
					blobId,
				});
				continue;
			}
			const storageId = this.redirectTable.get(blobId);
			assert(!!storageId, 0x5bb /* Must be attached to run GC */);
			maybeUnusedStorageIds.add(storageId);
			this.redirectTable.delete(blobId);
		}

		// Find out storage ids that are in-use and remove them from maybeUnusedStorageIds. A storage id is in-use if
		// the redirect table has a local id -> storage id entry for it.
		for (const [localId, storageId] of this.redirectTable.entries()) {
			assert(!!storageId, 0x5bc /* Must be attached to run GC */);
			// For every storage id, the redirect table has a id -> id entry. These do not make the storage id in-use.
			if (maybeUnusedStorageIds.has(storageId) && localId !== storageId) {
				maybeUnusedStorageIds.delete(storageId);
			}
		}

		// For unused storage ids, delete their id -> id entries from the redirect table.
		// This way they'll be absent from the next summary, and the service is free to delete them from storage.
		for (const storageId of maybeUnusedStorageIds) {
			this.redirectTable.delete(storageId);
		}
	}

	/**
	 * This is called to update blobs whose routes are tombstones. Tombstoned blobs enable testing scenarios with
	 * accessing deleted content without actually deleting content from summaries.
	 * @param tombstonedRoutes - The routes of blob nodes that are tombstones.
	 */
	public updateTombstonedRoutes(tombstonedRoutes: readonly string[]) {
		const tombstonedBlobsSet: Set<string> = new Set();
		// The routes or blob node paths are in the same format as returned in getGCData -
		// `/<BlobManager.basePath>/<blobId>`.
		for (const route of tombstonedRoutes) {
			const blobId = getBlobIdFromGCNodePath(route);
			tombstonedBlobsSet.add(blobId);
		}

		// Remove blobs from the tombstone list that were tombstoned but aren't anymore as per the tombstoneRoutes.
		for (const blobId of this.tombstonedBlobs) {
			if (!tombstonedBlobsSet.has(blobId)) {
				this.tombstonedBlobs.delete(blobId);
			}
		}

		// Mark blobs that are now tombstoned by adding them to the tombstone list.
		for (const blobId of tombstonedBlobsSet) {
			this.tombstonedBlobs.add(blobId);
		}
	}

	/**
	 * Verifies that the blob with given id is not deleted, i.e., it has not been garbage collected. If the blob is GC'd,
	 * log an error and throw if necessary.
	 */
	private verifyBlobNotDeleted(blobId: string) {
		if (!this.isBlobDeleted(getGCNodePathFromBlobId(blobId))) {
			return;
		}

		const request = { url: blobId };
		const error = responseToException(
			createResponseError(404, `Blob was deleted`, request),
			request,
		);
		// Only log deleted events. Tombstone events are logged by garbage collector.
		this.mc.logger.sendErrorEvent(
			{
				eventName: "GC_Deleted_Blob_Requested",
				pkg: BlobManager.basePath,
			},
			error,
		);
		throw error;
	}

	public setRedirectTable(table: Map<string, string>) {
		assert(
			this.runtime.attachState === AttachState.Detached,
			0x252 /* "redirect table can only be set in detached container" */,
		);
		assert(
			this.redirectTable.size === table.size,
			0x391 /* Redirect table size must match BlobManager's local ID count */,
		);
		for (const [localId, storageId] of table) {
			assert(
				this.redirectTable.has(localId),
				0x254 /* "unrecognized id in redirect table" */,
			);
			this.setRedirection(localId, storageId);
			// set identity (id -> id) entry
			this.setRedirection(storageId, storageId);
		}
	}

	public async attachAndGetPendingBlobs(
		stopBlobAttachingSignal?: AbortSignal,
	): Promise<IPendingBlobs | undefined> {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{ eventName: "GetPendingBlobs" },
			async () => {
				if (this.pendingBlobs.size === 0) {
					return;
				}
				const blobs = {};
				const localBlobs = new Set<PendingBlob>();
				while (localBlobs.size < this.pendingBlobs.size) {
					const attachBlobsP: Promise<void>[] = [];
					for (const [id, entry] of this.pendingBlobs) {
						if (!localBlobs.has(entry)) {
							localBlobs.add(entry);
							entry.handleP.resolve(this.getBlobHandle(id));
							attachBlobsP.push(
								new Promise<void>((resolve, reject) => {
									stopBlobAttachingSignal?.addEventListener(
										"abort",
										() => {
											this.stopAttaching = true;
											reject(new Error("Operation aborted"));
										},
										{ once: true },
									);
									const onBlobAttached = (attachedEntry) => {
										if (attachedEntry === entry) {
											this.off("blobAttached", onBlobAttached);
											resolve();
										}
									};
									if (!entry.attached) {
										this.on("blobAttached", onBlobAttached);
									} else {
										resolve();
									}
								}),
							);
						}
					}
					await Promise.allSettled(attachBlobsP).catch(() => {});
				}

				for (const [id, entry] of this.pendingBlobs) {
					if (stopBlobAttachingSignal?.aborted && !entry.attached) {
						this.mc.logger.sendTelemetryEvent({
							eventName: "UnableToStashBlob",
							id,
						});
						continue;
					}
					assert(entry.attached === true, 0x790 /* stashed blob should be attached */);
					if (!entry.opsent) {
						this.sendBlobAttachOp(id, entry.storageId);
					}
					blobs[id] = {
						blob: bufferToString(entry.blob, "base64"),
						storageId: entry.storageId,
						attached: entry.attached,
						acked: entry.acked,
						minTTLInSeconds: entry.minTTLInSeconds,
						uploadTime: entry.uploadTime,
					};
				}
				return Object.keys(blobs).length > 0 ? blobs : undefined;
			},
		);
	}
}

/**
 * For a blobId, returns its path in GC's graph. The node path is of the format `/<BlobManager.basePath>/<blobId>`.
 * This path must match the path of the blob handle returned by the createBlob API because blobs are marked
 * referenced by storing these handles in a referenced DDS.
 */
function getGCNodePathFromBlobId(blobId: string) {
	return `/${BlobManager.basePath}/${blobId}`;
}

/**
 * For a given GC node path, return the blobId. The node path is of the format `/<BlobManager.basePath>/<blobId>`.
 */
function getBlobIdFromGCNodePath(nodePath: string) {
	const pathParts = nodePath.split("/");
	assert(
		pathParts.length === 3 && pathParts[1] === BlobManager.basePath,
		0x5bd /* Invalid blob node path */,
	);
	return pathParts[2];
}
