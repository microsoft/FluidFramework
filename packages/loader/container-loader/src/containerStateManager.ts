/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { assert } from "@fluidframework/core-utils";
import { IResolvedUrl, ISnapshot } from "@fluidframework/driver-definitions";
import { isInstanceOfISnapshot } from "@fluidframework/driver-utils";
import {
	ContainerStorageAdapter,
	ISerializableBlobContents,
	getBlobContentsFromTree,
} from "./containerStorageAdapter";
import { IPendingContainerState } from "./container";

export class containerStateManager {
	private readonly savedOps: ISequencedDocumentMessage[] = [];
	public snapshot:
		| {
				tree: ISnapshotTree;
				blobs: ISerializableBlobContents;
		  }
		| undefined;
	private readonly mc: MonitoringContext;
	private readonly offlineLoadEnabled: boolean;
	private readonly storageAdapter: ContainerStorageAdapter;
	private readonly isInteractiveClient: boolean;
	private readonly pendingLocalState: IPendingContainerState | undefined;

	constructor(
		pendingLocalState: IPendingContainerState | undefined,
		subLogger: ITelemetryLoggerExt,
		private readonly getClientId: () => string | undefined,
		private readonly getResolvedUrl: () => IResolvedUrl | undefined,
		private readonly getRuntime: () => IRuntime | undefined,
		offlineLoadEnabled,
		storageAdapter,
		isInteractiveClient,
	) {
		this.pendingLocalState = pendingLocalState;
		this.offlineLoadEnabled = offlineLoadEnabled;
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "ContainerStateManager",
		});
		this.storageAdapter = storageAdapter;
		this.isInteractiveClient = isInteractiveClient;
	}

	public addSavedOp(message: ISequencedDocumentMessage) {
		this.savedOps.push(message);
	}

	public getSavedOps() {
		return this.savedOps;
	}

	private async getVersion(version: string | null): Promise<IVersion | undefined> {
		const versions = await this.storageAdapter.getVersions(version, 1);
		return versions[0];
	}

	/**
	 * Get the most recent snapshot, or a specific version.
	 * @param specifiedVersion - The specific version of the snapshot to retrieve
	 * @returns The snapshot requested, or the latest snapshot if no version was specified, plus version ID
	 */
	private async fetchSnapshotTree(
		specifiedVersion: string | undefined,
	): Promise<{ snapshot?: ISnapshotTree; version?: IVersion | undefined }> {
		const version = await this.getVersion(specifiedVersion ?? null);

		if (version === undefined && specifiedVersion !== undefined) {
			// We should have a defined version to load from if specified version requested
			this.mc.logger.sendErrorEvent({
				eventName: "NoVersionFoundWhenSpecified",
				id: specifiedVersion,
			});
		}
		const snapshot = (await this.storageAdapter.getSnapshotTree(version)) ?? undefined;

		if (snapshot === undefined && version !== undefined) {
			this.mc.logger.sendErrorEvent({ eventName: "getSnapshotTreeFailed", id: version.id });
		}
		return { snapshot, version };
	}

	public async fetchSnapshot(
		specifiedVersion: string | undefined,
		supportGetSnapshotApi: boolean | undefined,
	) {
		const { snapshot, version } =
			this.pendingLocalState === undefined
				? await this.fetchSnapshotCore(specifiedVersion, supportGetSnapshotApi)
				: { snapshot: this.pendingLocalState.baseSnapshot, version: undefined };
		const snapshotTree: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
			? snapshot.snapshotTree
			: snapshot;
		if (this.pendingLocalState) {
			this.snapshot = {
				tree: this.pendingLocalState.baseSnapshot,
				blobs: this.pendingLocalState.snapshotBlobs,
			};
		} else {
			assert(snapshotTree !== undefined, "Snapshot should exist");
			// non-interactive clients will not have any pending state we want to save
			if (this.offlineLoadEnabled && this.isInteractiveClient) {
				const blobs = await getBlobContentsFromTree(snapshotTree, this.storageAdapter);
				this.snapshot = { tree: snapshotTree, blobs };
			}
		}
		return { snapshotTree, version };
	}

	private async fetchSnapshotCore(
		specifiedVersion: string | undefined,
		supportGetSnapshotApi: boolean | undefined,
	): Promise<{ snapshot?: ISnapshot | ISnapshotTree; version?: IVersion }> {
		if (
			this.mc.config.getBoolean("Fluid.Container.UseLoadingGroupIdForSnapshotFetch") ===
				true &&
			supportGetSnapshotApi === true
		) {
			const snapshot = await this.storageAdapter.getSnapshot({
				versionId: specifiedVersion,
			});
			const version: IVersion = {
				id: snapshot.snapshotTree.id ?? "",
				treeId: snapshot.snapshotTree.id ?? "",
			};

			if (snapshot === undefined && specifiedVersion !== undefined) {
				this.mc.logger.sendErrorEvent({
					eventName: "getSnapshotTreeFailed",
					id: version.id,
				});
			}
			return { snapshot, version };
		}
		return this.fetchSnapshotTree(specifiedVersion);
	}

	public setSnapshot(
		snapshot:
			| {
					tree: ISnapshotTree;
					blobs: ISerializableBlobContents;
			  }
			| undefined,
	) {
		this.snapshot = snapshot;
	}

	public async getPendingLocalStateCore(props: IGetPendingLocalStateProps) {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				notifyImminentClosure: props.notifyImminentClosure,
				savedOpsSize: this.getSavedOps().length,
				clientId: this.getClientId(),
			},
			async () => {
				if (!this.offlineLoadEnabled) {
					throw new UsageError(
						"Can't get pending local state unless offline load is enabled",
					);
				}
				const resolvedUrl = this.getResolvedUrl();
				assert(
					resolvedUrl !== undefined && resolvedUrl.type === "fluid",
					"resolved url should be valid Fluid url",
				);
				assert(this.snapshot !== undefined, "no base data");
				const pendingRuntimeState = await this.getRuntime()?.getPendingLocalState(props);
				const pendingState: IPendingContainerState = {
					pendingRuntimeState,
					baseSnapshot: this.snapshot.tree,
					snapshotBlobs: this.snapshot.blobs,
					savedOps: this.getSavedOps(),
					url: resolvedUrl.url,
					// no need to save this if there is no pending runtime state
					clientId: pendingRuntimeState !== undefined ? this.getClientId() : undefined,
				};

				return JSON.stringify(pendingState);
			},
		);
	}
}
