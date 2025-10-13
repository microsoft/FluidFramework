/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, createEmitter, stringToBuffer } from "@fluid-internal/client-utils";
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

// Restrict the IContainerRuntime interface to the subset required by BlobManager. This helps to make
// the contract explicit and reduces the amount of mocking required for tests.
export type IBlobManagerRuntime = Pick<
	IContainerRuntime,
	"attachState" | "baseLogger" | "disposed"
> &
	IEventProvider<IContainerRuntimeEvents>;

export type ICreateBlobResponseWithTTL = ICreateBlobResponse &
	Partial<Record<"minTTLInSeconds", number>>;

/**
 * A blob tracked by BlobManager that is only available on the local client. It is not currently
 * attempting an upload.
 */
interface LocalOnlyBlob {
	state: "localOnly";
	blob: ArrayBufferLike;
}

/**
 * A blob tracked by BlobManager that is only known to be available on the local client, but is in
 * the process of being uploaded to storage.
 */
interface UploadingBlob {
	state: "uploading";
	blob: ArrayBufferLike;
}

/**
 * A blob tracked by BlobManager that has been uploaded to storage. If the TTL has not expired, it
 * should still be available in storage. It is not currently attempting to send a BlobAttach op.
 */
interface UploadedBlob {
	state: "uploaded";
	blob: ArrayBufferLike;
	storageId: string;
	uploadTime: number;
	minTTLInSeconds: number | undefined;
}

/**
 * A blob tracked by BlobManager that has been uploaded to storage and is in the process of sending
 * a BlobAttach op and waiting for the ack.
 */
interface AttachingBlob {
	state: "attaching";
	blob: ArrayBufferLike;
	storageId: string;
	uploadTime: number;
	minTTLInSeconds: number | undefined;
}

/**
 * A blob tracked by BlobManager that has been uploaded to storage and its BlobAttach op has been
 * ack'd. It is fully shared and available to all clients, and is no longer considered pending.
 */
interface AttachedBlob {
	state: "attached";
	blob: ArrayBufferLike;
}

/**
 * Blobs that were created locally are tracked, and may be in one of these states. When first
 * created, they are in localOnly state. The process of sharing has two steps, blob upload and
 * sending a BlobAttach op. Progress through the stages may regress back to localOnly if we
 * determine the storage may have deleted the blob before we could finish attaching it.
 */
type LocalBlobRecord =
	| LocalOnlyBlob
	| UploadingBlob
	| UploadedBlob
	| AttachingBlob
	| AttachedBlob;

/**
 * Serializable form of the LocalBlobRecord that can be used to save and restore pending state.
 * Omits attached blobs since they are fully uploaded and don't need to be saved and restored.
 * Omits uploading and attaching states since upon restore we will need to restart those processes.
 */
type SerializableLocalBlobRecord =
	| (Omit<LocalOnlyBlob, "blob"> & { blob: string })
	| (Omit<UploadedBlob, "blob"> & { blob: string });

export interface IPendingBlobs {
	[localId: string]: SerializableLocalBlobRecord;
}

/**
 * Check if for a given uploaded or attaching blob, the TTL is too close to expiry to safely attempt
 * an attach. Currently using a heuristic of half the TTL duration having passed since upload.
 */
const isTTLTooCloseToExpiry = (blobRecord: UploadedBlob | AttachingBlob): boolean =>
	blobRecord.minTTLInSeconds !== undefined &&
	Date.now() - blobRecord.uploadTime > (blobRecord.minTTLInSeconds / 2) * 1000;

interface IBlobManagerInternalEvents {
	blobExpired: (localId: string) => void;
	handleAttached: (pending: LocalBlobRecord) => void;
	processedBlobAttach: (localId: string, storageId: string) => void;
}

