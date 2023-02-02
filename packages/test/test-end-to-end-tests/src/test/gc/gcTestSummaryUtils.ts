/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
	gcBlobPrefix,
	gcTombstoneBlobKey,
	gcTreeKey,
	IGarbageCollectionState,
} from "@fluidframework/runtime-definitions";

/**
 * Returns the garbage collection state from the GC tree in the summary.
 * Note that it assumes that all the GC data in the GC tree are summary trees or blobs and not summary handles.
 * @param summaryTree - The summary tree that contains the GC summary.
 * @returns The GC state if the GC summary tree exists, undefined otherwise.
 */
export function getGCStateFromSummary(
	summaryTree: ISummaryTree,
): IGarbageCollectionState | undefined {
	const rootGCTree = summaryTree.tree[gcTreeKey];
	if (rootGCTree === undefined) {
		return undefined;
	}
	assert(rootGCTree.type === SummaryType.Tree, `GC data should be a tree`);

	let rootGCState: IGarbageCollectionState = { gcNodes: {} };
	for (const key of Object.keys(rootGCTree.tree)) {
		// Skip blobs that do not start with the GC prefix.
		if (!key.startsWith(gcBlobPrefix)) {
			continue;
		}

		const gcBlob = rootGCTree.tree[key];
		assert(gcBlob !== undefined, "GC state not available");
		assert(gcBlob.type === SummaryType.Blob, "GC state is not a blob");
		const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
		// Merge the GC state of this blob into the root GC state.
		rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
	}
	return rootGCState;
}

/**
 * Returns the tombstone data from the GC tree in the summary.
 * Note that it assumes that the tombstone data in the GC tree is a summary blob and not summary handle.
 * @param summaryTree - The summary tree that contains the GC summary.
 * @returns The tombstone data if it exists, undefined otherwise.
 */
export function getGCTombstoneStateFromSummary(summaryTree: ISummaryTree): string[] | undefined {
	const rootGCTree = summaryTree.tree[gcTreeKey];
	if (rootGCTree === undefined) {
		return undefined;
	}

	assert(rootGCTree.type === SummaryType.Tree, "GC data should be a tree");
	const tombstoneBlob = rootGCTree.tree[gcTombstoneBlobKey];
	if (tombstoneBlob === undefined) {
		return undefined;
	}

	assert(tombstoneBlob.type === SummaryType.Blob, "Tombstone state is not a blob");
	return JSON.parse(tombstoneBlob.content as string) as string[];
}
