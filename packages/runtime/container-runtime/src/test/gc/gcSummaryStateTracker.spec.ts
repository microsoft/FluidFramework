/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SummaryType } from "@fluidframework/driver-definitions";
import {
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
} from "@fluidframework/runtime-definitions/internal";

import {
	GCSummaryStateTracker,
	IGCStats,
	IGarbageCollectionState,
	gcStateBlobKey,
	nextGCVersion,
} from "../../gc/index.js";

describe("GCSummaryStateTracker tests", () => {
	/**
	 * These tests validate that the GC data is written in summary incrementally. Basically, only parts of the GC
	 * data that has changed since the last successful summary is re-written, rest is written as SummaryHandle.
	 */
	describe("Incremental summary of GC data", () => {
		const nodes = ["node1", "node2", "node3"];
		const initialGCState: IGarbageCollectionState = {
			gcNodes: {
				"/": { outboundRoutes: [] },
				[nodes[0]]: { outboundRoutes: [] },
				[nodes[1]]: { outboundRoutes: [] },
			},
		};
		const initialTombstones: string[] = [nodes[0], nodes[1]];
		const initialDeletedNodes: Set<string> = new Set([nodes[1]]);
		let summaryStateTracker: GCSummaryStateTracker;

		beforeEach(async () => {
			// Creates a summary state tracker and initialize it.
			summaryStateTracker = new GCSummaryStateTracker({
				gcAllowed: true,
				gcVersionInBaseSnapshot: nextGCVersion,
				gcVersionInEffect: nextGCVersion,
			});

			summaryStateTracker.initializeBaseState({
				gcState: initialGCState,
				tombstones: initialTombstones,
				deletedNodes: Array.from(initialDeletedNodes),
			});
		});

		it("does incremental summary when nothing changes", async () => {
			// Summarize with the same GC state, tombstone state and deleted nodes as in the initial state.
			// The GC data should be summarized as a summary handle.
			const summary = summaryStateTracker.summarize(
				true /* trackState */,
				initialGCState,
				initialDeletedNodes,
				initialTombstones,
			);
			assert(summary?.summary.type === SummaryType.Handle, "GC summary should be a handle");
		});

		it("does incremental summary when only GC state changes", async () => {
			// Summarize with the same tombstone state and deleted nodes but different GC state as in the initial.
			// state. The GC state should be summarized as a summary handle.
			const newGCState: IGarbageCollectionState = {
				gcNodes: {
					...initialGCState.gcNodes,
					[nodes[2]]: { outboundRoutes: [] },
				},
			};
			const summary = summaryStateTracker.summarize(
				true /* trackState */,
				newGCState,
				initialDeletedNodes,
				initialTombstones,
			);
			assert(summary?.summary.type === SummaryType.Tree, "GC summary should be a tree");
			assert(
				summary.summary.tree[gcStateBlobKey].type === SummaryType.Blob,
				"GC state should be written as a blob",
			);
			assert(
				summary.summary.tree[gcTombstoneBlobKey].type === SummaryType.Handle,
				"Tombstone state should be written as handle",
			);
			assert(
				summary.summary.tree[gcDeletedBlobKey].type === SummaryType.Handle,
				"Deleted nodes should be written as handle",
			);
		});

		it("does incremental summary when only tombstone state changes", async () => {
			// Summarize with the same GC state and deleted nodes but different tombstone state as in the initial.
			// state. The tombstone state should be summarized as a summary handle.
			const newTombstones: string[] = Array.from([...initialTombstones, nodes[2]]);
			const summary = summaryStateTracker.summarize(
				true /* trackState */,
				initialGCState,
				initialDeletedNodes,
				newTombstones,
			);
			assert(summary?.summary.type === SummaryType.Tree, "GC summary should be a tree");
			assert(
				summary.summary.tree[gcStateBlobKey].type === SummaryType.Handle,
				"GC state should be written as handle",
			);
			assert(
				summary.summary.tree[gcTombstoneBlobKey].type === SummaryType.Blob,
				"Tombstone state should be written as a blob",
			);
			assert(
				summary.summary.tree[gcDeletedBlobKey].type === SummaryType.Handle,
				"Deleted nodes should be written as handle",
			);
		});

		it("does incremental summary when only deleted nodes change", async () => {
			// Summarize with the same GC state and tombstone state but different deleted nodes as in the initial.
			// state. The deleted nodes should be summarized as a summary handle.
			const newDeletedNodes: Set<string> = new Set(...initialDeletedNodes, nodes[2]);
			const summary = summaryStateTracker.summarize(
				true /* trackState */,
				initialGCState,
				newDeletedNodes,
				initialTombstones,
			);
			assert(summary?.summary.type === SummaryType.Tree, "GC summary should be a tree");
			assert(
				summary.summary.tree[gcStateBlobKey].type === SummaryType.Handle,
				"GC state should be written as handle",
			);
			assert(
				summary.summary.tree[gcTombstoneBlobKey].type === SummaryType.Handle,
				"Tombstone state should be written as handle",
			);
			assert(
				summary.summary.tree[gcDeletedBlobKey].type === SummaryType.Blob,
				"Deleted nodes should be written as a blob",
			);
		});
	});

	it("updates state updated data store count correctly", async () => {
		const updatedDataStoreCount = 10;
		const gcStats: IGCStats = {
			nodeCount: 0,
			unrefNodeCount: 0,
			updatedNodeCount: 0,
			dataStoreCount: 0,
			unrefDataStoreCount: 0,
			updatedDataStoreCount,
			attachmentBlobCount: 0,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 0,
			lifetimeNodeCount: 0,
			lifetimeDataStoreCount: 0,
			lifetimeAttachmentBlobCount: 0,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		const summaryStateTracker = new GCSummaryStateTracker({
			gcAllowed: true,
			gcVersionInBaseSnapshot: nextGCVersion,
			gcVersionInEffect: nextGCVersion,
		});

		let expectedUpdatedDataStoreCount = updatedDataStoreCount;
		// Update the state from GC stats and validate it's the same as updatedDataStoreCount.
		summaryStateTracker.updateStateFromGCRunStats(gcStats);
		assert.strictEqual(
			summaryStateTracker.updatedDSCountSinceLastSummary,
			expectedUpdatedDataStoreCount,
			"Updated DS count is not correct",
		);

		// Call summarize but do not refresh latest summary. This mimics scenarios where summary generation fails
		// sometime after summarize. This means updatedDSCountSinceLastSummary should be updated incrementally
		// without resetting it.
		summaryStateTracker.summarize(true /* trackState */, { gcNodes: {} }, new Set(), []);

		// Update the stat from GC state again mimicking a GC run after a failed summary.
		expectedUpdatedDataStoreCount += updatedDataStoreCount;
		summaryStateTracker.updateStateFromGCRunStats(gcStats);
		assert.strictEqual(
			summaryStateTracker.updatedDSCountSinceLastSummary,
			expectedUpdatedDataStoreCount,
			"Updated DS count should have been incrementally updated",
		);

		// Call summarize and refresh latest summary. This mimics a successful summary after a failed one. After
		// this, updatedDSCountSinceLastSummary should be reset to 0.
		summaryStateTracker.summarize(true /* trackState */, { gcNodes: {} }, new Set(), []);

		await summaryStateTracker.refreshLatestSummary({
			isSummaryTracked: true,
			isSummaryNewer: true,
		});
		assert.strictEqual(
			summaryStateTracker.updatedDSCountSinceLastSummary,
			0,
			"Updated DS count should be reset after refresh latest summary",
		);
	});
});
