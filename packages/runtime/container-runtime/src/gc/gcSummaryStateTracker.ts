/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	type ISummaryTreeWithStats,
	type ISummarizeResult,
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder, mergeStats } from "@fluidframework/runtime-utils/internal";

import type { IRefreshSummaryResult } from "../summary/index.js";

import type { IGCStats, IGarbageCollectorConfigs } from "./gcDefinitions.js";
import { generateSortedGCState } from "./gcHelpers.js";
import type {
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
} from "./gcSummaryDefinitions.js";

export const gcStateBlobKey = `${gcBlobPrefix}_root`;

/**
 * The GC data that is tracked for a summary.
 */
export interface IGCSummaryTrackingData {
	serializedGCState: string | undefined;
	serializedTombstones: string | undefined;
	serializedDeletedNodes: string | undefined;
	/**
	 * The recovery request completed before this summary was generated, if any.
	 * Not persisted.
	 */
	recoveryGeneration?: number;
}

/**
 * Encapsulates the garbage collection state that is tracked across summaries.
 * Initializes state from the loaded snapshot and updates it when a summary tracked by this client is acknowledged.
 * During summarization, it decides whether to write new state or reuse the previous summary's state.
 * Proposal tracking applies to both full and incremental summaries, independently of whether handles can be reused.
 */
export class GCSummaryStateTracker {
	// Keeps track of the GC data from the latest summary successfully acked by the server.
	private latestSummaryData: IGCSummaryTrackingData | undefined;
	// Generation is separate from submission: failures and untracked summaries must not replace a pending proposal.
	private wipSummaryData: IGCSummaryTrackingData | undefined;
	private readonly pendingSummaries = new Map<
		string,
		{
			data: IGCSummaryTrackingData | undefined;
			referenceSequenceNumber: number;
		}
	>();

	// Tracks the count of data stores whose state updated since the last summary, i.e., they went from referenced
	// to unreferenced or vice-versa.
	public updatedDSCountSinceLastSummary: number = 0;

	constructor(
		// Tells whether GC should run or not.
		private readonly configs: Pick<
			IGarbageCollectorConfigs,
			"gcAllowed" | "gcVersionInBaseSnapshot" | "gcVersionInEffect"
		>,
	) {}

	/**
	 * Called during GC initialization. Initialize the latest summary data from the base snapshot data.
	 */
	public initializeBaseState(
		baseSnapshotData: IGarbageCollectionSnapshotData | undefined,
	): void {
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
	 *
	 * @param trackState - Capture this attempt's state for later proposal completion.
	 * @param fullTree - Write all GC blobs without handles, independently of whether the attempt is tracked.
	 * @param recoveryGeneration - The completed recovery request represented by this attempt, if any.
	 */
	public summarize(
		trackState: boolean,
		gcState: IGarbageCollectionState,
		deletedNodes: Set<string>,
		tombstones: string[],
		fullTree = false,
		recoveryGeneration?: number,
	): ISummarizeResult | undefined {
		if (!this.configs.gcAllowed) {
			return;
		}

		const serializedGCState = JSON.stringify(generateSortedGCState(gcState));
		// Serialize and write deleted nodes, if any. This is done irrespective of whether sweep is enabled or not so
		// to identify deleted nodes' usage.
		const serializedDeletedNodes =
			deletedNodes.size > 0 ? JSON.stringify([...deletedNodes].sort()) : undefined;
		// Serialize and write tombstones, if any.
		const serializedTombstones =
			tombstones.length > 0 ? JSON.stringify(tombstones.sort()) : undefined;

		/**
		 * Incremental summary of GC data - If none of GC state, deleted nodes or tombstones changed since last summary,
		 * write summary handle instead of summary tree for GC.
		 * Otherwise, write the GC summary tree. In the tree, for each of these that changed, write a summary blob and
		 * for each of these that did not change, write a summary handle.
		 */
		if (trackState) {
			this.wipSummaryData = {
				serializedGCState,
				serializedTombstones,
				serializedDeletedNodes,
				recoveryGeneration,
			};
		}

		if (trackState && !fullTree && this.latestSummaryData !== undefined) {
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
		// Full-tree and untracked summaries must not reuse handles, even when the state is unchanged.
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
	 * Associate generated garbage-collection state with the same submitted proposal tracked by summarizer nodes.
	 * Full summaries also participate, although they cannot reuse handles during generation.
	 * The submitted capture is retained until its matching acknowledgment or a newer accepted proposal retires it.
	 */
	public completeSummary(proposalHandle: string, referenceSequenceNumber: number): void {
		if (!this.configs.gcAllowed) {
			return;
		}
		this.pendingSummaries.set(proposalHandle, {
			data: this.wipSummaryData,
			referenceSequenceNumber,
		});
		this.clearSummary();
	}

	/**
	 * Discard only the current generation's state.
	 * Submitted proposals remain available for a delayed acknowledgment after a failed attempt or retry.
	 */
	public clearSummary(): void {
		this.wipSummaryData = undefined;
	}

	/**
	 * Adopt the garbage-collection state captured for the acknowledged tracked proposal.
	 * Retire older captures in the same order as summarizer nodes, and ignore untracked acknowledgments.
	 *
	 * @returns The recovery generation completed before this proposal was generated, if any.
	 */
	public async refreshLatestSummary(
		result: IRefreshSummaryResult,
		proposalHandle: string,
	): Promise<number | undefined> {
		if (!this.configs.gcAllowed || !result.isSummaryTracked) {
			return;
		}

		const pending = this.pendingSummaries.get(proposalHandle);
		assert(pending !== undefined, "Tracked GC summary must have matching proposal state");
		this.latestSummaryData = pending.data;
		this.pendingSummaries.delete(proposalHandle);
		// Match the summarizer nodes' retirement of older pending proposals.
		for (const [handle, summary] of this.pendingSummaries) {
			if (summary.referenceSequenceNumber < pending.referenceSequenceNumber) {
				this.pendingSummaries.delete(handle);
			}
		}
		this.updatedDSCountSinceLastSummary = 0;
		return pending.data?.recoveryGeneration;
	}

	/**
	 * Called to update the state from a GC run's stats. Used to update the count of data stores whose state updated.
	 */

	public updateStateFromGCRunStats(stats: IGCStats): void {
		this.updatedDSCountSinceLastSummary += stats.updatedDataStoreCount;
	}
}
