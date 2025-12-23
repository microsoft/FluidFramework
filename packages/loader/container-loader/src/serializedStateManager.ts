/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { IRuntime } from "@fluidframework/container-definitions/internal";
import type {
	IEventProvider,
	IEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IDisposable } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	FetchSource,
	type IDocumentStorageService,
	type IResolvedUrl,
	type ISnapshot,
	type IDocumentAttributes,
	type ISnapshotTree,
	type IVersion,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { getSnapshotTree, isInstanceOfISnapshot } from "@fluidframework/driver-utils/internal";
import {
	type MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import {
	getBlobContentsFromTree,
	type ContainerStorageAdapter,
	type ISerializableBlobContents,
} from "./containerStorageAdapter.js";
import { SnapshotRefresher } from "./snapshotRefresher.js";
import {
	convertISnapshotToSnapshotWithBlobs,
	convertSnapshotToSnapshotInfo,
	getDocumentAttributes,
} from "./utils.js";

/**
 * This is very similar to {@link @fluidframework/protocol-definitions/internal#ISnapshot}, but the difference is
 * that the blobs of ISnapshot are of type ArrayBufferLike, while the blobs of this interface are serializable because
 * they are already converted to string.
 */
export interface SnapshotWithBlobs {
	/**
	 * Snapshot from which container initially loaded.
	 */
	baseSnapshot: ISnapshotTree;
	/**
	 * Serializable blobs from the base snapshot. Used to load offline since
	 * storage is not available.
	 */
	snapshotBlobs: ISerializableBlobContents;
}

/**
 * State saved by a container at close time, to be used to load a new instance
 * of the container to the same state
 *
 * This is very similar to {@link @fluidframework/protocol-definitions/internal#ISnapshot}, but the difference is
 * that the blobs of ISnapshot are of type ArrayBufferLike, while the blobs of this interface are serializable because
 * they are already converted to string.
 *
 * @internal
 */
export interface IPendingContainerState extends SnapshotWithBlobs {
	/**
	 * This container was attached (as opposed to IPendingDetachedContainerState.attached which is false)
	 */
	attached: true;
	/**
	 * Runtime-specific state that will be needed to properly rehydrate
	 * (it's included in ContainerContext passed to instantiateRuntime)
	 */
	pendingRuntimeState: unknown;
	/**
	 * Any group snapshots (aka delay-loaded) we've downloaded from the service for this container
	 */
	loadedGroupIdSnapshots?: Record<string, SerializedSnapshotInfo>;
	/**
	 * All ops since base snapshot sequence number up to the latest op
	 * seen when the container was closed. Used to apply stashed (saved pending)
	 * ops at the same sequence number at which they were made.
	 */
	savedOps: ISequencedDocumentMessage[];
	/**
	 * The Container's URL in the service, needed to hook up the driver during rehydration
	 */
	url: string;
	/**
	 * If the Container was connected when serialized, its clientId. Used as the initial clientId upon rehydration, until reconnected.
	 */
	clientId?: string;
}

/**
 * State saved by a container in detached state, to be used to load a new instance
 * of the container to the same state (rehydrate)
 * @internal
 */
export interface IPendingDetachedContainerState extends SnapshotWithBlobs {
	/**
	 * This container was not attached (as opposed to IPendingContainerState.attached which is true)
	 */
	attached: false;
	/**
	 * Indicates whether we expect the rehydrated container to have non-empty Detached Blob Storage
	 */
	hasAttachmentBlobs: boolean;
	/**
	 * Used by the memory blob storage to persisted attachment blobs
	 */
	attachmentBlobs?: string;
	/**
	 * Runtime-specific state that will be needed to properly rehydrate
	 * (it's included in ContainerContext passed to instantiateRuntime)
	 */
	pendingRuntimeState?: unknown;
}

export interface SerializedSnapshotInfo extends SnapshotWithBlobs {
	snapshotSequenceNumber: number;
}

export interface ISnapshotInfo {
	snapshotSequenceNumber: number;
	snapshotFetchedTime?: number | undefined;
	snapshot: ISnapshot | ISnapshotTree;
}

export type ISerializedStateManagerDocumentStorageService = Pick<
	ContainerStorageAdapter,
	"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob" | "cacheSnapshotBlobs"
> & {
	loadedGroupIdSnapshots: Record<string, ISnapshot>;
};

interface ISerializerEvent extends IEvent {
	(event: "saved", listener: (dirty: boolean) => void): void;
}

/**
 * Helper class to manage the state of the container needed for proper serialization.
 *
 * It holds the pendingLocalState the container was rehydrated from (if any),
 * as well as the snapshot to be used for serialization.
 * It also keeps track of container dirty state and which local ops have been processed
 */
export class SerializedStateManager implements IDisposable {
	private readonly processedOps: ISequencedDocumentMessage[] = [];
	private readonly mc: MonitoringContext;
	private snapshotInfo: ISnapshotInfo | undefined;
	private latestSnapshot: ISnapshotInfo | undefined;
	private lastSavedOpSequenceNumber: number = 0;
	private readonly snapshotRefresher: SnapshotRefresher | undefined;
	#disposed: boolean = false;

	/**
	 * @param subLogger - Container's logger to use as parent for our logger
	 * @param storageAdapter - Storage adapter for fetching snapshots
	 * @param offlineLoadEnabled - Is serializing/rehydrating containers allowed?
	 * @param containerEvent - Source of the "saved" event when the container has all its pending state uploaded
	 * @param containerDirty - Is the container "dirty"? That's the opposite of "saved" - there is pending state that may not have been received yet by the service.
	 */
	constructor(
		subLogger: ITelemetryBaseLogger,
		private readonly storageAdapter: ISerializedStateManagerDocumentStorageService,
		private readonly offlineLoadEnabled: boolean,
		containerEvent: IEventProvider<ISerializerEvent>,
		private readonly containerDirty: () => boolean,
		private readonly supportGetSnapshotApi: () => boolean,
		snapshotRefreshTimeoutMs?: number,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});

		this.snapshotRefresher = this.offlineLoadEnabled
			? new SnapshotRefresher(
					subLogger,
					this.storageAdapter,
					this.offlineLoadEnabled,
					this.supportGetSnapshotApi,
					(snapshot: ISnapshotInfo) => this.handleSnapshotRefreshed(snapshot),
					snapshotRefreshTimeoutMs,
				)
			: undefined;

		containerEvent.on("saved", () => this.updateSnapshotAndProcessedOpsMaybe());
	}
	public get disposed(): boolean {
		return this.#disposed;
	}
	dispose(): void {
		this.#disposed = true;
		this.snapshotRefresher?.dispose();
	}

	private verifyNotDisposed(): void {
		if (this.#disposed) {
			throw new Error("SerializedStateManager used after dispose.");
		}
	}

	/**
	 * Promise that will resolve (or reject) once we've tried to download the latest snapshot(s) from storage
	 * only intended to be used for testing purposes.
	 * @returns The snapshot sequence number associated with the latest fetched snapshot
	 */
	public get refreshSnapshotP(): Promise<number> | undefined {
		return this.snapshotRefresher?.refreshSnapshotP;
	}

	/**
	 * Called whenever an incoming op is processed by the Container
	 */
	public addProcessedOp(message: ISequencedDocumentMessage): void {
		if (this.offlineLoadEnabled) {
			this.processedOps.push(message);
			this.updateSnapshotAndProcessedOpsMaybe();
		}
	}

	/**
	 * This wraps the basic functionality of fetching the snapshot for this container during Container load.
	 *
	 * If we have pendingLocalState, we get the snapshot from there.
	 * Otherwise, fetch it from storage (according to specifiedVersion if provided).
	 *
	 * @param specifiedVersion - If a version is specified and we don't have pendingLocalState, fetch this version from storage.
	 * @param pendingLocalState - The pendingLocalState being rehydrated, if any (undefined when loading directly from storage)
	 * @returns The snapshot to boot the container from
	 */
	public async fetchSnapshot(
		specifiedVersion: string | undefined,
		pendingLocalState: IPendingContainerState | undefined,
	): Promise<{
		snapshot: ISnapshot | ISnapshotTree;
		version: IVersion | undefined;
		attributes: IDocumentAttributes;
	}> {
		this.verifyNotDisposed();
		if (pendingLocalState === undefined) {
			const { snapshot, version } = await getSnapshot(
				this.mc,
				this.storageAdapter,
				this.supportGetSnapshotApi(),
				specifiedVersion,
			);
			const baseSnapshotTree: ISnapshotTree | undefined = getSnapshotTree(snapshot);
			const attributes = await getDocumentAttributes(this.storageAdapter, baseSnapshotTree);
			if (this.offlineLoadEnabled) {
				this.snapshotRefresher?.startTimer();
				this.snapshotInfo = {
					snapshot,
					snapshotSequenceNumber: attributes.sequenceNumber,
				};
			}
			return { snapshot, version, attributes };
		} else {
			const { baseSnapshot, snapshotBlobs, savedOps } = pendingLocalState;
			const blobContents = new Map<string, ArrayBuffer>();
			for (const [id, value] of Object.entries(snapshotBlobs)) {
				blobContents.set(id, stringToBuffer(value, "utf8"));
			}
			this.storageAdapter.cacheSnapshotBlobs(blobContents);
			const attributes = await getDocumentAttributes(this.storageAdapter, baseSnapshot);

			const snapshot: ISnapshot = {
				sequenceNumber: attributes.sequenceNumber,
				snapshotTree: baseSnapshot,
				blobContents,
				latestSequenceNumber: undefined,
				ops: [],
				snapshotFormatV: 1,
			};

			if (this.offlineLoadEnabled) {
				// special case handle. Obtaining the last saved op seq num to avoid
				// refreshing the snapshot before we have processed it. It could cause
				// a subsequent stashing to have a newer snapshot than allowed.
				if (savedOps.length > 0) {
					const savedOpsSize = savedOps.length;
					this.lastSavedOpSequenceNumber = savedOps[savedOpsSize - 1].sequenceNumber;
				}

				this.snapshotInfo = {
					snapshot,
					snapshotSequenceNumber: attributes.sequenceNumber,
				};
				this.snapshotRefresher?.tryRefreshSnapshot();
			}
			return { snapshot, version: undefined, attributes };
		}
	}

	/**
	 * Handles the snapshotRefreshed event from SnapshotRefresher.
	 * Decides whether to accept the new snapshot based on processed ops.
	 * @returns The snapshot sequence number if updated, -1 otherwise
	 */
	private handleSnapshotRefreshed(latestSnapshot: ISnapshotInfo): number {
		this.latestSnapshot = latestSnapshot;
		return this.updateSnapshotAndProcessedOpsMaybe();
	}

	/**
	 * Updates class snapshot and processedOps if we have a new snapshot and it's among processedOps range.
	 */
	private updateSnapshotAndProcessedOpsMaybe(): number {
		const snapshotSequenceNumber = this.latestSnapshot?.snapshotSequenceNumber;
		if (
			this.#disposed ||
			snapshotSequenceNumber === undefined ||
			this.processedOps.length === 0 ||
			this.processedOps[this.processedOps.length - 1].sequenceNumber <
				this.lastSavedOpSequenceNumber ||
			this.containerDirty()
		) {
			// can't refresh latest snapshot until we have processed the ops up to it.
			// Pending state would be behind the latest snapshot.
			return -1;
		}
		const firstProcessedOpSequenceNumber = this.processedOps[0].sequenceNumber;
		const lastProcessedOpSequenceNumber =
			this.processedOps[this.processedOps.length - 1].sequenceNumber;

		if (snapshotSequenceNumber < firstProcessedOpSequenceNumber) {
			// Snapshot seq number is older than our first processed op, which could mean we're fetching
			// the same snapshot that we already have or snapshot is too old, implicating an unexpected behavior.
			this.mc.logger.sendTelemetryEvent({
				eventName: "OldSnapshotFetchWhileRefreshing",
				snapshotSequenceNumber,
				firstProcessedOpSequenceNumber,
				lastProcessedOpSequenceNumber,
				stashedSnapshotSequenceNumber: this.snapshotInfo?.snapshotSequenceNumber,
			});
			this.latestSnapshot = undefined;
			this.snapshotRefresher?.clearLatestSnapshot();
		} else if (snapshotSequenceNumber <= lastProcessedOpSequenceNumber) {
			// Snapshot seq num is between the first and last processed op.
			// Remove the ops that are already part of the snapshot
			this.processedOps.splice(0, snapshotSequenceNumber - firstProcessedOpSequenceNumber + 1);
			this.snapshotInfo = this.latestSnapshot;
			this.latestSnapshot = undefined;
			this.snapshotRefresher?.clearLatestSnapshot();
			this.mc.logger.sendTelemetryEvent({
				eventName: "SnapshotRefreshed",
				snapshotSequenceNumber,
				firstProcessedOpSequenceNumber,
				newFirstProcessedOpSequenceNumber:
					this.processedOps.length === 0 ? undefined : this.processedOps[0].sequenceNumber,
			});
		}
		return snapshotSequenceNumber;
	}

	/**
	 * When the Container attaches, we need to stash the initial snapshot (a form of the attach summary).
	 * This method is only meant to be used by Container.attach() to set the initial
	 * base snapshot when attaching.
	 * @param snapshot - snapshot and blobs collected while attaching (a form of the attach summary)
	 */
	public setInitialSnapshot(snapshot: ISnapshot): void {
		this.verifyNotDisposed();
		if (this.offlineLoadEnabled) {
			this.snapshotInfo = {
				snapshot,
				snapshotSequenceNumber: snapshot.sequenceNumber ?? 0,
				snapshotFetchedTime: Date.now(),
			};
			this.snapshotRefresher?.startTimer();
		}
	}

	/**
	 * Assembles and serializes the {@link IPendingContainerState} for the container,
	 * to be stored and used to rehydrate the container at a later time.
	 */
	public async getPendingLocalState(
		clientId: string | undefined,
		runtime: Pick<IRuntime, "getPendingLocalState">,
		resolvedUrl: IResolvedUrl,
	): Promise<string> {
		this.verifyNotDisposed();
		if (!this.offlineLoadEnabled) {
			throw new UsageError("Can't get pending local state unless offline load is enabled");
		}

		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				details: {
					notifyImminentClosure: false,
					sessionExpiryTimerStarted: undefined,
					snapshotSequenceNumber: undefined,
					processedOpsSize: this.processedOps.length,
				},
				clientId,
			},
			async () => {
				assert(this.snapshotInfo !== undefined, 0x8e5 /* no base data */);
				const pendingRuntimeState = await runtime.getPendingLocalState({
					notifyImminentClosure: false,
					snapshotSequenceNumber: this.snapshotInfo.snapshotSequenceNumber,
					sessionExpiryTimerStarted: this.snapshotInfo.snapshotFetchedTime,
				});
				// This conversion is required because ArrayBufferLike doesn't survive JSON.stringify
				const loadedGroupIdSnapshots: Record<string, SerializedSnapshotInfo> = {};
				let hasGroupIdSnapshots = false;
				const groupIdSnapshots = Object.entries(this.storageAdapter.loadedGroupIdSnapshots);
				if (groupIdSnapshots.length > 0) {
					for (const [groupId, snapshot] of groupIdSnapshots) {
						hasGroupIdSnapshots = true;
						loadedGroupIdSnapshots[groupId] = convertSnapshotToSnapshotInfo(snapshot);
					}
				}

				const snapshotWithBlobs: SnapshotWithBlobs = isInstanceOfISnapshot(
					this.snapshotInfo.snapshot,
				)
					? convertISnapshotToSnapshotWithBlobs(this.snapshotInfo.snapshot)
					: await convertSnapshotTreeToSnapshotWithBlobs(
							this.snapshotInfo.snapshot,
							this.storageAdapter,
						);

				const pendingState: IPendingContainerState = {
					attached: true,
					pendingRuntimeState,
					...snapshotWithBlobs,
					loadedGroupIdSnapshots: hasGroupIdSnapshots ? loadedGroupIdSnapshots : undefined,
					savedOps: this.processedOps,
					url: resolvedUrl.url,
					clientId,
				};

				return JSON.stringify(pendingState);
			},
		);
	}
}

