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
import { assert, Deferred } from "@fluidframework/core-utils/internal";
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
	getStorageIds,
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

	private _state: PayloadState = "pending";
	public get payloadState(): PayloadState {
		return this._state;
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
		public get: () => Promise<ArrayBufferLike>,
		public readonly payloadPending: boolean,
		private readonly onAttachGraph?: () => void,
	) {
		super();
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	public readonly notifyShared = (): void => {
		this._state = "shared";
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
	"attachState" | "connected" | "baseLogger" | "clientDetails" | "disposed"
> &
	IEventProvider<IContainerRuntimeEvents>;

type ICreateBlobResponseWithTTL = ICreateBlobResponse &
	Partial<Record<"minTTLInSeconds", number>>;

interface PendingBlob {
	blob: ArrayBufferLike;
	opsent?: boolean;
	storageId?: string;
	handleP: Deferred<BlobHandle>;
	uploadP?: Promise<void>;
	uploadTime?: number;
	minTTLInSeconds?: number;
	attached?: boolean;
	acked?: boolean;
	abortSignal?: AbortSignal;
}

export interface IPendingBlobs {
	[localId: string]: {
		blob: string;
		storageId?: string;
		uploadTime?: number;
		minTTLInSeconds?: number;
		acked?: boolean;
	};
}

export interface IBlobManagerEvents {
	noPendingBlobs: () => void;
}

interface IBlobManagerInternalEvents {
	uploadFailed: (localId: string, error: unknown) => void;
	handleAttached: (pending: PendingBlob) => void;
	processedBlobAttach: (localId: string, storageId: string) => void;
}

export const blobManagerBasePath = "_blobs" as const;

export class BlobManager {
	private readonly mc: MonitoringContext;

	private readonly publicEvents = createEmitter<IBlobManagerEvents>();
	public get events(): Listenable<IBlobManagerEvents> {
		return this.publicEvents;
	}
	private readonly internalEvents = createEmitter<IBlobManagerInternalEvents>();

	/**
	 * Map of local IDs to storage IDs. Also includes identity mappings of storage ID to storage ID for all known
	 * storage IDs. All requested IDs must be a key in this map. Blobs created while the container is detached are
	 * stored in IDetachedBlobStorage which gives pseudo storage IDs; the real storage IDs are filled in at attach
	 * time via setRedirectTable().
	 */
	private readonly redirectTable: Map<string, string>;

	/**
	 * Blobs which we have not yet seen a BlobAttach op round-trip and not yet attached to a DDS.
	 */
	private readonly pendingBlobs: Map<string, PendingBlob> = new Map();

	/**
	 * Track ops in flight for online flow. This is used for optimizations where if we receive an ack for a storage ID,
	 * we can resolve all pending blobs with the same storage ID even though they may have different local IDs. That's
	 * because we know that the server will not delete the blob corresponding to that storage ID.
	 */
	private readonly opsInFlight: Map<string, Set<string>> = new Map();

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

		this.sendBlobAttachOp = (localId: string, storageId: string) => {
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
					// reupload blob and reset previous fields
					this.pendingBlobs.set(localId, {
						...pendingEntry,
						storageId: undefined,
						uploadTime: undefined,
						minTTLInSeconds: undefined,
						opsent: false,
						uploadP: this.uploadBlob(localId, pendingEntry.blob),
					});
					return;
				}
			}
			pendingEntry.opsent = true;
			sendBlobAttachOp(localId, storageId);
		};
	}

	public get allBlobsAttached(): boolean {
		for (const entry of this.pendingBlobs.values()) {
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

	private createAbortError(pending?: PendingBlob): LoggingError {
		return new LoggingError("uploadBlob aborted", {
			acked: pending?.acked,
			uploadTime: pending?.uploadTime,
		});
	}

	public hasBlob(localId: string): boolean {
		return this.redirectTable.get(localId) !== undefined;
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

		const pending = this.pendingBlobs.get(localId);
		if (pending) {
			return pending.blob;
		}

		let storageId = this.redirectTable.get(localId);
		if (storageId === undefined) {
			// Only blob handles explicitly marked with pending payload are permitted to exist without
			// yet knowing their storage id. Otherwise they must already be associated with a storage id.
			// Handles for detached blobs are not payload pending.
			assert(payloadPending, 0x11f /* "requesting unknown blobs" */);
			// If we didn't find it in the redirectTable and it's payloadPending, assume the attach op is coming
			// eventually and wait. We do this even if the local client doesn't have the blob payloadPending flag
			// enabled, in case a remote client does have it enabled. This wait may be infinite if the uploading
			// client failed the upload and doesn't exist anymore.
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

	private getBlobHandle(localId: string): BlobHandle {
		assert(
			this.redirectTable.has(localId) || this.pendingBlobs.has(localId),
			0x384 /* requesting handle for unknown blob */,
		);
		const pending = this.pendingBlobs.get(localId);
		// Create a callback function for once the handle has been attached
		const callback = pending
			? () => {
					pending.attached = true;
					// Notify listeners (e.g. serialization process) that handle has been attached
					this.internalEvents.emit("handleAttached", pending);
					this.deletePendingBlobMaybe(localId);
				}
			: undefined;
		return new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			async () => this.getBlob(localId, false),
			false, // payloadPending
			callback,
		);
	}

	private async createBlobDetached(
		blob: ArrayBufferLike,
	): Promise<IFluidHandleInternalPayloadPending<ArrayBufferLike>> {
		const localId = this.localIdGenerator();
		// Blobs created while the container is detached are stored in IDetachedBlobStorage.
		// The 'IContainerStorageService.createBlob()' call below will respond with a pseudo storage ID.
		// That pseudo storage ID will be replaced with the real storage ID at attach time.
		const { id: detachedStorageId } = await this.storage.createBlob(blob);
		this.setRedirection(localId, detachedStorageId);
		return this.getBlobHandle(localId);
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
		if (signal?.aborted) {
			throw this.createAbortError();
		}

		// Create a local ID for the blob. After uploading it to storage and before returning it, a local ID to
		// storage ID mapping is created.
		const localId = this.localIdGenerator();
		const pendingEntry: PendingBlob = {
			blob,
			handleP: new Deferred(),
			uploadP: this.uploadBlob(localId, blob),
			attached: false,
			acked: false,
			abortSignal: signal,
			opsent: false,
		};
		this.pendingBlobs.set(localId, pendingEntry);

		const abortListener = (): void => {
			if (!pendingEntry.acked) {
				pendingEntry.handleP.reject(this.createAbortError(pendingEntry));
			}
		};
		signal?.addEventListener("abort", abortListener, { once: true });

		return pendingEntry.handleP.promise.finally(() => {
			signal?.removeEventListener("abort", abortListener);
		});
	}

	private createBlobWithPayloadPending(
		blob: ArrayBufferLike,
	): IFluidHandleInternalPayloadPending<ArrayBufferLike> {
		const localId = this.localIdGenerator();

		const blobHandle = new BlobHandle(
			getGCNodePathFromLocalId(localId),
			this.routeContext,
			async () => blob,
			true, // payloadPending
			() => {
				const pendingEntry: PendingBlob = {
					blob,
					handleP: new Deferred(),
					uploadP: this.uploadBlob(localId, blob),
					attached: true,
					acked: false,
					opsent: false,
				};
				this.pendingBlobs.set(localId, pendingEntry);
			},
		);

		const onProcessedBlobAttach = (_localId: string, _storageId: string): void => {
			if (_localId === localId) {
				this.internalEvents.off("processedBlobAttach", onProcessedBlobAttach);
				blobHandle.notifyShared();
			}
		};
		this.internalEvents.on("processedBlobAttach", onProcessedBlobAttach);

		const onUploadFailed = (_localId: string, error: unknown): void => {
			if (_localId === localId) {
				this.internalEvents.off("uploadFailed", onUploadFailed);
				blobHandle.notifyFailed(error);
			}
		};
		this.internalEvents.on("uploadFailed", onUploadFailed);

		return blobHandle;
	}

	/**
	 * Upload a blob to the storage service.
	 * @returns A promise that resolves when the upload is complete and a blob attach op has been sent (but not ack'd).
	 *
	 * @privateRemarks This method must not reject, as there is no error handling for it in current tracking.
	 */
	private async uploadBlob(localId: string, blob: ArrayBufferLike): Promise<void> {
		let response: ICreateBlobResponseWithTTL;
		try {
			response = await this.storage.createBlob(blob);
		} catch (error) {
			const entry = this.pendingBlobs.get(localId);
			this.mc.logger.sendTelemetryEvent({
				eventName: "UploadBlobReject",
				// TODO: better typing
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
				error: error as any,
				message: entry === undefined ? "Missing pendingBlob" : undefined,
				localId,
			});
			// We probably should assert the pendingBlobs entry here, but we don't currently have any error handling
			// for the uploadP - a promise rejection would be unhandled anyway. For now we can detect this with the
			// message on the UploadBlobReject telemetry.
			if (entry !== undefined) {
				entry.handleP.reject(error);
				this.deletePendingBlob(localId);
			}
			this.internalEvents.emit("uploadFailed", localId, error);
			return;
		}

		try {
			this.onUploadResolve(localId, response);
		} catch (error) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "OnUploadResolveError",
				// TODO: better typing
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
				error: error as any,
				localId,
			});
		}
	}

	/**
	 * Set up a mapping in the redirect table from fromId to toId. Also, notify the runtime that a reference is added
	 * which is required for GC.
	 */
	private setRedirection(fromId: string, toId: string): void {
		this.redirectTable.set(fromId, toId);
	}

	private deletePendingBlobMaybe(localId: string): void {
		if (this.pendingBlobs.has(localId)) {
			const entry = this.pendingBlobs.get(localId);
			if (entry?.attached && entry?.acked) {
				this.deletePendingBlob(localId);
			}
		}
	}

	private deletePendingBlob(id: string): void {
		if (this.pendingBlobs.delete(id) && !this.hasPendingBlobs) {
			this.publicEvents.emit("noPendingBlobs");
		}
	}

	private onUploadResolve(
		localId: string,
		response: ICreateBlobResponseWithTTL,
	): ICreateBlobResponseWithTTL | undefined {
		const entry = this.pendingBlobs.get(localId);

		assert(entry !== undefined, 0x6c8 /* pending blob entry not found for uploaded blob */);
		if (entry.abortSignal?.aborted === true && !entry.opsent) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "BlobAborted",
				localId,
			});
			this.deletePendingBlob(localId);
			return;
		}
		assert(
			entry.storageId === undefined,
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
		const storageIds = getStorageIds(this.redirectTable);
		if (storageIds.has(response.id)) {
			// The blob is de-duped. Set up a local ID to storage ID mapping and return the blob. Since this is
			// an existing blob, we don't have to wait for the op to be ack'd since this step has already
			// happened before and so, the server won't delete it.
			this.setRedirection(localId, response.id);
			const blobHandle = this.getBlobHandle(localId);
			blobHandle.notifyShared();
			entry.handleP.resolve(blobHandle);
			this.deletePendingBlobMaybe(localId);
		} else {
			// If there is already an op for this storage ID, append the local ID to the list. Once any op for
			// this storage ID is ack'd, all pending blobs for it can be resolved since the op will keep the
			// blob alive in storage.
			let setForRemoteId = this.opsInFlight.get(response.id);
			if (setForRemoteId === undefined) {
				setForRemoteId = new Set();
				this.opsInFlight.set(response.id, setForRemoteId);
			}
			// seeing the same localId twice can happen if a blob is being reuploaded and stashed.
			// TODO: review stashing logic and see if we can avoid this, as well in tests.
			setForRemoteId.add(localId);
		}
		return response;
	}

	/**
	 * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
	 * submitted to runtime while disconnected.
	 * @param metadata - op metadata containing storage and/or local IDs
	 */
	public reSubmit(metadata: Record<string, unknown> | undefined): void {
		assert(isBlobMetadata(metadata), 0xc01 /* Expected blob metadata for a BlobAttach op */);
		const { localId, blobId: storageId } = metadata;
		// Any blob that we're actively trying to advance to attached state must have a
		// pendingBlobs entry. Decline to resubmit for anything else.
		// For example, we might be asked to resubmit stashed ops for blobs that never had
		// their handle attached - these won't have a pendingBlobs entry and we shouldn't
		// try to attach them since they won't be accessible to the customer and would just
		// be considered garbage immediately.
		if (this.pendingBlobs.has(localId)) {
			this.sendBlobAttachOp(localId, storageId);
		}
	}

	public processBlobAttachMessage(message: ISequencedMessageEnvelope, local: boolean): void {
		assert(
			isBlobMetadata(message.metadata),
			0xc02 /* Expected blob metadata for a BlobAttach op */,
		);
		const { localId, blobId: storageId } = message.metadata;
		const pendingEntry = this.pendingBlobs.get(localId);
		if (pendingEntry?.abortSignal?.aborted) {
			this.deletePendingBlob(localId);
			return;
		}

		this.setRedirection(localId, storageId);
		// set identity (id -> id) entry
		this.setRedirection(storageId, storageId);

		if (local) {
			const waitingBlobs = this.opsInFlight.get(storageId);
			if (waitingBlobs !== undefined) {
				// For each op corresponding to this storage ID that we are waiting for, resolve the pending blob.
				// This is safe because the server will keep the blob alive and the op containing the local ID to
				// storage ID is already in flight and any op containing this local ID will be sequenced after that.
				for (const pendingLocalId of waitingBlobs) {
					const entry = this.pendingBlobs.get(pendingLocalId);
					assert(
						entry !== undefined,
						0x38f /* local online BlobAttach op with no pending blob entry */,
					);
					this.setRedirection(pendingLocalId, storageId);
					entry.acked = true;
					const blobHandle = this.getBlobHandle(pendingLocalId);
					blobHandle.notifyShared();
					entry.handleP.resolve(blobHandle);
					this.deletePendingBlobMaybe(pendingLocalId);
				}
				this.opsInFlight.delete(storageId);
			}
			const localEntry = this.pendingBlobs.get(localId);
			if (localEntry) {
				localEntry.acked = true;
				const blobHandle = this.getBlobHandle(localId);
				blobHandle.notifyShared();
				localEntry.handleP.resolve(blobHandle);
				this.deletePendingBlobMaybe(localId);
			}
		}
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
	 * Delete attachment blobs that are sweep ready.
	 * @param sweepReadyBlobRoutes - The routes of blobs that are sweep ready and should be deleted. These routes will
	 * be based off of local ids.
	 * @returns The routes of blobs that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyBlobRoutes: readonly string[]): readonly string[] {
		this.deleteBlobsFromRedirectTable(sweepReadyBlobRoutes);
		return [...sweepReadyBlobRoutes];
	}

	/**
	 * Delete blobs with the given routes from the redirect table.
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
	private deleteBlobsFromRedirectTable(blobRoutes: readonly string[]): void {
		// maybeUnusedStorageIds is used to compute the set of storage IDs that *used to have a local ID*, but that
		// local ID is being deleted.
		const maybeUnusedStorageIds: Set<string> = new Set();
		for (const route of blobRoutes) {
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
	public patchRedirectTable(detachedStorageTable: Map<string, string>): void {
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
			assert(newStorageId !== undefined, "Couldn't find a matching storage ID");
			this.setRedirection(localId, newStorageId);
			// set identity (id -> id) entry
			this.setRedirection(newStorageId, newStorageId);
		}
	}

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
const getGCNodePathFromLocalId = (localId: string): string =>
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
