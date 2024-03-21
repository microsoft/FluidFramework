/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import { assert } from "@fluidframework/core-utils";
import {
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
} from "@fluidframework/driver-definitions";
import { isInstanceOfISnapshot } from "@fluidframework/driver-utils";
import {
	type IDocumentAttributes,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils";
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

export class SerializedStateManager {
	private processedOps: ISequencedDocumentMessage[] = [];
	private snapshot: SnapshotWithBlobs | undefined;
	private readonly mc: MonitoringContext;
	private latestSnapshot: ISnapshotTree | undefined = undefined;
	private latestSnapshotSequenceNumber: number | undefined;
	private latestSnapshotBlobs: ISerializableBlobContents | undefined;

	constructor(
		private readonly pendingLocalState: IPendingContainerState | undefined,
		subLogger: ITelemetryLoggerExt,
		private readonly storageAdapter: Pick<
			IDocumentStorageService,
			"readBlob" | "getSnapshotTree" | "getSnapshot" | "getVersions"
		>,
		private readonly _offlineLoadEnabled: boolean,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});
	}

	public get offlineLoadEnabled(): boolean {
		return this._offlineLoadEnabled;
	}

	private refreshOnCatchUpMaybe(message: ISequencedDocumentMessage) {
		if (
			this.latestSnapshotSequenceNumber !== undefined &&
			message.sequenceNumber === this.latestSnapshotSequenceNumber + 1
		) {
			assert(this.latestSnapshot !== undefined, "no latest snapshot");
			assert(this.latestSnapshotBlobs !== undefined, "no latest snapshot blobs");
			this.snapshot = {
				baseSnapshot: this.latestSnapshot,
				snapshotBlobs: this.latestSnapshotBlobs,
			};
			this.processedOps = [];
		}
	}

	public addProcessedOp(message: ISequencedDocumentMessage) {
		if (this.offlineLoadEnabled) {
			this.refreshOnCatchUpMaybe(message);
			this.processedOps.push(message);
		}
	}

	public async fetchSnapshot(
		specifiedVersion: string | undefined,
		supportGetSnapshotApi: boolean,
	) {
		if (this.pendingLocalState === undefined) {
			const { snapshot, version } = supportGetSnapshotApi
				? await fetchISnapshot(this.mc, this.storageAdapter, specifiedVersion)
				: await fetchISnapshotTree(this.mc, this.storageAdapter, specifiedVersion);
			const baseSnapshot: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
				? snapshot.snapshotTree
				: snapshot;
			assert(baseSnapshot !== undefined, 0x8e4 /* Snapshot should exist */);
			// non-interactive clients will not have any pending state we want to save
			if (this.offlineLoadEnabled) {
				const snapshotBlobs = await getBlobContentsFromTree(
					baseSnapshot,
					this.storageAdapter,
				);
				this.snapshot = { baseSnapshot, snapshotBlobs };
			}
			return { baseSnapshot, version };
		} else {
			const { baseSnapshot, snapshotBlobs } = this.pendingLocalState;
			this.snapshot = { baseSnapshot, snapshotBlobs };
			this.refreshSnapshot(supportGetSnapshotApi).catch((error) => {
				this.mc.logger.sendErrorEvent(
					{
						eventName: "Could_Not_Refresh_Snapshot",
					},
					error,
				);
				throw error;
			});
			return { baseSnapshot, version: undefined };
		}
	}

	/**
	 * Fetch latest snapshot available in storage and retry indefinetely
	 * @param supportGetSnapshotApi -
	 */
	private async refreshSnapshot(supportGetSnapshotApi: boolean) {
		// This need to be resilient to failure. We can use runWithRetry
		const { snapshot } = supportGetSnapshotApi
			? await fetchISnapshot(this.mc, this.storageAdapter, undefined)
			: await fetchISnapshotTree(this.mc, this.storageAdapter, undefined);
		const latestSnapshot: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
			? snapshot.snapshotTree
			: snapshot;
		assert(latestSnapshot !== undefined, 0x8e4 /* Snapshot should exist */);
		this.latestSnapshot = latestSnapshot;
		await this.refreshPendingAttributes(latestSnapshot);
	}

	/**
	 * Updates class snapshot and processedOps with the latest fetched snapshot
	 *
	 * @param latestSnapshot -
	 */
	private async refreshPendingAttributes(latestSnapshot: ISnapshotTree) {
		const snapshotBlobs = await getBlobContentsFromTree(latestSnapshot, this.storageAdapter);
		this.latestSnapshotBlobs = snapshotBlobs;
		const attributes: IDocumentAttributes = await getDocumentAttributes(
			this.storageAdapter,
			latestSnapshot,
		);
		if (this.processedOps.length === 0) {
			// weird edge case in which we don't have to do nothing to processedOps
			// since we don't have any
			this.snapshot = { baseSnapshot: latestSnapshot, snapshotBlobs };
			return;
		}
		const snapshotSN = attributes.sequenceNumber;
		const firstSavedOpSN = this.processedOps[0].sequenceNumber;
		const lastSavedOpSN = this.processedOps[this.processedOps.length - 1].sequenceNumber;

		if (snapshotSN < firstSavedOpSN - 1) {
			this.mc.logger.sendErrorEvent({
				eventName: "Old_Snapshot_Fetch_While_Refresing",
				snapshotSequenceNumber: snapshotSN,
				firstProcessedOpSequenceNumber: firstSavedOpSN,
			});
			throw new Error("Fetched snapshot is not latest available");
		} else if (snapshotSN === firstSavedOpSN - 1) {
			// Snapshot is exactly one less than the first processed op sequence number.
			// Meaning new snapshot is the same as before refreshing. Do nothing.
			this.mc.logger.sendTelemetryEvent({
				eventName: "Previous_Snapshot_Fetch_While_Refreshing",
				snapshotSequenceNumber: snapshotSN,
				firstProcessedOpSequenceNumber: firstSavedOpSN,
			});
			return;
		} else if (snapshotSN >= firstSavedOpSN && snapshotSN <= lastSavedOpSN) {
			// Snapshot seq num is between the first and last processed op.
			// Remove the ops that are already part of the snapshot
			this.processedOps.splice(0, snapshotSN - firstSavedOpSN + 1);
			this.snapshot = { baseSnapshot: latestSnapshot, snapshotBlobs };
		} else {
			// snapshotSN > lastSavedOpSN
			// Snapshot is newer than the latest processed op.
			// We need to wait and catch up with ops to reach the snapshot's state.
			// addProcessedOps will kick the refresh process later
			this.latestSnapshotSequenceNumber = snapshotSN;
			this.mc.logger.sendTelemetryEvent({
				eventName: "Newer_Snapshot_Fetch_While_Refresh",
				snapshotSequenceNumber: snapshotSN,
				firstProcessedOpSequenceNumber: firstSavedOpSN,
			});
		}
	}

	/**
	 * This method is only meant to be used by Container.attach() to set the initial
	 * base snapshot when attaching.
	 * @param snapshot - snapshot and blobs collected while attaching
	 */
	public setSnapshot(snapshot: SnapshotWithBlobs | undefined) {
		this.snapshot = snapshot;
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

export async function fetchISnapshot(
	mc: MonitoringContext,
	storageAdapter: Pick<IDocumentStorageService, "getSnapshot">,
	specifiedVersion: string | undefined,
): Promise<{ snapshot?: ISnapshot | ISnapshotTree; version?: IVersion }> {
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
		// Not sure if this should be here actually
	} else if (snapshot !== undefined && version?.id === undefined) {
		mc.logger.sendErrorEvent({
			eventName: "getSnapshotFetchedTreeWithoutVersionId",
			hasVersion: version !== undefined, // if hasVersion is true, this means that the contract with the service was broken.
		});
	}
	return { snapshot, version };
}

/**
 * Get the most recent snapshot, or a specific version.
 * @param specifiedVersion - The specific version of the snapshot to retrieve
 * @returns The snapshot requested, or the latest snapshot if no version was specified, plus version ID
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