async function convertSnapshotTreeToSnapshotWithBlobs(
	snapshot: ISnapshotTree,
	storageAdapter: ISerializedStateManagerDocumentStorageService,
): Promise<SnapshotWithBlobs> {
	const snapshotBlobs = await getBlobContentsFromTree(snapshot, storageAdapter);
	return {
		baseSnapshot: snapshot,
		snapshotBlobs,
	};
}

/**
 * Retrieves the most recent snapshot and returns its info.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing methods to retrieve the snapshot.
 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree.
 * @returns a SnapshotInfo object containing the snapshot tree, snapshot blobs and its sequence number.
 */
export async function getLatestSnapshotInfo(
	mc: MonitoringContext,
	storageAdapter: ISerializedStateManagerDocumentStorageService,
	supportGetSnapshotApi: boolean,
): Promise<ISnapshotInfo | undefined> {
	return PerformanceEvent.timedExecAsync<ISnapshotInfo | undefined>(
		mc.logger,
		{ eventName: "GetLatestSnapshotInfo" },
		async (event) => {
			try {
				// get the latest non cached snapshot version
				const specifiedVersion: IVersion[] = await storageAdapter.getVersions(
					// eslint-disable-next-line unicorn/no-null
					null,
					1,
					"getLatestSnapshotInfo",
					FetchSource.noCache,
				);
				const { snapshot: baseSnapshot } = await getSnapshot(
					mc,
					storageAdapter,
					supportGetSnapshotApi,
					specifiedVersion[0]?.id,
				);

				const { sequenceNumber, snapshotTree } = isInstanceOfISnapshot(baseSnapshot)
					? baseSnapshot
					: { snapshotTree: baseSnapshot, sequenceNumber: undefined };

				const snapshotSequenceNumber: number =
					sequenceNumber ??
					(await getDocumentAttributes(storageAdapter, snapshotTree).then(
						(a) => a.sequenceNumber,
					));
				return {
					snapshot: baseSnapshot,
					snapshotSequenceNumber,
					snapshotFetchedTime: Date.now(),
				};
			} catch (error) {
				event.cancel(undefined, error);
			}
			return undefined;
		},
	);
}