const createAbortError = (): LoggingError => new LoggingError("uploadBlob aborted");

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

	/**
	 * The localBlobCache has a dual role of caching locally-created blobs, as well as tracking their state as they
	 * are shared. Keys are localIds.
	 */
	private readonly localBlobCache: Map<string, LocalBlobRecord> = new Map();
	/**
	 * Blobs with an attached handle that have not finished blob-attaching are the set we need to provide from
	 * getPendingState().  This stores their local IDs, and then we can look them up against the localBlobCache.
	 */
	private readonly pendingBlobsWithAttachedHandles: Set<string> = new Set();
	/**
	 * Local IDs for any pending blobs we loaded with and have not yet started the upload/attach flow for.
	 */
	private readonly pendingOnlyLocalIds: Set<string> = new Set();

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
		pendingBlobs: IPendingBlobs | undefined;
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
			pendingBlobs,
			localIdGenerator,
			createBlobPayloadPending,
		} = props;
		this.routeContext = routeContext;
		this.storage = storage;
		this.sendBlobAttachOp = sendBlobAttachOp;
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

		// We populate the localBlobCache with any pending blobs we are provided, which makes them available
		// to access even though they are not shared yet. However, we don't start the share flow until it is
		// explicitly invoked via sharePendingBlobs() in case we are loaded in a frozen container.
		if (pendingBlobs !== undefined) {
			for (const [localId, serializableBlobRecord] of Object.entries(pendingBlobs)) {
				assert(
					!this.redirectTable.has(localId),
					0xc7e /* Pending blob already in redirect table */,
				);
				const localBlobRecord = {
					...serializableBlobRecord,
					blob: stringToBuffer(serializableBlobRecord.blob, "base64"),
				};
				this.localBlobCache.set(localId, localBlobRecord);
				// Since we received these blobs from pending state, we'll assume they were only added to the
				// pending state at generation time because their handles were attached. We add them back here
				// in case we need to round-trip them back out again due to another getPendingBlobs() call.
				this.pendingBlobsWithAttachedHandles.add(localId);
				this.pendingOnlyLocalIds.add(localId);
			}
		}
	}

	/**
	 * Returns whether a blob with the given localId can be retrieved by the BlobManager via getBlob().
	 */
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
		assert(localBlobRecord.state === "attached", 0xc7f /* Expected blob to be attached */);

		return new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			async () => this.getBlob(localId, false),
			false, // payloadPending
		);
	}

	public async createBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		if (this.runtime.attachState === AttachState.Detached) {
			return this.createBlobDetached(blob, signal);
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
			? this.createBlobWithPayloadPending(blob, signal)
			: this.createBlobLegacy(blob, signal);
	}

	private async createBlobDetached(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		if (signal?.aborted === true) {
			throw createAbortError();
		}
		const localId = this.localIdGenerator();
		this.localBlobCache.set(localId, { state: "uploading", blob });
		// Blobs created while the container is detached are stored in IDetachedBlobStorage.
		// The 'IContainerStorageService.createBlob()' call below will respond with a pseudo storage ID.
		// That pseudo storage ID will be replaced with the real storage ID at attach time.
		const { id: detachedStorageId } = await this.storage.createBlob(blob);
		// From the perspective of the BlobManager, the blob is now fully attached. The actual
		// upload/attach process at container attach time is treated as opaque to this tracking.
		this.localBlobCache.set(localId, { state: "attached", blob });
		this.redirectTable.set(localId, detachedStorageId);
		return this.getNonPayloadPendingBlobHandle(localId);
	}

	private async createBlobLegacy(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		const localId = this.localIdGenerator();
		this.localBlobCache.set(localId, { state: "localOnly", blob });
		await this.uploadAndAttach(localId, signal);
		return this.getNonPayloadPendingBlobHandle(localId);
	}

	private createBlobWithPayloadPending(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): IFluidHandleInternalPayloadPending<ArrayBufferLike> {
		const localId = this.localIdGenerator();
		this.localBlobCache.set(localId, { state: "localOnly", blob });

		const blobHandle = new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			async () => blob,
			true, // payloadPending
			() => {
				this.pendingBlobsWithAttachedHandles.add(localId);
				const uploadAndAttachP = this.uploadAndAttach(localId, signal);
				uploadAndAttachP.then(blobHandle.notifyShared).catch((error) => {
					// TODO: notifyShared won't fail directly, but it emits an event to the customer.
					// Consider what to do if the customer's code throws. reportError is nice.
				});
				uploadAndAttachP.catch(blobHandle.notifyFailed);
			},
		);

		return blobHandle;
	}

	/**
	 * Upload and attach the localBlobCache entry for the given localId.
	 *
	 * Expects the localBlobCache entry for the given localId to be in either localOnly or uploaded state
	 * when called. Returns a promise that resolves when the blob completes uploading and attaching, or else
	 * rejects if an error is encountered or the signal is aborted.
	 */
	private readonly uploadAndAttach = async (
		localId: string,
		signal?: AbortSignal,
	): Promise<void> => {
		if (signal?.aborted === true) {
			this.localBlobCache.delete(localId);
			this.pendingBlobsWithAttachedHandles.delete(localId);
			throw createAbortError();
		}
		const localBlobRecordInitial = this.localBlobCache.get(localId);
		assert(
			localBlobRecordInitial?.state === "localOnly" ||
				localBlobRecordInitial?.state === "uploaded",
			0xc80 /* Expect uploadAndAttach to be called with either localOnly or uploaded state */,
		);
		const { blob } = localBlobRecordInitial;

		/**
		 * Expects the localBlobCache entry for the given localId to be in either localOnly or uploaded state
		 * when called. Returns a promise that resolves when the blob is in uploaded or attached state, or else
		 * rejects on error during upload or if the signal is aborted.
		 *
		 * Most of the time this should be expected to exit in uploaded state, but if we are loading from pending
		 * state we may see an attach op from the client that generated the pending state, which can complete the
		 * attach while the upload is outstanding.
		 */
		const ensureUploaded = async (): Promise<void> => {
			const localBlobRecord = this.localBlobCache.get(localId);
			if (localBlobRecord?.state === "uploaded") {
				// In normal creation flows, the blob will be in localOnly state here. But in the case of loading
				// with pending state we can call it with an uploaded-but-not-attached blob. Start the upload
				// flow only if it's localOnly.
				return;
			}
			assert(
				localBlobRecord?.state === "localOnly",
				0xc81 /* Attempting to upload from unexpected state */,
			);

			this.localBlobCache.set(localId, { state: "uploading", blob });
			await new Promise<void>((resolve, reject) => {
				// If we eventually have driver-level support for abort, then this can simplify a bit as we won't
				// need to track upload completion and abort separately. Until then, we need to handle the case that
				// the upload continues and settles after becoming irrelevant due to signal abort or blob attach.
				let uploadHasBecomeIrrelevant = false;
				const onSignalAbort = (): void => {
					removeListeners();
					uploadHasBecomeIrrelevant = true;
					this.localBlobCache.delete(localId);
					this.pendingBlobsWithAttachedHandles.delete(localId);
					reject(createAbortError());
				};
				const onProcessedBlobAttach = (_localId: string, _storageId: string): void => {
					if (_localId === localId) {
						removeListeners();
						uploadHasBecomeIrrelevant = true;
						resolve();
					}
				};
				const removeListeners = (): void => {
					this.internalEvents.off("processedBlobAttach", onProcessedBlobAttach);
					signal?.removeEventListener("abort", onSignalAbort);
				};
				this.internalEvents.on("processedBlobAttach", onProcessedBlobAttach);
				signal?.addEventListener("abort", onSignalAbort);

				this.storage
					.createBlob(blob)
					.then((createBlobResponse: ICreateBlobResponseWithTTL) => {
						if (!uploadHasBecomeIrrelevant) {
							removeListeners();
							this.localBlobCache.set(localId, {
								state: "uploaded",
								blob,
								storageId: createBlobResponse.id,
								uploadTime: Date.now(),
								minTTLInSeconds: createBlobResponse.minTTLInSeconds,
							});
							resolve();
						}
					})
					.catch((error) => {
						if (!uploadHasBecomeIrrelevant) {
							removeListeners();
							// If the storage call errors, we can't recover. Reject to throw back to the caller.
							this.localBlobCache.delete(localId);
							this.pendingBlobsWithAttachedHandles.delete(localId);
							reject(error);
						}
					});
			});
		};

		/**
		 * Expects the localBlobCache entry for the given localId to be in uploaded or attached state when called.
		 * Returns a promise that resolves to true if the blob is successfully attached, or false if it cannot be
		 * attached and the upload flow needs to be restarted from the top (currently only if the TTL expires before
		 * attach can be completed). In the latter case, the localBlobRecord will also be reset to localOnly state.
		 * The promise rejects if the signal is aborted.
		 */
		const tryAttach = async (): Promise<boolean> => {
			const localBlobRecord = this.localBlobCache.get(localId);
			if (localBlobRecord?.state === "attached") {
				// In normal creation flows, the blob will be in uploaded state here. But if we are loading from pending
				// state and see an attach op from the client that generated the pending state, we may have reached
				// attached state in the middle of the upload attempt. In that case there's no more work to do and we
				// can just return.
				return true;
			}
			assert(
				localBlobRecord?.state === "uploaded",
				0xc82 /* Attempting to attach from unexpected state */,
			);

			// If we just uploaded the blob TTL really shouldn't be expired at this location. But if we loaded from
			// pending state, the upload may have happened some time far in the past and could be expired here.
			if (isTTLTooCloseToExpiry(localBlobRecord)) {
				// If the TTL is expired, we assume it's gone from the storage and so is effectively localOnly again.
				// Then when we re-enter the loop, we'll re-upload it.
				this.localBlobCache.set(localId, { state: "localOnly", blob });
				// Emitting here isn't really necessary since the only listener would be attached below. Including here
				// for completeness though, in case we add other listeners in the future.
				this.internalEvents.emit("blobExpired", localId);
				return false;
			} else {
				this.localBlobCache.set(localId, {
					...localBlobRecord,
					state: "attaching",
				});

				// Send and await a blob attach op. This serves two purposes:
				// 1. If its a new blob, i.e., it isn't de-duped, the server will keep the blob alive if it sees this op
				//    until its storage ID is added to the next summary.
				// 2. It will create a local ID to storage ID mapping in all clients which is needed to retrieve the
				//    blob from the server via the storage ID.
				return new Promise<boolean>((resolve, reject) => {
					const onProcessedBlobAttach = (_localId: string, _storageId: string): void => {
						if (_localId === localId) {
							removeListeners();
							resolve(true);
						}
					};
					// Although we already checked for TTL expiry above, the op we're about to send may later be asked
					// to resubmit. Before we resubmit, we check again for TTL expiry - this listener is how we learn if
					// we discovered expiry in the resubmit flow.
					const onBlobExpired = (_localId: string): void => {
						if (_localId === localId) {
							removeListeners();
							resolve(false);
						}
					};
					const onSignalAbort = (): void => {
						removeListeners();
						this.localBlobCache.delete(localId);
						this.pendingBlobsWithAttachedHandles.delete(localId);
						reject(createAbortError());
					};
					const removeListeners = (): void => {
						this.internalEvents.off("processedBlobAttach", onProcessedBlobAttach);
						this.internalEvents.off("blobExpired", onBlobExpired);
						signal?.removeEventListener("abort", onSignalAbort);
					};

					this.internalEvents.on("processedBlobAttach", onProcessedBlobAttach);
					this.internalEvents.on("blobExpired", onBlobExpired);
					signal?.addEventListener("abort", onSignalAbort);
					this.sendBlobAttachOp(localId, localBlobRecord.storageId);
				});
			}
		};

		let attachCompleted = false;
		while (!attachCompleted) {
			await ensureUploaded();
			attachCompleted = await tryAttach();

			// If something stopped the attach from completing successfully (currently just TTL expiry),
			// we expect that the blob was already updated to reflect the updated state (i.e. back to localOnly)
			// and we'll try the loop again from the top.
		}
		// When the blob successfully attaches, the localBlobRecord will have been updated to attached state
		// at the time we processed the op, so there's nothing else to do here.
	};

	/**
	 * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
	 * submitted to runtime while disconnected.
	 * @param metadata - op metadata containing storage and/or local IDs
	 */
	public reSubmit(metadata: Record<string, unknown> | undefined): void {
		assert(isBlobMetadata(metadata), 0xc01 /* Expected blob metadata for a BlobAttach op */);
		const { localId, blobId: storageId } = metadata;
		// Any blob that we're actively trying to advance to attached state must be in attaching state.
		// Decline to resubmit for anything else.
		// For example, we might be asked to resubmit stashed ops for blobs that never had their handle
		// attached - these won't have a localBlobCache entry because we filter them out when generating
		// pending state. We shouldn't try to attach them since they won't be accessible to the customer
		// and would just be considered garbage immediately.
		// TODO: Is it possible that we'd be asked to resubmit for a pending blob before we call sharePendingBlobs?
		const localBlobRecord = this.localBlobCache.get(localId);
		if (localBlobRecord?.state === "attaching") {
			// If the TTL is expired, we assume it's gone from the storage and so is effectively localOnly again.
			if (isTTLTooCloseToExpiry(localBlobRecord)) {
				this.localBlobCache.set(localId, { state: "localOnly", blob: localBlobRecord.blob });
				this.internalEvents.emit("blobExpired", localId);
			} else {
				this.sendBlobAttachOp(localId, storageId);
			}
		}
	}

	public processBlobAttachMessage(message: ISequencedMessageEnvelope, local: boolean): void {
		assert(
			isBlobMetadata(message.metadata),
			0xc02 /* Expected blob metadata for a BlobAttach op */,
		);
		const { localId, blobId: storageId } = message.metadata;
		const maybeLocalBlobRecord = this.localBlobCache.get(localId);
		if (maybeLocalBlobRecord !== undefined) {
			const attachedBlobRecord: AttachedBlob = {
				state: "attached",
				blob: maybeLocalBlobRecord.blob,
			};
			// Processing a blob attach op is authoritative and may stomp on any existing state. Other
			// callsites that update localBlobCache entries must take proper caution to handle the case
			// that a blob attach op is processed concurrently.
			this.localBlobCache.set(localId, attachedBlobRecord);
			// Note there may or may not be an entry in pendingBlobsWithAttachedHandles for this localId,
			// in particular for the non-payloadPending case since we should be reaching this point
			// before even returning a handle to the caller.
			this.pendingBlobsWithAttachedHandles.delete(localId);
			this.pendingOnlyLocalIds.delete(localId);
		}
		this.redirectTable.set(localId, storageId);
		// set identity (id -> id) entry
		this.redirectTable.set(storageId, storageId);
		this.internalEvents.emit("processedBlobAttach", localId, storageId);
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
	 * Delete blobs with the given routes from the redirect table.
	 * @returns The routes of blobs that were deleted.
	 *
	 * @remarks
	 * The routes are GC nodes paths of format -`/<blobManagerBasePath>/<localId>`.
	 * Deleting the blobs involves 2 steps:
	 *
	 * 1. The redirect table entry for the local ids are deleted.
	 *
	 * 2. If the storage ids corresponding to the deleted local ids are not referenced by any further local ids, the
	 * identity mappings in the redirect table are deleted as well.
	 *
	 * Note that this does not delete the blobs from storage service immediately. Deleting the blobs from redirect table
	 * will ensure we don't create an attachment blob for them at the next summary. The service would then delete them
	 * some time in the future.
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
	 * Upload and attach any pending blobs that the BlobManager was loaded with that have not already
	 * been attached in the meantime.
	 * @returns A promise that resolves when all the uploads and attaches have completed, or rejects
	 * if any of them fail.
	 */
	public readonly sharePendingBlobs = async (): Promise<void> => {
		const localIdsToUpload = [...this.pendingOnlyLocalIds];
		this.pendingOnlyLocalIds.clear();
		// TODO: Determine if Promise.all is ergonomic at the callsite. Would Promise.allSettled be better?
		await Promise.all<void>(
			localIdsToUpload.map(async (localId) => this.uploadAndAttach(localId)),
		);
	};

	/**
	 * To be used in getPendingLocalState flow. Get a serializable record of the blobs that are
	 * pending upload and/or their BlobAttach op, which can be given to a new BlobManager to
	 * resume work.
	 */
	public getPendingBlobs(): IPendingBlobs | undefined {
		const pendingBlobs: IPendingBlobs = {};
		for (const localId of this.pendingBlobsWithAttachedHandles) {
			const localBlobRecord = this.localBlobCache.get(localId);
			assert(localBlobRecord !== undefined, 0xc83 /* Pending blob must be in local cache */);
			assert(
				localBlobRecord.state !== "attached",
				0xc84 /* Pending blob must not be in attached state */,
			);
			// We downgrade uploading blobs to localOnly, and attaching blobs to uploaded. In the case of
			// uploading blobs, we don't have a way to retrieve the eventual storageId so the upload will
			// need to be restarted anyway. In the case of attaching blobs, we can't know whether the
			// BlobAttach op will eventually be ack'd. So we assume we'll need to send another op, but also
			// remain prepared to handle seeing the ack of the original op after loading from pending state.
			pendingBlobs[localId] =
				localBlobRecord.state === "localOnly" || localBlobRecord.state === "uploading"
					? {
							state: "localOnly",
							blob: bufferToString(localBlobRecord.blob, "base64"),
						}
					: {
							...localBlobRecord,
							state: "uploaded",
							blob: bufferToString(localBlobRecord.blob, "base64"),
						};
		}
		return Object.keys(pendingBlobs).length > 0 ? pendingBlobs : undefined;
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
