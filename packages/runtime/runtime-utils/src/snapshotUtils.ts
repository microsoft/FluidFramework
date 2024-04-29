/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISnapshotTree } from "@fluidframework/protocol-definitions";

/**
 * Utility function to check if any blobs under a snapshot tree is missing and if so, then return
 * true if that is the case.
 * @internal
 * @param snapshotTree - snapshotTree to be evaluated for missing blobs.
 * @param blobContents - blobContents of the snapshot.
 */
export function isSnapshotFetchRequiredForLoadingGroupId(
	snapshotTree: ISnapshotTree,
	blobContents: Map<string, ArrayBuffer>,
): boolean {
	return evaluateSnapshotTreeForMissingBlobs(snapshotTree, blobContents);
}

function evaluateSnapshotTreeForMissingBlobs(
	snapshotTree: ISnapshotTree,
	blobContents: Map<string, ArrayBuffer>,
): boolean {
	for (const [_, id] of Object.entries(snapshotTree.blobs)) {
		if (!blobContents.has(id)) {
			return true;
		}
	}
	for (const [_, childTree] of Object.entries(snapshotTree.trees)) {
		// Only evaluate childTree if it does not have a loading groupId.
		if (childTree.groupId === undefined) {
			const value = evaluateSnapshotTreeForMissingBlobs(childTree, blobContents);
			if (value) {
				return true;
			}
		}
	}
	return false;
}