/**
 * Retrieves a snapshot from the storage adapter and transforms it into an ISnapshotTree object.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing methods to retrieve the snapshot.
 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree.
 * @param specifiedVersion - An optional version string specifying the version of the snapshot tree to fetch.
 * @returns An ISnapshotTree and its version.
 */
async function getSnapshot(
	mc: MonitoringContext,
	storageAdapter: Pick<
		IDocumentStorageService,
		"getSnapshot" | "getSnapshotTree" | "getVersions"
	>,
	supportGetSnapshotApi: boolean,
	specifiedVersion: string | undefined,
): Promise<{ snapshot: ISnapshot | ISnapshotTree; version?: IVersion }> {
	const { snapshot, version } = supportGetSnapshotApi
		? await fetchISnapshot(mc, storageAdapter, specifiedVersion)
		: await fetchISnapshotTree(mc, storageAdapter, specifiedVersion);
	assert(snapshot !== undefined, 0x8e4 /* Snapshot should exist */);
	return { snapshot, version };
}

/**
 * Fetches an ISnapshot from a storage adapter based on the specified version.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing a getSnapshot method to retrieve the ISnapshot and version.
 * @param specifiedVersion - An optional version string specifying the version of the snapshot tree to fetch.
 * @returns The fetched snapshot tree and its version.
 */
