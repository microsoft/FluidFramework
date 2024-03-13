/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentAttributes,
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
	// eslint-disable-next-line @typescript-eslint/prefer-readonly
	private processedOps: ISequencedDocumentMessage[] = [];
	private snapshot:
		| {
				tree: ISnapshotTree;
				blobs: ISerializableBlobContents;
		  }
		| undefined;
	private readonly mc: MonitoringContext;
	private supportGetSnapshotApi: boolean = false;
	private fetchPromise: Promise<void> | undefined = undefined;
	// private readonly promiseCache: PromiseCache<string, { snapshot?: ISnapshot | ISnapshotTree; version?: IVersion } > = new PromiseCache();;
	// private readonly retryDelay = 1000; // Initial delay in milliseconds for the first retry.

	constructor(
		private readonly pendingLocalState: IPendingContainerState | undefined,
		subLogger: ITelemetryLoggerExt,
		private readonly storageAdapter: Pick<
			IDocumentStorageService,
			"readBlob" | "getSnapshotTree" | "getSnapshot" | "getVersions"
		>,
		private readonly _offlineLoadEnabled: boolean,
		private readonly getDocumentAttributes: (
			storage,
			tree: ISnapshotTree,
		) => Promise<IDocumentAttributes>,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});
	}

	public get offlineLoadEnabled(): boolean {
		return this._offlineLoadEnabled;
	}

	private refreshRequired() {
		return this.processedOps.length > 100;
	}

	public addProcessedOp(message: ISequencedDocumentMessage) {
		if (this.offlineLoadEnabled) {
			this.processedOps.push(message);
			if (this.refreshRequired()) {
				this.refreshAttributes();
			}
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
		this.supportGetSnapshotApi = supportGetSnapshotApi ?? false;
		if (this.pendingLocalState === undefined) {
			const { snapshot, version } = await this.fetchSnapshotCore(
				specifiedVersion,
				supportGetSnapshotApi,
			);
			const snapshotTree: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
				? snapshot.snapshotTree
				: snapshot;
			assert(snapshotTree !== undefined, "Snapshot should exist");
			// non-interactive clients will not have any pending state we want to save
			if (this.offlineLoadEnabled) {
				const blobs = await getBlobContentsFromTree(snapshotTree, this.storageAdapter);
				this.snapshot = { tree: snapshotTree, blobs };
			}
			return { snapshotTree, version };
		} else {
			this.snapshot = {
				tree: this.pendingLocalState.baseSnapshot,
				blobs: this.pendingLocalState.snapshotBlobs,
			};
			this.refreshAttributes();
			return { snapshotTree: this.pendingLocalState.baseSnapshot, version: undefined };
		}
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
			} else if (snapshot !== undefined && version === undefined) {
				this.mc.logger.sendErrorEvent({
					eventName: "getSnapshotFetchedTreeWithoutVersion",
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

	public refreshAttributes() {
		if (this.fetchPromise === undefined) {
			this.fetchPromise = this.fetchSnapshotCore(undefined, this.supportGetSnapshotApi)
				.then(async ({ snapshot }) => {
					const snapshotTree: ISnapshotTree | undefined = isInstanceOfISnapshot(snapshot)
						? snapshot.snapshotTree
						: snapshot;
					assert(snapshotTree !== undefined, "Snapshot should exist");
					const blobs = await getBlobContentsFromTree(snapshotTree, this.storageAdapter);

					const attributes: IDocumentAttributes = await this.getDocumentAttributes(
						this.storageAdapter,
						snapshotTree,
					);
					if (this.processedOps.length === 0) {
						this.snapshot = { tree: snapshotTree, blobs };
						return;
					}
					const snapshotSN = attributes.sequenceNumber;
					const firstSavedOpSN = this.processedOps[0].sequenceNumber;
					const lastSavedOpSN =
						this.processedOps[this.processedOps.length - 1].sequenceNumber;

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
						// Snapshot is between the first and last saved operation.
						console.log("SNAPSHOT REFRESHHHHHHHHHHHHHHH");
						this.processedOps.splice(0, snapshotSN - firstSavedOpSN + 1);
						this.snapshot = { tree: snapshotTree, blobs };
					} else if (snapshotSN > lastSavedOpSN) {
						// Snapshot is newer than the newest processed op.
						// We need to wait and catch up with ops to reach the snapshot's state.
						// addProcessedOps will kick the refresh process later
						this.mc.logger.sendTelemetryEvent({
							eventName: "New_Snapshot_Fetch_While_Refresh",
							snapshotSequenceNumber: snapshotSN,
							firstProcessedOpSequenceNumber: firstSavedOpSN,
						});
						console.log("Snapshot didn't refresh RRRRRRRRRR");
					} else {
						assert(!true, "Impossible case");
					}
				})
				.catch((error) => {
					// Ignore errors for current attempt as addProcessedOps will retry again eventually
					this.mc.logger.sendErrorEvent(
						{
							eventName: "Could_Not_Refresh_Snapshot",
						},
						error,
					);
				})
				.finally(() => {
					// Once the fetch is complete, reset this.fetchPromise.
					this.fetchPromise = undefined;
				});
		}
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
				savedOpsSize: this.processedOps.length,
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
