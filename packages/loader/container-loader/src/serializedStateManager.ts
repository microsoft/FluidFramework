/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IGetPendingLocalStateProps,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
} from "@fluidframework/driver-definitions/internal";
import { isInstanceOfISnapshot } from "@fluidframework/driver-utils/internal";
import {
	type IDocumentAttributes,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import {
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { ISerializableBlobContents, getBlobContentsFromTree } from "./containerStorageAdapter.js";
import { getDocumentAttributes } from "./utils.js";

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
 * @internal
 */
export interface IPendingContainerState extends SnapshotWithBlobs {
	attached: true;
	pendingRuntimeState: unknown;
	/**
	 * All ops since base snapshot sequence number up to the latest op
	 * seen when the container was closed. Used to apply stashed (saved pending)
	 * ops at the same sequence number at which they were made.
	 */
	savedOps: ISequencedDocumentMessage[];
	url: string;
	clientId?: string;
}

/**
 * State saved by a container in detached state, to be used to load a new instance
 * of the container to the same state (rehydrate)
 * @internal
 */
export interface IPendingDetachedContainerState extends SnapshotWithBlobs {
	attached: false;
	hasAttachmentBlobs: boolean;
	pendingRuntimeState?: unknown;
}

export interface ISnapshotInfo extends SnapshotWithBlobs {
	snapshotSequenceNumber: number;
}

export class SerializedStateManager {
	private readonly processedOps: ISequencedDocumentMessage[] = [];
	private snapshot: ISnapshotInfo | undefined;
	private readonly mc: MonitoringContext;
	private latestSnapshot: ISnapshotInfo | undefined;
	private refreshSnapshot: Promise<void> | undefined;

	constructor(
		private readonly pendingLocalState: IPendingContainerState | undefined,
		subLogger: ITelemetryLoggerExt,
		private readonly storageAdapter: Pick<
			IDocumentStorageService,
			"readBlob" | "getSnapshotTree" | "getSnapshot" | "getVersions"
		>,
		private readonly _offlineLoadEnabled: boolean,
		private readonly newSnapshotFetched?: () => void,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});
	}

	public get offlineLoadEnabled(): boolean {
		return this._offlineLoadEnabled;
	}

	public addProcessedOp(message: ISequencedDocumentMessage) {
		if (this.offlineLoadEnabled) {
			this.processedOps.push(message);
			this.updateSnapshotAndProcessedOpsMaybe();
		}
	}

	public async fetchSnapshot(
		specifiedVersion: string | undefined,
		supportGetSnapshotApi: boolean,
	) {
		if (this.pendingLocalState === undefined) {
			const { baseSnapshot, version } = await getSnapshotTree(
				this.mc,
				this.storageAdapter,
				supportGetSnapshotApi,
				specifiedVersion,
			);
			// non-interactive clients will not have any pending state we want to save
			if (this.offlineLoadEnabled) {
				const snapshotBlobs = await getBlobContentsFromTree(
					baseSnapshot,
					this.storageAdapter,
				);
				const attributes = await getDocumentAttributes(this.storageAdapter, baseSnapshot);
				this.snapshot = {
					baseSnapshot,
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
			this.refreshSnapshot ??= (async () => {
				this.latestSnapshot = await getLatestSnapshotInfo(
					this.mc,
					this.storageAdapter,
					supportGetSnapshotApi,
				);
				this.newSnapshotFetched?.();
				this.updateSnapshotAndProcessedOpsMaybe();
			})();

			return { baseSnapshot, version: undefined };
		}
	}

	/**
	 * Updates class snapshot and processedOps if we have a new snapshot and it's among processedOps range.
	 */
	private updateSnapshotAndProcessedOpsMaybe() {
		if (this.latestSnapshot === undefined || this.processedOps.length === 0) {
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
	 * This method is only meant to be used by Container.attach() to set the initial
	 * base snapshot when attaching.
	 * @param snapshot - snapshot and blobs collected while attaching
	 */
	public setInitialSnapshot(snapshot: SnapshotWithBlobs | undefined) {
		if (this.offlineLoadEnabled) {
			assert(this.snapshot === undefined, "inital snapshot should only be defined once");
			assert(snapshot !== undefined, "attachment snapshot should be defined");
			const { baseSnapshot, snapshotBlobs } = snapshot;
			const attributesHash =
				".protocol" in baseSnapshot.trees
					? baseSnapshot.trees[".protocol"].blobs.attributes
					: baseSnapshot.blobs[".attributes"];
			const attributes = JSON.parse(snapshotBlobs[attributesHash]);
			assert(attributes.sequenceNumber === 0, "trying to set a non attachment snapshot");
			this.snapshot = { ...snapshot, snapshotSequenceNumber: attributes.sequenceNumber };
		}
	}

	public async getPendingLocalStateCore(
		props: IGetPendingLocalStateProps,
		clientId: string | undefined,
		runtime: Pick<IRuntime, "getPendingLocalState">,
		resolvedUrl: IResolvedUrl,
	) {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				notifyImminentClosure: props.notifyImminentClosure,
				processedOpsSize: this.processedOps.length,
				clientId,
			},
			async () => {
				if (!this.offlineLoadEnabled) {
					throw new UsageError(
						"Can't get pending local state unless offline load is enabled",
					);
				}
				assert(this.snapshot !== undefined, 0x8e5 /* no base data */);
				const pendingRuntimeState = await runtime.getPendingLocalState(props);
				const pendingState: IPendingContainerState = {
					attached: true,
					pendingRuntimeState,
					baseSnapshot: this.snapshot.baseSnapshot,
					snapshotBlobs: this.snapshot.snapshotBlobs,
					savedOps: this.processedOps,
					url: resolvedUrl.url,
					// no need to save this if there is no pending runtime state
					clientId: pendingRuntimeState !== undefined ? clientId : undefined,
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
	storageAdapter: Pick<
		IDocumentStorageService,
		"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob"
	>,
	supportGetSnapshotApi: boolean,
): Promise<ISnapshotInfo | undefined> {
	return PerformanceEvent.timedExecAsync(
		mc.logger,
		{ eventName: "GetLatestSnapshotInfo" },
		async () => {
			const { baseSnapshot } = await getSnapshotTree(
				mc,
				storageAdapter,
				supportGetSnapshotApi,
				undefined,
			);
			const snapshotBlobs = await getBlobContentsFromTree(baseSnapshot, storageAdapter);
			const attributes: IDocumentAttributes = await getDocumentAttributes(
				storageAdapter,
				baseSnapshot,
			);
			const snapshotSequenceNumber = attributes.sequenceNumber;
			return { baseSnapshot, snapshotBlobs, snapshotSequenceNumber };
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
async function getSnapshotTree(
	mc: MonitoringContext,
	storageAdapter: Pick<
		IDocumentStorageService,
		"getSnapshot" | "getSnapshotTree" | "getVersions"
	>,
	supportGetSnapshotApi: boolean,
	specifiedVersion: string | undefined,
): Promise<{ baseSnapshot: ISnapshotTree; version?: IVersion }> {
	const { snapshot, version } = supportGetSnapshotApi
		? await fetchISnapshot(mc, storageAdapter, specifiedVersion)
		: await fetchISnapshotTree(mc, storageAdapter, specifiedVersion);
	const baseSnapshot: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
		? snapshot.snapshotTree
		: snapshot;
	assert(baseSnapshot !== undefined, 0x8e4 /* Snapshot should exist */);
	return { baseSnapshot, version };
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