export async function fetchISnapshot(
	mc: MonitoringContext,
	storageAdapter: Pick<IDocumentStorageService, "getSnapshot">,
	specifiedVersion: string | undefined,
): Promise<{ snapshot?: ISnapshot; version?: IVersion }> {
	const snapshot = await storageAdapter.getSnapshot?.({ versionId: specifiedVersion });
	const version: IVersion | undefined =
		snapshot?.snapshotTree.id === undefined
			? undefined
			: {
					id: snapshot.snapshotTree.id,
					treeId: snapshot.snapshotTree.id,
				};

	if (snapshot === undefined && specifiedVersion !== undefined) {
		mc.logger.sendErrorEvent({
			eventName: "getSnapshotTreeFailed",
			id: specifiedVersion,
		});
	} else if (snapshot !== undefined && version?.id === undefined) {
		mc.logger.sendErrorEvent({
			eventName: "getSnapshotFetchedTreeWithoutVersionId",
			hasVersion: version !== undefined, // if hasVersion is true, this means that the contract with the service was broken.
		});
	}
	return { snapshot, version };
}

/**
 * Fetches an ISnapshotTree from a storage adapter based on the specified version.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing methods to retrieve the ISnapshotTree and version.
 * @param specifiedVersion - An optional version string specifying the version of the snapshot tree to fetch.
 * @returns The fetched snapshot tree and its version.
 */
