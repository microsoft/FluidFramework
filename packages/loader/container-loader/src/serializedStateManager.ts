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
import {
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
} from "@fluidframework/driver-definitions";
import { isInstanceOfISnapshot } from "@fluidframework/driver-utils";
import { ISerializableBlobContents, getBlobContentsFromTree } from "./containerStorageAdapter.js";
import { IPendingContainerState } from "./container.js";

export class SerializedStateManager {
	private readonly savedOps: ISequencedDocumentMessage[] = [];
	private snapshot:
		| {
				tree: ISnapshotTree;
				blobs: ISerializableBlobContents;
		  }
		| undefined;
	private readonly mc: MonitoringContext;

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

	public addSavedOp(message: ISequencedDocumentMessage) {
		if (this.offlineLoadEnabled) {
			this.savedOps.push(message);
		}
	}

	private async getVersion(version: string | null): Promise<IVersion | undefined> {
		const versions = await this.storageAdapter.getVersions(version, 1);
		return versions[0];
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
			if (this.offlineLoadEnabled) {
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
			const snapshot =
				(await this.storageAdapter.getSnapshot?.({
					versionId: specifiedVersion,
				})) ?? undefined;
			const version: IVersion = {
				id: snapshot?.snapshotTree.id ?? "",
				treeId: snapshot?.snapshotTree.id ?? "",
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

	/**
	 * This method is only meant to be used by Container.attach() to set the initial
	 * base snapshot when attaching.
	 * @param snapshot - snapshot and blobs collected while attaching
	 */
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
				savedOpsSize: this.savedOps.length,
				clientId,
			},
			async () => {
				if (!this.offlineLoadEnabled) {
					throw new UsageError(
						"Can't get pending local state unless offline load is enabled",
					);
				}
				assert(this.snapshot !== undefined, "no base data");
				const pendingRuntimeState = await runtime.getPendingLocalState(props);
				const pendingState: IPendingContainerState = {
					attached: true,
					pendingRuntimeState,
					baseSnapshot: this.snapshot.tree,
					snapshotBlobs: this.snapshot.blobs,
					savedOps: this.savedOps,
					url: resolvedUrl.url,
					// no need to save this if there is no pending runtime state
					clientId: pendingRuntimeState !== undefined ? clientId : undefined,
				};

				return JSON.stringify(pendingState);
			},
		);
	}
}
