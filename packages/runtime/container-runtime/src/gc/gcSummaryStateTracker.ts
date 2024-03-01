/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SummaryType } from "@fluidframework/protocol-definitions";
import {
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
	ISummarizeResult,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { mergeStats, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IRefreshSummaryResult } from "../summary/index.js";
import { GCVersion, IGarbageCollectorConfigs, IGCStats } from "./gcDefinitions.js";
import { generateSortedGCState } from "./gcHelpers.js";
import { IGarbageCollectionSnapshotData, IGarbageCollectionState } from "./gcSummaryDefinitions.js";

export const gcStateBlobKey = `${gcBlobPrefix}_root`;

/**
 * The GC data that is tracked for a summary.
 */
export interface IGCSummaryTrackingData {
	serializedGCState: string | undefined;
	serializedTombstones: string | undefined;
	serializedDeletedNodes: string | undefined;
}

/**
 * Encapsulates the garbage collection state that is tracked across summaries.
 * It maintains the GC state as per the latest summary in by the server. It updates state when a summary tracked by this
 * client is acked by the server or from a snapshot is downloaded from the server.
 * On summarize, it decides whether to write new state or re-use previous summary's state.
 */
export class GCSummaryStateTracker {
	// This is the version of GC data in the latest summary being tracked.
	private latestSummaryGCVersion: GCVersion;

	// Keeps track of the GC data from the latest summary successfully acked by the server.
	private latestSummaryData: IGCSummaryTrackingData | undefined;
	// Keeps track of the GC data from the last summary submitted to the server but not yet acked.
	private pendingSummaryData: IGCSummaryTrackingData | undefined;

	// Tracks whether there was GC was run in latest summary being tracked.
	private wasGCRunInLatestSummary: boolean;

	// Tracks the count of data stores whose state updated since the last summary, i.e., they went from referenced
	// to unreferenced or vice-versa.
	public updatedDSCountSinceLastSummary: number = 0;

	/** API for ensuring the correct auto-recovery mitigations */
	public autoRecovery = {
		requestFullGCOnNextRun: () => {
			this.fullGCModeForAutoRecovery = true;
		},
		fullGCRequested: () => {
			return this.fullGCModeForAutoRecovery;
		},
	};
	/** If true, the next GC run will do fullGC mode to regenerate the GC data for each node */
	private fullGCModeForAutoRecovery: boolean = false;

	constructor(
		// Tells whether GC should run or not.
		private readonly configs: Pick<
			IGarbageCollectorConfigs,
			"shouldRunGC" | "tombstoneMode" | "gcVersionInBaseSnapshot" | "gcVersionInEffect"
		>,
		// Tells whether GC was run in the base snapshot this container loaded from.
		wasGCRunInBaseSnapshot: boolean,
	) {
		this.wasGCRunInLatestSummary = wasGCRunInBaseSnapshot;
		// For existing document, the latest summary is the one that we loaded from. So, use its GC version as the
		// latest tracked GC version. For new documents, we will be writing the first summary with the current version.
		this.latestSummaryGCVersion =
			this.configs.gcVersionInBaseSnapshot ?? this.configs.gcVersionInEffect;
	}

	/**
	 * Tells whether the GC state needs to be reset. This can happen under 3 conditions:
	 *
	 * 1. The base snapshot contains GC state but GC is disabled. This will happen the first time GC is disabled after
	 * it was enabled before. GC state needs to be removed from summary and all nodes should be marked referenced.
	 *
	 * 2. The base snapshot does not have GC state but GC is enabled. This will happen the very first time GC runs on
	 * a document and the first time GC is enabled after is was disabled before.
	 *
	 * 3. GC is enabled and the latest summary state is refreshed from a snapshot that had GC disabled and vice-versa.
	 *
	 * Note that the state will be reset only once for the first summary generated after this returns true. After that,
	 * this will return false.
	 */
	public get doesGCStateNeedReset(): boolean {
		return this.wasGCRunInLatestSummary !== this.configs.shouldRunGC;
	}

	/**
	 * Tells whether the GC state needs to be reset in the next summary. We need to do this if:
	 *
	 * 1. GC was enabled and is now disabled. The GC state needs to be removed and everything becomes referenced.
	 *
	 * 2. GC was disabled and is now enabled. The GC state needs to be regenerated and added to summary.
	 *
	 * 3. GC is enabled and the latest summary state is refreshed from a snapshot that had GC disabled and vice-versa.
	 *
	 * 4. The GC version in the latest summary is different from the current GC version. This can happen if:
	 *
	 * 4.1. The summary this client loaded with has data from a different GC version.
	 *
	 * 4.2. This client's latest summary was updated from a snapshot that has a different GC version.
	 */
	public get doesSummaryStateNeedReset(): boolean {
		return (
			this.doesGCStateNeedReset ||
			(this.configs.shouldRunGC &&
				this.latestSummaryGCVersion !== this.configs.gcVersionInEffect)
		);
	}

	/**
	 * Called during GC initialization. Initialize the latest summary data from the base snapshot data.
	 */
	public initializeBaseState(baseSnapshotData: IGarbageCollectionSnapshotData | undefined) {
		if (baseSnapshotData === undefined) {
			return;
		}

		// If tracking state across summaries, update latest summary data from the snapshot's GC data.
		this.latestSummaryData = {
			serializedGCState: baseSnapshotData.gcState
				? JSON.stringify(generateSortedGCState(baseSnapshotData.gcState))
				: undefined,
			serializedTombstones: JSON.stringify(baseSnapshotData.tombstones),
			serializedDeletedNodes: JSON.stringify(baseSnapshotData.deletedNodes),
		};
	}

	/**
	 * Summarizes three component of the GC data - GC state, tombstones and deleted nodes.
	 * It does incremental summary, i.e., it writes summary tree / summary blob only for the component that changed.
	 * For components that did not change, a summary handle is returned that points to the previous successful summary.
	 * If none of the components changed, it returns a summary handle for the entire GC data.
	 */
	public summarize(
		trackState: boolean,
		gcState: IGarbageCollectionState,
		deletedNodes: Set<string>,
		tombstones: string[],
	): ISummarizeResult | undefined {
		if (!this.configs.shouldRunGC) {
			return;
		}

		const serializedGCState = JSON.stringify(generateSortedGCState(gcState));
		// Serialize and write deleted nodes, if any. This is done irrespective of whether sweep is enabled or not so
		// to identify deleted nodes' usage.
		const serializedDeletedNodes =
			deletedNodes.size > 0 ? JSON.stringify(Array.from(deletedNodes).sort()) : undefined;
		// If running in tombstone mode, serialize and write tombstones, if any.
		const serializedTombstones = this.configs.tombstoneMode
			? tombstones.length > 0
				? JSON.stringify(tombstones.sort())
				: undefined
			: undefined;

		/**
		 * Incremental summary of GC data - If none of GC state, deleted nodes or tombstones changed since last summary,
		 * write summary handle instead of summary tree for GC.
		 * Otherwise, write the GC summary tree. In the tree, for each of these that changed, write a summary blob and
		 * for each of these that did not change, write a summary handle.
		 */
		this.pendingSummaryData = {
			serializedGCState,
			serializedTombstones,
			serializedDeletedNodes,
		};

		if (trackState && this.latestSummaryData !== undefined) {
			// If nothing changed since last summary, send a summary handle for the entire GC data.
			if (
				this.latestSummaryData.serializedGCState === serializedGCState &&
				this.latestSummaryData.serializedTombstones === serializedTombstones &&
				this.latestSummaryData.serializedDeletedNodes === serializedDeletedNodes
			) {
				const stats = mergeStats();
				stats.handleNodeCount++;
				return {
					summary: {
						type: SummaryType.Handle,
						handle: `/${gcTreeKey}`,
						handleType: SummaryType.Tree,
					},
					stats,
				};
			}

			// If some state changed, build a GC summary tree.
			return this.buildGCSummaryTree(
				serializedGCState,
				serializedTombstones,
				serializedDeletedNodes,
				true /* trackState */,
			);
		}
		// If not tracking GC state, build a GC summary tree without any summary handles.
		return this.buildGCSummaryTree(
			serializedGCState,
			serializedTombstones,
			serializedDeletedNodes,
			false /* trackState */,
		);
	}

	/**
	 * Builds the GC summary tree which contains GC state, deleted nodes and tombstones.
	 * If trackState is false, all of GC state, deleted nodes and tombstones are written as summary blobs.
	 * If trackState is true, only states that changed are written. Rest are written as handles.
	 * @param serializedGCState - The GC state serialized as string.
	 * @param serializedTombstones - The tombstone state serialized as string.
	 * @param serializedDeletedNodes - Deleted nodes serialized as string.
	 * @param trackState - Whether we are tracking GC state across summaries.
	 * @returns the GC summary tree.
	 */
	private buildGCSummaryTree(
		serializedGCState: string,
		serializedTombstones: string | undefined,
		serializedDeletedNodes: string | undefined,
		trackState: boolean,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		// If the GC state hasn't changed, write a summary handle, else write a summary blob for it.
		if (this.latestSummaryData?.serializedGCState === serializedGCState && trackState) {
			builder.addHandle(gcStateBlobKey, SummaryType.Blob, `/${gcTreeKey}/${gcStateBlobKey}`);
		} else {
			builder.addBlob(gcStateBlobKey, serializedGCState);
		}

		// If tombstones exist, write a summary handle if it hasn't changed. If it has changed, write a
		// summary blob.
		if (serializedTombstones !== undefined) {
			if (
				this.latestSummaryData?.serializedTombstones === serializedTombstones &&
				trackState
			) {
				builder.addHandle(
					gcTombstoneBlobKey,
					SummaryType.Blob,
					`/${gcTreeKey}/${gcTombstoneBlobKey}`,
				);
			} else {
				builder.addBlob(gcTombstoneBlobKey, serializedTombstones);
			}
		}

		// If there are no deleted nodes, return the summary tree.
		if (serializedDeletedNodes === undefined) {
			return builder.getSummaryTree();
		}

		// If the deleted nodes hasn't changed, write a summary handle, else write a summary blob for it.
		if (
			this.latestSummaryData?.serializedDeletedNodes === serializedDeletedNodes &&
			trackState
		) {
			builder.addHandle(
				gcDeletedBlobKey,
				SummaryType.Blob,
				`/${gcTreeKey}/${gcDeletedBlobKey}`,
			);
		} else {
			builder.addBlob(gcDeletedBlobKey, serializedDeletedNodes);
		}
		return builder.getSummaryTree();
	}

	/**
	 * Called to refresh the latest summary state. This happens when a pending summary is acked.
	 */
	public async refreshLatestSummary(result: IRefreshSummaryResult): Promise<void> {
		if (!result.isSummaryTracked) {
			return;
		}

		// If the summary is tracked, this client is the one that generated it. So, update wasGCRunInLatestSummary.
		// Note that this has to be updated if GC did not run too. Otherwise, `gcStateNeedsReset` will always return
		// true in scenarios where GC is currently disabled but enabled in the snapshot we loaded from.
		this.wasGCRunInLatestSummary = this.configs.shouldRunGC;

		if (!this.configs.shouldRunGC) {
			return;
		}

		this.latestSummaryGCVersion = this.configs.gcVersionInEffect;
		this.latestSummaryData = this.pendingSummaryData;
		this.pendingSummaryData = undefined;
		this.updatedDSCountSinceLastSummary = 0;
		this.fullGCModeForAutoRecovery = false;
		return;
	}

	/**
	 * Called to update the state from a GC run's stats. Used to update the count of data stores whose state updated.
	 */
	public updateStateFromGCRunStats(stats: IGCStats) {
		this.updatedDSCountSinceLastSummary += stats.updatedDataStoreCount;
	}
}
