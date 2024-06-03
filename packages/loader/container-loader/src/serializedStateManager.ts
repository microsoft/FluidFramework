/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	IGetPendingLocalStateProps,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import type { IEventProvider, IEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	FetchSource,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	type IDocumentAttributes,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { getSnapshotTree } from "@fluidframework/driver-utils/internal";
import {
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { ISerializableBlobContents, getBlobContentsFromTree } from "./containerStorageAdapter.js";
import { convertSnapshotToSnapshotInfo, getDocumentAttributes } from "./utils.js";

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
	/** This container was attached (as opposed to IPendingDetachedContainerState.attached which is false) */
	attached: true;
	/**
	 * Runtime-specific state that will be needed to properly rehydrate
	 * (it's included in ContainerContext passed to instantiateRuntime)
	 */
	pendingRuntimeState: unknown;
	/**
	 * Any group snapshots (aka delay-loaded) we've downloaded from the service for this container
	 */
	loadedGroupIdSnapshots?: Record<string, ISnapshotInfo>;
	/**
	 * All ops since base snapshot sequence number up to the latest op
	 * seen when the container was closed. Used to apply stashed (saved pending)
	 * ops at the same sequence number at which they were made.
	 */
	savedOps: ISequencedDocumentMessage[];
	/** The Container's URL in the service, needed to hook up the driver during rehydration */
	url: string;
	/** If the Container was connected when serialized, its clientId. Used as the initial clientId upon rehydration, until reconnected. */
	clientId?: string;
}

/**
 * State saved by a container in detached state, to be used to load a new instance
 * of the container to the same state (rehydrate)
 * @internal
 */
export interface IPendingDetachedContainerState extends SnapshotWithBlobs {
	/** This container was not attached (as opposed to IPendingContainerState.attached which is true) */
	attached: false;
	/** Indicates whether we expect the rehydrated container to have non-empty Detached Blob Storage */
	hasAttachmentBlobs: boolean;
	/** Used by the memory blob storage to persisted attachment blobs */
	attachmentBlobs?: string;
	/**
	 * Runtime-specific state that will be needed to properly rehydrate
	 * (it's included in ContainerContext passed to instantiateRuntime)
	 */
	pendingRuntimeState?: unknown;
}

export interface ISnapshotInfo extends SnapshotWithBlobs {
	snapshotSequenceNumber: number;
	snapshotFetchedTime?: number | undefined;
}

export type ISerializedStateManagerDocumentStorageService = Pick<
	IDocumentStorageService,
	"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob"
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
export class SerializedStateManager {
	private readonly processedOps: ISequencedDocumentMessage[] = [];
	private readonly mc: MonitoringContext;
	private snapshot: ISnapshotInfo | undefined;
	private latestSnapshot: ISnapshotInfo | undefined;
	private refreshSnapshotP: Promise<void> | undefined;
	private readonly lastSavedOpSequenceNumber: number = 0;

	/**
	 * @param pendingLocalState - The pendingLocalState being rehydrated, if any (undefined when loading directly from storage)
	 * @param subLogger - Container's logger to use as parent for our logger
	 * @param storageAdapter - Storage adapter for fetching snapshots
	 * @param _offlineLoadEnabled - Is serializing/rehydrating containers allowed?
	 * @param containerEvent - Source of the "saved" event when the container has all its pending state uploaded
	 * @param containerDirty - Is the container "dirty"? That's the opposite of "saved" - there is pending state that may not have been received yet by the service.
	 */
	constructor(
		private readonly pendingLocalState: IPendingContainerState | undefined,
		subLogger: ITelemetryBaseLogger,
		private readonly storageAdapter: ISerializedStateManagerDocumentStorageService,
		private readonly _offlineLoadEnabled: boolean,
		containerEvent: IEventProvider<ISerializerEvent>,
		private readonly containerDirty: () => boolean,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});

		if (pendingLocalState && pendingLocalState.savedOps.length > 0) {
			const savedOpsSize = pendingLocalState.savedOps.length;
			this.lastSavedOpSequenceNumber =
				pendingLocalState.savedOps[savedOpsSize - 1].sequenceNumber;
		}
		containerEvent.once("saved", () => this.updateSnapshotAndProcessedOpsMaybe());
	}

	public get offlineLoadEnabled(): boolean {
		return this._offlineLoadEnabled;
	}

	/**
	 * Promise that will resolve (or reject) once we've tried to download the latest snapshot(s) from storage
	 */
	public get waitForInitialRefresh(): Promise<void> | undefined {
		return this.refreshSnapshotP;
	}

	/**
	 * Called whenever an incoming op is processed by the Container
	 */
	public addProcessedOp(message: ISequencedDocumentMessage) {
		if (this.offlineLoadEnabled) {
			this.processedOps.push(message);
			this.updateSnapshotAndProcessedOpsMaybe();
		}
	}

	/**
	 * This wraps the basic functionality of fetching the snapshot for this container during Container load.
	 *
	 * If we have pendingLocalState, we get the snapshot from there.
	 * Otherwise, fetch it from storage (according to specifiedVersion if provided)
	 *
	 * @param specifiedVersion - If a version is specified and we don't have pendingLocalState, fetch this version from storage
	 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree.
	 * @returns The snapshot to boot the container from
	 */
	public async fetchSnapshot(
		specifiedVersion: string | undefined,
		supportGetSnapshotApi: boolean,
	) {
		if (this.pendingLocalState === undefined) {
			const { baseSnapshot, version } = await getSnapshot(
				this.mc,
				this.storageAdapter,
				supportGetSnapshotApi,
				specifiedVersion,
			);
			const baseSnapshotTree: ISnapshotTree | undefined = getSnapshotTree(baseSnapshot);
			// non-interactive clients will not have any pending state we want to save
			if (this.offlineLoadEnabled) {
				const snapshotBlobs = await getBlobContentsFromTree(
					baseSnapshotTree,
					this.storageAdapter,
				);
				const attributes = await getDocumentAttributes(
					this.storageAdapter,
					baseSnapshotTree,
				);
				this.snapshot = {
					baseSnapshot: baseSnapshotTree,
					snapshotBlobs,
					snapshotSequenceNumber: attributes.sequenceNumber,
				};
			}
			return { baseSnapshot, version };
		} else {
			const { baseSnapshot, snapshotBlobs } = this.pendingLocalState;
			const attributes = await getDocumentAttributes(this.storageAdapter, baseSnapshot);
			this.snapshot = {
				baseSnapshot,
				snapshotBlobs,
				snapshotSequenceNumber: attributes.sequenceNumber,
			};

			if (
				this.refreshSnapshotP === undefined &&
				this.mc.config.getBoolean("Fluid.Container.enableOfflineSnapshotRefresh") === true
			) {
				// Don't block on the refresh snapshot call - it is for the next time we serialize, not booting this incarnation
				this.refreshSnapshotP = this.refreshLatestSnapshot(supportGetSnapshotApi);
				this.refreshSnapshotP.catch((e) => {
					this.mc.logger.sendErrorEvent({
						eventName: "RefreshLatestSnapshotFailed",
						error: e,
					});
				});
			}

			const blobContents = new Map<string, ArrayBuffer>();
			for (const [id, value] of Object.entries(snapshotBlobs)) {
				blobContents.set(id, stringToBuffer(value, "utf8"));
			}
			const iSnapshot: ISnapshot = {
				sequenceNumber: this.snapshot.snapshotSequenceNumber,
				snapshotTree: baseSnapshot,
				blobContents,
				latestSequenceNumber: undefined,
				ops: [],
				snapshotFormatV: 1,
			};
			return { baseSnapshot: iSnapshot, version: undefined };
		}
	}

	/**
	 * Fetch the latest snapshot for the container, including delay-loaded groupIds if pendingLocalState was provided and contained any groupIds.
	 * Note that this will update the StorageAdapter's cached snapshots for the groupIds (if present)
	 *
	 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree (must be true to fetch by groupIds)
	 */
	private async refreshLatestSnapshot(supportGetSnapshotApi: boolean): Promise<void> {
		this.latestSnapshot = await getLatestSnapshotInfo(
			this.mc,
			this.storageAdapter,
			supportGetSnapshotApi,
		);

		// These are loading groupIds that the containerRuntime has requested over its lifetime.
		// We will fetch the latest snapshot for the groupIds, which will update storageAdapter.loadedGroupIdSnapshots's cache
		const downloadedGroupIds = Object.keys(this.storageAdapter.loadedGroupIdSnapshots);
		if (supportGetSnapshotApi && downloadedGroupIds.length > 0) {
			assert(
				this.storageAdapter.getSnapshot !== undefined,
				0x972 /* getSnapshot should exist */,
			);
			// (This is a separate network call from above because it requires work for storage to add a special base groupId)
			const snapshot = await this.storageAdapter.getSnapshot({
				versionId: undefined,
				scenarioName: "getLatestSnapshotInfo",
				cacheSnapshot: false,
				loadingGroupIds: downloadedGroupIds,
				fetchSource: FetchSource.noCache,
			});
			assert(snapshot !== undefined, 0x973 /* Snapshot should exist */);
		}

		this.updateSnapshotAndProcessedOpsMaybe();
	}

	/**
	 * Updates class snapshot and processedOps if we have a new snapshot and it's among processedOps range.
	 */
	private updateSnapshotAndProcessedOpsMaybe() {
		if (
			this.latestSnapshot === undefined ||
			this.processedOps.length === 0 ||
			this.processedOps[this.processedOps.length - 1].sequenceNumber <
				this.lastSavedOpSequenceNumber ||
			this.containerDirty()
		) {
			// can't refresh latest snapshot until we have processed the ops up to it.
			// Pending state would be behind the latest snapshot.
			return;
		}
		const snapshotSequenceNumber = this.latestSnapshot.snapshotSequenceNumber;
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
				stashedSnapshotSequenceNumber: this.snapshot?.snapshotSequenceNumber,
			});
			this.latestSnapshot = undefined;
		} else if (snapshotSequenceNumber <= lastProcessedOpSequenceNumber) {
			// Snapshot seq num is between the first and last processed op.
			// Remove the ops that are already part of the snapshot
			this.processedOps.splice(
				0,
				snapshotSequenceNumber - firstProcessedOpSequenceNumber + 1,
			);
			this.snapshot = this.latestSnapshot;
			this.latestSnapshot = undefined;
			this.mc.logger.sendTelemetryEvent({
				eventName: "SnapshotRefreshed",
				snapshotSequenceNumber,
				firstProcessedOpSequenceNumber,
				newFirstProcessedOpSequenceNumber:
					this.processedOps.length === 0
						? undefined
						: this.processedOps[0].sequenceNumber,
			});
		}
	}

	/**
	 * When the Container attaches, we need to stash the initial snapshot (a form of the attach summary).
	 * This method is only meant to be used by Container.attach() to set the initial
	 * base snapshot when attaching.
	 * @param snapshot - snapshot and blobs collected while attaching (a form of the attach summary)
	 */
	public setInitialSnapshot(snapshot: SnapshotWithBlobs | undefined) {
		if (this.offlineLoadEnabled) {
			assert(
				this.snapshot === undefined,
				0x937 /* inital snapshot should only be defined once */,
			);
			assert(snapshot !== undefined, 0x938 /* attachment snapshot should be defined */);
			const { baseSnapshot, snapshotBlobs } = snapshot;
			const attributesHash =
				".protocol" in baseSnapshot.trees
					? baseSnapshot.trees[".protocol"].blobs.attributes
					: baseSnapshot.blobs[".attributes"];
			const attributes = JSON.parse(snapshotBlobs[attributesHash]);
			assert(
				attributes.sequenceNumber === 0,
				0x939 /* trying to set a non attachment snapshot */,
			);
			this.snapshot = { ...snapshot, snapshotSequenceNumber: attributes.sequenceNumber };
		}
	}

	/**
	 * Assembles and serializes the {@link IPendingContainerState} for the container,
	 * to be stored and used to rehydrate the container at a later time.
	 */
	public async getPendingLocalState(
		props: IGetPendingLocalStateProps,
		clientId: string | undefined,
		runtime: Pick<IRuntime, "getPendingLocalState">,
		resolvedUrl: IResolvedUrl,
	): Promise<string> {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				details: {
					notifyImminentClosure: props.notifyImminentClosure,
					sessionExpiryTimerStarted: props.sessionExpiryTimerStarted,
					snapshotSequenceNumber: props.snapshotSequenceNumber,
					processedOpsSize: this.processedOps.length,
				},
				clientId,
			},
			async () => {
				if (!this.offlineLoadEnabled) {
					throw new UsageError(
						"Can't get pending local state unless offline load is enabled",
					);
				}
				assert(this.snapshot !== undefined, 0x8e5 /* no base data */);
				const pendingRuntimeState = await runtime.getPendingLocalState({
					...props,
					snapshotSequenceNumber: this.snapshot.snapshotSequenceNumber,
					sessionExpiryTimerStarted: this.snapshot.snapshotFetchedTime,
				});
				// This conversion is required because ArrayBufferLike doesn't survive JSON.stringify
				const loadedGroupIdSnapshots = {};
				let hasGroupIdSnapshots = false;
				const groupIdSnapshots = Object.entries(this.storageAdapter.loadedGroupIdSnapshots);
				if (groupIdSnapshots.length > 0) {
					for (const [groupId, snapshot] of groupIdSnapshots) {
						hasGroupIdSnapshots = true;
						loadedGroupIdSnapshots[groupId] = convertSnapshotToSnapshotInfo(snapshot);
					}
				}
				const pendingState: IPendingContainerState = {
					attached: true,
					pendingRuntimeState,
					baseSnapshot: this.snapshot.baseSnapshot,
					snapshotBlobs: this.snapshot.snapshotBlobs,
					loadedGroupIdSnapshots: hasGroupIdSnapshots
						? loadedGroupIdSnapshots
						: undefined,
					savedOps: this.processedOps,
					url: resolvedUrl.url,
					clientId,
				};

				return JSON.stringify(pendingState);
			},
		);
	}
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
	return PerformanceEvent.timedExecAsync(
		mc.logger,
		{ eventName: "GetLatestSnapshotInfo" },
		async () => {
			const { baseSnapshot } = await getSnapshot(
				mc,
				storageAdapter,
				supportGetSnapshotApi,
				undefined,
			);

			const baseSnapshotTree: ISnapshotTree | undefined = getSnapshotTree(baseSnapshot);
			const snapshotFetchedTime = Date.now();
			const snapshotBlobs = await getBlobContentsFromTree(baseSnapshotTree, storageAdapter);
			const attributes: IDocumentAttributes = await getDocumentAttributes(
				storageAdapter,
				baseSnapshotTree,
			);
			const snapshotSequenceNumber = attributes.sequenceNumber;
			return {
				baseSnapshot: baseSnapshotTree,
				snapshotBlobs,
				snapshotSequenceNumber,
				snapshotFetchedTime,
			};
		},
	).catch(() => undefined);
}

