/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

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
	for (const [_, id] of Object.entries(snapshotTree.blobs)) {
		if (!blobContents.has(id)) {
			return true;
		}
	}
	for (const [_, childTree] of Object.entries(snapshotTree.trees)) {
		// Only evaluate childTree if it does not have a loading groupId because if the childTree has a loading
		// groupId then it will be evaluated whether we want to fetch blobs for that childTree or not when
		// that particular childTree is getting realized. Now we just want to check for blobs which belongs to
		// tree with current loading groupId. Note: Child with no loading groupId, will fall under parent with
		// a loading groupId as it does not have its own loading groupId.
		if (childTree.groupId === undefined) {
			const value = isSnapshotFetchRequiredForLoadingGroupId(childTree, blobContents);
			if (value) {
				return true;
			}
		}
	}
	return false;
}
