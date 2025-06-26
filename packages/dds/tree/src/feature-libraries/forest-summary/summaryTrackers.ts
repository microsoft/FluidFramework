/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import {
	getOrCreateInNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
	type NestedMap,
} from "../../util/index.js";

/**
 * The key for the incremental summary tree in the forest summary.
 * This is used to identify the tree that contains the incremental fields.
 */
export const incrementalFieldsTreeKey = "IncrementalFields";

/**
 * State that tells whether a summary is currently being tracked.
 */
export const TreeSummaryState = {
	// A summary is currently being tracked.
	Tracking: "Tracking",
	// A summary is ready to be tracked.
	ReadyToTrack: "ReadyToTrack",
} as const;
export type TreeSummaryState = (typeof TreeSummaryState)[keyof typeof TreeSummaryState];

/**
 * This class tracks the reference IDs of subtrees in the incremental summary tree for a forest.
 * It allows us to generate summary handle paths for subtrees that are not included in the current summary
 * but were included in the previous one.
 */
export class TreeIncrementalSummaryTracker {
	/**
	 * For a given summary sequence number, keeps track of the parent tree's reference ID for a subtree's reference Id
	 * in that summary's incremental summary tree.
	 */
	private readonly refIdToParentRefIdTracker: NestedMap<number, string, string> = new Map();

	/**
	 * For a given summary sequence number, keeps track of the reference IDs of all child subtrees for a parent
	 * tree's reference ID in that summary's incremental summary tree.
	 */
	private readonly parentRefIdToRefIdsTracker: NestedMap<number, string, Set<string>> =
		new Map();

	/**
	 * The sequence number of the previous summary. This is tracked so that we can copy the reference ID mappings of
	 * subtrees that did not change since the previous summary. These subtrees won't be encoded in the current summary
	 * so the encoded data will not include their reference IDs, but we still need to track them in case we need to
	 * generate a summary handle path for them in the future.
	 */
	private previousSummarySequenceNumber: number = -1;

	/**
	 * The sequence number of the summary currently in progress.
	 */
	private currentSummarySequenceNumber: number = -1;

	/**
	 * The sequence number of the latest summary that was successful.
	 */
	private latestSummarySequenceNumber: number = -1;

	/**
	 * The state indicating whether a summary is currently being tracked or not.
	 */
	private summaryState: TreeSummaryState = TreeSummaryState.ReadyToTrack;

	/**
	 * Must be called before starting to track a new summary.
	 * @param incrementalSummaryContext - The context for the incremental summary that contains the sequence numbers
	 * for the current and latest summaries.
	 */
	public startTracking(
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext,
	): void {
		assert(
			this.summaryState === TreeSummaryState.ReadyToTrack,
			"Summary tracking must be ready before starting a new tracking session.",
		);

		this.summaryState = TreeSummaryState.Tracking;
		this.currentSummarySequenceNumber = incrementalSummaryContext.summarySequenceNumber;
		this.latestSummarySequenceNumber = incrementalSummaryContext.latestSummarySequenceNumber;
	}

	/**
	 * Tracks a reference ID and its parent reference ID in the incremental summary tree.
	 * @param refId - The reference ID of the subtree being tracked.
	 * @param parentRefId - The reference ID of the subtree's parent tree.
	 */
	public trackReferenceId(refId: string, parentRefId: string): void {
		assert(
			this.summaryState === TreeSummaryState.Tracking,
			"Summary tracking must be in progress to track a reference ID.",
		);

		setInNestedMap(
			this.refIdToParentRefIdTracker,
			this.currentSummarySequenceNumber,
			refId,
			parentRefId,
		);
		const refIds = getOrCreateInNestedMap(
			this.parentRefIdToRefIdsTracker,
			this.currentSummarySequenceNumber,
			parentRefId,
			(sequenceNumber, parentId) => new Set(),
		);
		refIds.add(refId);
	}

