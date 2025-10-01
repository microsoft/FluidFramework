/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import {
	AttachState,
	type IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import type {
	IContainerRuntime,
	IContainerRuntimeEvents,
} from "@fluidframework/container-runtime-definitions/internal";
import type {
	IEmitter,
	IEventProvider,
	IFluidHandleContext,
	IFluidHandleInternalPayloadPending,
	ILocalFluidHandle,
	ILocalFluidHandleEvents,
	Listenable,
	PayloadState,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { ICreateBlobResponse } from "@fluidframework/driver-definitions/internal";
import type {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import {
	FluidHandleBase,
	createResponseError,
	generateHandleContextPath,
	responseToException,
} from "@fluidframework/runtime-utils/internal";
import {
	LoggingError,
	type MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { isBlobMetadata } from "../metadata.js";

import {
	summarizeBlobManagerState,
	toRedirectTable,
	type IBlobManagerLoadInfo,
} from "./blobManagerSnapSum.js";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle
	extends FluidHandleBase<ArrayBufferLike>
	implements
		ILocalFluidHandle<ArrayBufferLike>,
		IFluidHandleInternalPayloadPending<ArrayBufferLike>
{
	private attached: boolean = false;

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	private _events:
		| (Listenable<ILocalFluidHandleEvents> & IEmitter<ILocalFluidHandleEvents>)
		| undefined;
	public get events(): Listenable<ILocalFluidHandleEvents> {
		return (this._events ??= createEmitter<ILocalFluidHandleEvents>());
	}

	private _payloadState: PayloadState;
	public get payloadState(): PayloadState {
		return this._payloadState;
	}

	/**
	 * The error property starts undefined, signalling that there has been no error yet.
	 * If an error occurs, the property will contain the error.
	 */
	private _payloadShareError: unknown;
	public get payloadShareError(): unknown {
		return this._payloadShareError;
	}

	public readonly absolutePath: string;

	public constructor(
		public readonly path: string,
		public readonly routeContext: IFluidHandleContext,
		// TODO: just take the blob rather than a get function?
		public get: () => Promise<ArrayBufferLike>,
		public readonly payloadPending: boolean,
		private readonly onAttachGraph?: () => void,
	) {
		super();
		this._payloadState = payloadPending ? "pending" : "shared";
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	public readonly notifyShared = (): void => {
		this._payloadState = "shared";
		this._events?.emit("payloadShared");
	};

	public readonly notifyFailed = (error: unknown): void => {
		this._payloadShareError = error;
		this._events?.emit("payloadShareFailed", error);
	};

	public attachGraph(): void {
		if (!this.attached) {
			this.attached = true;
			this.onAttachGraph?.();
		}
	}
}

// Restrict the IContainerRuntime interface to the subset required by BlobManager.  This helps to make
// the contract explicit and reduces the amount of mocking required for tests.
export type IBlobManagerRuntime = Pick<
	IContainerRuntime,
	"attachState" | "baseLogger" | "disposed"
> &
	IEventProvider<IContainerRuntimeEvents>;

export type ICreateBlobResponseWithTTL = ICreateBlobResponse &
	Partial<Record<"minTTLInSeconds", number>>;

interface LocalOnlyBlob {
	state: "localOnly";
	blob: ArrayBufferLike;
}

interface UploadingBlob {
	state: "uploading";
	blob: ArrayBufferLike;
}

interface UploadedBlob {
	state: "uploaded";
	blob: ArrayBufferLike;
	storageId: string;
	uploadTime: number;
	minTTLInSeconds: number | undefined;
}

interface AttachingBlob {
	state: "attaching";
	blob: ArrayBufferLike;
	storageId: string;
	uploadTime: number;
	minTTLInSeconds: number | undefined;
}

interface AttachedBlob {
	state: "attached";
	blob: ArrayBufferLike;
}

// TODO: How to track failures?
type LocalBlobRecord =
	| LocalOnlyBlob
	| UploadingBlob
	| UploadedBlob
	| AttachingBlob
	| AttachedBlob;

type SerializedLocalBlobRecord =
	| (Omit<LocalOnlyBlob, "blob"> & { blob: string })
	| (Omit<UploadingBlob, "blob"> & { blob: string })
	| (Omit<UploadedBlob, "blob"> & { blob: string })
	| (Omit<AttachingBlob, "blob"> & { blob: string })
	| (Omit<AttachedBlob, "blob"> & { blob: string });

export interface IPendingBlobs {
	[localId: string]: SerializedLocalBlobRecord;
}

interface IBlobManagerInternalEvents {
	handleAttached: (pending: LocalBlobRecord) => void;
	processedBlobAttach: (localId: string, storageId: string) => void;
}

export const blobManagerBasePath = "_blobs";

export class BlobManager {
	private readonly mc: MonitoringContext;

	private readonly internalEvents = createEmitter<IBlobManagerInternalEvents>();

	/**
	 * Map of local IDs to storage IDs. Also includes identity mappings of storage ID to storage ID for all known
	 * storage IDs. All requested IDs must be a key in this map. Blobs created while the container is detached are
	 * stored in IDetachedBlobStorage which gives pseudo storage IDs; the real storage IDs are filled in at attach
	 * time via setRedirectTable().
	 */
	private readonly redirectTable: Map<string, string>;

	private readonly localBlobCache: Map<string, LocalBlobRecord> = new Map();
	// Blobs with an attached handle that have not finished blob-attaching are the set we need to provide from
	// getPendingState().  This will store their local IDs, and then we can look them up against the localBlobCache.
	private readonly handleAttachedPendingBlobs: Set<string> = new Set();

	private readonly sendBlobAttachOp: (localId: string, storageId: string) => void;

	private readonly routeContext: IFluidHandleContext;
	private readonly storage: Pick<IContainerStorageService, "createBlob" | "readBlob">;
	// Called when a blob node is requested. blobPath is the path of the blob's node in GC's graph.
	// blobPath's format - `/<basePath>/<localId>`.
	private readonly blobRequested: (blobPath: string) => void;
	// Called to check if a blob has been deleted by GC.
	// blobPath's format - `/<basePath>/<localId>`.
	private readonly isBlobDeleted: (blobPath: string) => boolean;
	private readonly runtime: IBlobManagerRuntime;
	private readonly localIdGenerator: () => string;

	private readonly createBlobPayloadPending: boolean;

	public constructor(props: {
		readonly routeContext: IFluidHandleContext;

		blobManagerLoadInfo: IBlobManagerLoadInfo;
		readonly storage: Pick<IContainerStorageService, "createBlob" | "readBlob">;
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
		sendBlobAttachOp: (localId: string, storageId: string) => void;
		// Called when a blob node is requested. blobPath is the path of the blob's node in GC's graph.
		// blobPath's format - `/<basePath>/<localId>`.
		readonly blobRequested: (blobPath: string) => void;
		// Called to check if a blob has been deleted by GC.
		// blobPath's format - `/<basePath>/<localId>`.
		readonly isBlobDeleted: (blobPath: string) => boolean;
		readonly runtime: IBlobManagerRuntime;
		stashedBlobs: IPendingBlobs | undefined;
		readonly localIdGenerator?: (() => string) | undefined;
		readonly createBlobPayloadPending: boolean;
	}) {
		const {
			routeContext,
			blobManagerLoadInfo,
			storage,
			sendBlobAttachOp,
			blobRequested,
			isBlobDeleted,
			runtime,
			localIdGenerator,
			createBlobPayloadPending,
		} = props;
		this.routeContext = routeContext;
		this.storage = storage;
		this.blobRequested = blobRequested;
		this.isBlobDeleted = isBlobDeleted;
		this.runtime = runtime;
		this.localIdGenerator = localIdGenerator ?? uuid;
		this.createBlobPayloadPending = createBlobPayloadPending;

		this.mc = createChildMonitoringContext({
			logger: this.runtime.baseLogger,
			namespace: "BlobManager",
		});

		this.redirectTable = toRedirectTable(blobManagerLoadInfo, this.mc.logger);

		this.sendBlobAttachOp = sendBlobAttachOp;
	}

	private createAbortError(pending?: LocalBlobRecord): LoggingError {
		// TODO: Any other properties?
		return new LoggingError("createBlob aborted");
	}

	public hasBlob(localId: string): boolean {
		return this.redirectTable.has(localId) || this.localBlobCache.has(localId);
	}

	/**
	 * Lookup the blob storage ID for a given local blob id.
	 * @param localId - The local blob id. Likely coming from a handle.
	 * @returns The storage ID if found and the blob is not pending, undefined otherwise.
	 * @remarks
	 * For blobs with pending payloads (localId exists but upload hasn't finished), this is expected to return undefined.
	 * Consumers should use the observability APIs on the handle (handle.payloadState, payloadShared event)
	 * to understand/wait for storage ID availability.
	 * Similarly, when the runtime is detached, this will return undefined as no blobs have been uploaded to storage.
	 */
	public lookupTemporaryBlobStorageId(localId: string): string | undefined {
		if (this.runtime.attachState === AttachState.Detached) {
			return undefined;
		}
		// Get the storage ID from the redirect table
		return this.redirectTable.get(localId);
	}

	/**
	 * Retrieve the blob with the given local blob id.
	 * @param localId - The local blob id.  Likely coming from a handle.
	 * @param payloadPending - Whether we suspect the payload may be pending and not available yet.
	 * @returns A promise which resolves to the blob contents
	 */
	public async getBlob(localId: string, payloadPending: boolean): Promise<ArrayBufferLike> {
		// Verify that the blob is not deleted, i.e., it has not been garbage collected. If it is, this will throw
		// an error, failing the call.
		this.verifyBlobNotDeleted(localId);
		// Let runtime know that the corresponding GC node was requested.
		// Note that this will throw if the blob is inactive or tombstoned and throwing on incorrect usage
		// is configured.
		this.blobRequested(getGCNodePathFromLocalId(localId));

		const localBlobRecord = this.localBlobCache.get(localId);
		if (localBlobRecord !== undefined) {
			return localBlobRecord.blob;
		}

		let storageId = this.redirectTable.get(localId);
		if (storageId === undefined) {
			// Only blob handles explicitly marked with pending payload are permitted to exist without
			// yet knowing their storage id. Otherwise they must already be associated with a storage id.
			// Handles for detached blobs are not payload pending, though they should also always be present
			// in the localBlobCache and therefore should never need to refer to storage.
			assert(payloadPending, 0x11f /* "requesting unknown blobs" */);
			// If we didn't find it in the redirectTable and it's payloadPending, assume the attach op is coming
			// eventually and wait. We do this even if the local client doesn't have the blob payloadPending flag
			// enabled, in case a remote client does have it enabled. This wait may be infinite if the uploading
			// client failed the upload and doesn't exist anymore.
			// TODO: Fix this violation and remove the disable
			// eslint-disable-next-line require-atomic-updates
			storageId = await new Promise<string>((resolve) => {
				const onProcessBlobAttach = (_localId: string, _storageId: string): void => {
					if (_localId === localId) {
						this.internalEvents.off("processedBlobAttach", onProcessBlobAttach);
						resolve(_storageId);
					}
				};
				this.internalEvents.on("processedBlobAttach", onProcessBlobAttach);
			});
		}

		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{ eventName: "AttachmentReadBlob", id: storageId },
			async (event) => {
				return this.storage.readBlob(storageId).catch((error) => {
					if (this.runtime.disposed) {
						// If the runtime is disposed, this is not an error we care to track, it's expected behavior.
						event.cancel({ category: "generic" });
					}

					throw error;
				});
			},
			{ end: true, cancel: "error" },
		);
	}

	private getNonPayloadPendingBlobHandle(localId: string): BlobHandle {
		const localBlobRecord = this.localBlobCache.get(localId);
		assert(localBlobRecord !== undefined, 0x384 /* requesting handle for unknown blob */);

		return new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			// TODO: Here just get the blob from the localBlobCache rather than making a getBlob call?
			async () => this.getBlob(localId, false),
			false, // payloadPending
			() => {
				// We never remove an entry from the localBlobCache, so if our assert above passes
				// we can assume the get will find the most recent state in the cache.  Since we
				// only call this function in non-payloadPending cases, this should always be attached
				// but including this check here in case we call it in other cases in the future.
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				if (this.localBlobCache.get(localId)!.state !== "attached") {
					this.handleAttachedPendingBlobs.add(localId);
				}
			},
		);
	}

	private async createBlobDetached(
		blob: ArrayBufferLike,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		const localId = this.localIdGenerator();
		// There shouldn't really be any chance we need to query the localBlobCache before the
		// blob is "uploaded" to the MemoryBlobStorage, but including it here out of caution.
		this.localBlobCache.set(localId, { state: "uploading", blob } satisfies UploadingBlob);
		// Blobs created while the container is detached are stored in IDetachedBlobStorage.
		// The 'IContainerStorageService.createBlob()' call below will respond with a pseudo storage ID.
		// That pseudo storage ID will be replaced with the real storage ID at attach time.
		const { id: detachedStorageId } = await this.storage.createBlob(blob);
		// From the perspective of the BlobManager, the blob is fully attached. The actual
		// upload/attach process at container attach time is treated as opaque to this tracking.
		this.localBlobCache.set(localId, { state: "attached", blob } satisfies AttachedBlob);
		this.redirectTable.set(localId, detachedStorageId);
		return this.getNonPayloadPendingBlobHandle(localId);
	}

	public async createBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
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

		return this.createBlobPayloadPending
			? this.createBlobWithPayloadPending(blob)
			: this.createBlobLegacy(blob, signal);
	}

	private async createBlobLegacy(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		if (signal?.aborted === true) {
			throw this.createAbortError();
		}

		const localId = this.localIdGenerator();
		this.localBlobCache.set(localId, { state: "localOnly", blob } satisfies LocalOnlyBlob);
		// TODO:Pass abort signal?
		await this.uploadAndAttachLocalOnlyBlob(localId, blob);
		// TODO: Check abort signal again here?
		return this.getNonPayloadPendingBlobHandle(localId);
	}

	private createBlobWithPayloadPending(
		blob: ArrayBufferLike,
	): IFluidHandleInternalPayloadPending<ArrayBufferLike> {
		const localId = this.localIdGenerator();
		this.localBlobCache.set(localId, { state: "localOnly", blob } satisfies LocalOnlyBlob);

		const blobHandle = new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			async () => blob,
			true, // payloadPending
			() => {
				this.handleAttachedPendingBlobs.add(localId);
				const uploadP = this.uploadAndAttachLocalOnlyBlob(localId, blob);
				uploadP.then(blobHandle.notifyShared).catch((error) => {
					// TODO: notifyShared won't fail directly, but it emits an event to the customer.
					// Consider what to do if the customer's code throws. reportError is nice.
				});
				// TODO: Any further error handling?  E.g. does the BlobManager itself need to react?  Clean up the failed entry?
				uploadP.catch(blobHandle.notifyFailed);
			},
		);

		return blobHandle;
	}

	private async uploadAndAttachLocalOnlyBlob(
		localId: string,
		blob: ArrayBufferLike,
	): Promise<void> {
		// TODO: Assert localOnly here (but also need to permit the reupload due to TTL case?  Maybe reset the state to localOnly
		// when TTL expires.)
		// TODO: runWithRetry - seems we need to handle createBlob throwing as its fail mechanism
		// TODO: Also handle uploadFailed here
		this.localBlobCache.set(localId, { state: "uploading", blob } satisfies UploadingBlob);
		const createBlobResponse: ICreateBlobResponseWithTTL = await this.storage.createBlob(blob);
		this.localBlobCache.set(localId, {
			state: "uploaded",
			blob,
			storageId: createBlobResponse.id,
			uploadTime: Date.now(),
			minTTLInSeconds: createBlobResponse.minTTLInSeconds,
		} satisfies UploadedBlob);
		return this.attachUploadedBlob(localId);
	}

	private async attachUploadedBlob(localId: string): Promise<void> {
		const localBlobRecord = this.localBlobCache.get(localId);

		assert(
			localBlobRecord?.state === "uploaded",
			0x386 /* Must have pending blob entry for uploaded blob */,
		);
		this.localBlobCache.set(localId, {
			...localBlobRecord,
			state: "attaching",
		} satisfies AttachingBlob);

		// Send and await a blob attach op. This serves two purposes:
		// 1. If its a new blob, i.e., it isn't de-duped, the server will keep the blob alive if it sees this op
		//    until its storage ID is added to the next summary.
		// 2. It will create a local ID to storage ID mapping in all clients which is needed to retrieve the
		//    blob from the server via the storage ID.
		await new Promise<void>((resolve) => {
			const onProcessedBlobAttach = (_localId: string, _storageId: string): void => {
				if (_localId === localId) {
					this.internalEvents.off("processedBlobAttach", onProcessedBlobAttach);
					resolve();
				}
			};
			this.internalEvents.on("processedBlobAttach", onProcessedBlobAttach);
			this.sendBlobAttachOp(localId, localBlobRecord.storageId);
		});

		const attachedBlobRecord = {
			state: "attached",
			blob: localBlobRecord.blob,
		} satisfies AttachedBlob;
		this.localBlobCache.set(localId, attachedBlobRecord);
		// Note there may or may not be an entry in handleAttachedPendingBlobs for this localId,
		// in particular for the non-payloadPending case since we should be reaching this point
		// before even returning a handle to the caller.
		this.handleAttachedPendingBlobs.delete(localId);
	}

	/**
	 * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
	 * submitted to runtime while disconnected.
	 * @param metadata - op metadata containing storage and/or local IDs
	 */
	public reSubmit(metadata: Record<string, unknown> | undefined): void {
		assert(isBlobMetadata(metadata), 0xc01 /* Expected blob metadata for a BlobAttach op */);
		const { localId, blobId: remoteId } = metadata;
		// Any blob that we're actively trying to advance to attached state must be in attaching state.
		// Decline to resubmit for anything else.
		// For example, we might be asked to resubmit stashed ops for blobs that never had their handle
		// attached - these won't have a localBlobCache entry because we filter them out when generating
		// pending state. We shouldn't try to attach them since they won't be accessible to the customer
		// and would just be considered garbage immediately.
		// TODO: This needs to incorporate the TTL logic
		if (this.localBlobCache.get(localId)?.state === "attaching") {
			this.sendBlobAttachOp(localId, remoteId);
		}
	}

	public processBlobAttachMessage(message: ISequencedMessageEnvelope, local: boolean): void {
		assert(
			isBlobMetadata(message.metadata),
			0xc02 /* Expected blob metadata for a BlobAttach op */,
		);
		const { localId, blobId } = message.metadata;
		this.redirectTable.set(localId, blobId);
		this.internalEvents.emit("processedBlobAttach", localId, blobId);
	}

	public summarize(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		return summarizeBlobManagerState(this.redirectTable);
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
			// Don't report the identity mappings to GC - these exist to service old handles that referenced the storage
			// IDs directly. We'll implicitly clean them up if all of their localId references get GC'd first.
			if (localId !== storageId) {
				// The outbound routes are empty because a blob node cannot reference other nodes. It can only be referenced
				// by adding its handle to a referenced DDS.
				gcData.gcNodes[getGCNodePathFromLocalId(localId)] = [];
			}
		}
		return gcData;
	}

	/**
	 * Delete attachment blobs that are sweep ready.
	 * @param sweepReadyBlobRoutes - The routes of blobs that are sweep ready and should be deleted. These routes will
	 * be based off of local ids.
	 * @returns The routes of blobs that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyBlobRoutes: readonly string[]): readonly string[] {
		// maybeUnusedStorageIds is used to compute the set of storage IDs that *used to have a local ID*, but that
		// local ID is being deleted.
		const maybeUnusedStorageIds: Set<string> = new Set();
		for (const route of sweepReadyBlobRoutes) {
			const localId = getLocalIdFromGCNodePath(route);
			// If the blob hasn't already been deleted, log an error because this should never happen.
			// If the blob has already been deleted, log a telemetry event. This can happen because multiple GC
			// sweep ops can contain the same data store. It would be interesting to track how often this happens.
			const alreadyDeleted = this.isBlobDeleted(route);
			const storageId = this.redirectTable.get(localId);
			if (storageId === undefined) {
				this.mc.logger.sendTelemetryEvent({
					eventName: "DeletedAttachmentBlobNotFound",
					category: alreadyDeleted ? "generic" : "error",
					blobId: localId,
					details: { alreadyDeleted },
				});
				continue;
			}
			maybeUnusedStorageIds.add(storageId);
			this.redirectTable.delete(localId);
		}

		// Remove any storage IDs that still have local IDs referring to them (excluding the identity mapping).
		for (const [localId, storageId] of this.redirectTable) {
			if (localId !== storageId) {
				maybeUnusedStorageIds.delete(storageId);
			}
		}

		// Now delete any identity mappings (storage ID -> storage ID) from the redirect table that used to be
		// referenced by a distinct local ID. This way they'll be absent from the next summary, and the service
		// is free to delete them from storage.
		// WARNING: This can potentially delete identity mappings that are still referenced, if storage deduping
		// has let us add a local ID -> storage ID mapping that is later deleted.  AB#47337 tracks this issue
		// and possible solutions.
		for (const storageId of maybeUnusedStorageIds) {
			this.redirectTable.delete(storageId);
		}
		return [...sweepReadyBlobRoutes];
	}

	/**
	 * Verifies that the blob with given id is not deleted, i.e., it has not been garbage collected. If the blob is GC'd,
	 * log an error and throw if necessary.
	 */
	private verifyBlobNotDeleted(localId: string): void {
		if (!this.isBlobDeleted(getGCNodePathFromLocalId(localId))) {
			return;
		}

		const request = { url: localId };
		const error = responseToException(
			createResponseError(404, `Blob was deleted`, request),
			request,
		);
		// Only log deleted events. Tombstone events are logged by garbage collector.
		this.mc.logger.sendErrorEvent(
			{
				eventName: "GC_Deleted_Blob_Requested",
				pkg: blobManagerBasePath,
			},
			error,
		);
		throw error;
	}

	/**
	 * Called in detached state just prior to attaching, this will update the redirect table by
	 * converting the pseudo storage IDs into real storage IDs using the provided detachedStorageTable.
	 * The provided table must have exactly the same set of pseudo storage IDs as are found in the redirect table.
	 * @param detachedStorageTable - A map of pseudo storage IDs to real storage IDs.
	 */
	public readonly patchRedirectTable = (detachedStorageTable: Map<string, string>): void => {
		assert(
			this.runtime.attachState === AttachState.Detached,
			0x252 /* "redirect table can only be set in detached container" */,
		);
		// The values of the redirect table are the pseudo storage IDs, which are the keys of the
		// detachedStorageTable. We expect to have a many:1 mapping from local IDs to pseudo
		// storage IDs (many in the case that the storage dedupes the blob).
		assert(
			new Set(this.redirectTable.values()).size === detachedStorageTable.size,
			0x391 /* Redirect table size must match BlobManager's local ID count */,
		);
		// Taking a snapshot of the redirect table entries before iterating, because
		// we will be adding identity mappings to the the redirect table as we iterate
		// and we don't want to include those in the iteration.
		const redirectTableEntries = [...this.redirectTable.entries()];
		for (const [localId, detachedStorageId] of redirectTableEntries) {
			const newStorageId = detachedStorageTable.get(detachedStorageId);
			assert(newStorageId !== undefined, 0xc53 /* Couldn't find a matching storage ID */);
			this.redirectTable.set(localId, newStorageId);
			// set identity (id -> id) entry
			this.redirectTable.set(newStorageId, newStorageId);
		}
	};

	/**
	 * To be used in getPendingLocalState flow. Get a serializable record of the blobs that are
	 * pending upload and/or their BlobAttach op, which can be given to a new BlobManager to
	 * resume work.
	 *
	 * @privateRemarks
	 * For now, we don't track any pending blobs since the getPendingBlobs flow doesn't enable
	 * restoring to a state where an accessible handle has been stored by the customer (and we'll
	 * just drop any BlobAttach ops on the ground during reSubmit). However, once we add support
	 * for payload-pending handles, this will return the blobs associated with those handles.
	 */
	public getPendingBlobs(): IPendingBlobs | undefined {
		return undefined;
	}

	/**
	 * Part of container serialization when imminent closure is enabled (Currently when calling closeAndGetPendingLocalState).
	 * This asynchronous function resolves all pending createBlob calls and waits for each blob
	 * to be attached. It will also send BlobAttach ops for each pending blob that hasn't sent it
	 * yet so that serialized container can resubmit them when rehydrated.
	 *
	 * @param stopBlobAttachingSignal - Optional signal to abort the blob attaching process.
	 * @returns - A promise that resolves with the details of the attached blobs,
	 * or undefined if no blobs were processed.
	 */
	public async attachAndGetPendingBlobs(
		stopBlobAttachingSignal?: AbortSignal,
	): Promise<IPendingBlobs | undefined> {
		throw new UsageError("attachAndGetPendingBlobs is no longer supported");
	}
}

/**
 * For a localId, returns its path in GC's graph. The node path is of the format `/<blobManagerBasePath>/<localId>`.
 * This path must match the path of the blob handle returned by the createBlob API because blobs are marked
 * referenced by storing these handles in a referenced DDS.
 */
export const getGCNodePathFromLocalId = (localId: string): string =>
	`/${blobManagerBasePath}/${localId}`;

/**
 * For a given GC node path, return the localId. The node path is of the format `/<basePath>/<localId>`.
 */
const getLocalIdFromGCNodePath = (nodePath: string): string => {
	const pathParts = nodePath.split("/");
	assert(areBlobPathParts(pathParts), 0x5bd /* Invalid blob node path */);
	return pathParts[2];
};

/**
 * Returns whether a given path is for attachment blobs that are in the format - "/blobManagerBasePath/...".
 */
export const isBlobPath = (path: string): path is `/${typeof blobManagerBasePath}/${string}` =>
	areBlobPathParts(path.split("/"));

const areBlobPathParts = (
	pathParts: string[],
): pathParts is ["", typeof blobManagerBasePath, string] =>
	pathParts.length === 3 && pathParts[1] === blobManagerBasePath;