/**
 * Retrieves a snapshot from the storage adapter and transforms it into an ISnapshotTree object.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing methods to retrieve the snapshot.
 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree.
 * @param specifiedVersion - An optional version string specifying the version of the snapshot tree to fetch.
 * @returns - An ISnapshotTree and its version.
 */
async function getSnapshot(
	mc: MonitoringContext,
	storageAdapter: Pick<
		IDocumentStorageService,
		"getSnapshot" | "getSnapshotTree" | "getVersions"
	>,
	supportGetSnapshotApi: boolean,
	specifiedVersion: string | undefined,
): Promise<{ baseSnapshot: ISnapshot | ISnapshotTree; version?: IVersion }> {
	const { snapshot, version } = supportGetSnapshotApi
		? await fetchISnapshot(mc, storageAdapter, specifiedVersion)
		: await fetchISnapshotTree(mc, storageAdapter, specifiedVersion);
	assert(snapshot !== undefined, 0x8e4 /* Snapshot should exist */);
	return { baseSnapshot: snapshot, version };
}

/**
 * Fetches an ISnapshot from a storage adapter based on the specified version.
 *
 * @param mc - The monitoring context.
 * @param storageAdapter - The storage adapter providing a getSnapshot method to retrieve the ISnapshot and version.
 * @param specifiedVersion - An optional version string specifying the version of the snapshot tree to fetch.
 * @returns - The fetched snapshot tree and its version.
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
 * @returns - The fetched snapshot tree and its version.
 */
export async function fetchISnapshotTree(
	mc: MonitoringContext,
	storageAdapter: Pick<IDocumentStorageService, "getSnapshotTree" | "getVersions">,
	specifiedVersion: string | undefined,
): Promise<{ snapshot?: ISnapshotTree; version?: IVersion | undefined }> {
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