	/**
	 * Returns the path for a given reference ID in the last successful summary's incremental summary tree.
	 * This will be used to generate a summary handle path for the subtree with the given reference ID.
	 * @param refId - The reference ID of the subtree for which we want to get the summary handle path.
	 * @param baseSummaryPath - The base path for the summary handle, which is typically the path to the incremental summary tree.
	 */
	public getLastSummaryPath(refId: string, baseSummaryPath: string): string | undefined {
		// Recursively build the path by getting the parent reference IDs until we reach the root of the incremental
		// summary tree (which has / as its parent reference ID).
		let parentRefId = tryGetFromNestedMap(
			this.refIdToParentRefIdTracker,
			this.latestSummarySequenceNumber,
			refId,
		);
		let summaryHandlePath = `${incrementalFieldsTreeKey}/${refId}`;
		while (parentRefId !== "/" && parentRefId !== undefined) {
			summaryHandlePath = `${incrementalFieldsTreeKey}/${parentRefId}/${summaryHandlePath}`;
			parentRefId = tryGetFromNestedMap(
				this.refIdToParentRefIdTracker,
				this.latestSummarySequenceNumber,
				parentRefId,
			);
		}
		if (parentRefId === undefined) {
			return undefined;
		}
		return `${baseSummaryPath}/${summaryHandlePath}`;
	}

	/**
	 * This method should be called once summary is complete so that it can update the summary sequence numbers
	 * it is tracking.
	 */
	public completeTracking(): void {
		assert(
			this.summaryState === TreeSummaryState.Tracking,
			"Summary tracking must be in progress to update summary sequence numbers.",
		);

		// When encoding the forest, the tree is traversed in some order (e.g., depth-first) until we encounter
		// fields that has not changed and that subtree is not traversed any further. However, we still need to
		// track the reference IDs of those subtrees so that we can generate summary handle paths for them in the
		// future. Since these subtrees are unchanged, their reference IDs are also unchanged. So, we can copy
		// their reference ID mappings from the previous summary's tracker to the current one.
		const previousParentRefIdToRefIsdMap = this.parentRefIdToRefIdsTracker.get(
			this.previousSummarySequenceNumber,
		);
		if (previousParentRefIdToRefIsdMap !== undefined) {
			const currentRefIdToParentRefIdMap = this.refIdToParentRefIdTracker.get(
				this.currentSummarySequenceNumber,
			);
			assert(
				currentRefIdToParentRefIdMap !== undefined,
				"Tracker for current summary sequence number must exist",
			);

			// Use the reference IDs in the current summary as parent reference IDs in the previous summary to
			// get the reference IDs of their children subtrees. Then for those children, get the reference IDs of
			// their children and so on.
			const refIdsInCurrentSummary = Array.from(currentRefIdToParentRefIdMap.keys());
			let parentRefIdInPreviousSummary: string | undefined;
			while ((parentRefIdInPreviousSummary = refIdsInCurrentSummary.shift()) !== undefined) {
				const refIdsInPreviousSummary = previousParentRefIdToRefIsdMap.get(
					parentRefIdInPreviousSummary,
				);
				// The reference IDs for subtrees that changed will have updated. So, there will no entry for them
				// in the previous summary's tracker. We can skip them.
				if (refIdsInPreviousSummary === undefined) {
					continue;
				}

				for (const refIdInPreviousSummary of refIdsInPreviousSummary) {
					this.trackReferenceId(refIdInPreviousSummary, parentRefIdInPreviousSummary);
				}
				refIdsInCurrentSummary.push(...refIdsInPreviousSummary);
			}
		}

		this.previousSummarySequenceNumber = this.currentSummarySequenceNumber;

		// We can delete the trackers for summaries that are older that the latest successful one because those will
		// not be referenced to generate summary handle paths in the future.
		this.refIdToParentRefIdTracker.forEach((_, sequenceNumber) => {
			if (sequenceNumber < this.latestSummarySequenceNumber) {
				this.refIdToParentRefIdTracker.delete(sequenceNumber);
			}
		});
		this.parentRefIdToRefIdsTracker.forEach((_, sequenceNumber) => {
			if (sequenceNumber < this.latestSummarySequenceNumber) {
				this.parentRefIdToRefIdsTracker.delete(sequenceNumber);
			}
		});

		this.summaryState = TreeSummaryState.ReadyToTrack;
	}
}