export async function fetchISnapshotTree(
	mc: MonitoringContext,
	storageAdapter: Pick<IDocumentStorageService, "getSnapshotTree" | "getVersions">,
	specifiedVersion: string | undefined,
): Promise<{ snapshot?: ISnapshotTree; version?: IVersion | undefined }> {
	// API uses null
	// eslint-disable-next-line unicorn/no-null
	const versions = await storageAdapter.getVersions(specifiedVersion ?? null, 1);
	const version = versions[0];

	if (version === undefined && specifiedVersion !== undefined) {
		// We should have a defined version to load from if specified version requested
		mc.logger.sendErrorEvent({
			eventName: "NoVersionFoundWhenSpecified",
			id: specifiedVersion,
		});
	}
	const snapshot = (await storageAdapter.getSnapshotTree(version)) ?? undefined;

	if (snapshot === undefined && version !== undefined) {
		mc.logger.sendErrorEvent({ eventName: "getSnapshotTreeFailed", id: version.id });
	} else if (snapshot !== undefined && version?.id === undefined) {
		mc.logger.sendErrorEvent({
			eventName: "getSnapshotFetchedTreeWithoutVersionId",
			hasVersion: version !== undefined, // if hasVersion is true, this means that the contract with the service was broken.
		});
	}
	return { snapshot, version };
}
