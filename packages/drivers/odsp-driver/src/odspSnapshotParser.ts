/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import * as api from "@fluidframework/protocol-definitions";
import { ISnapshot } from "@fluidframework/driver-definitions";
import { IOdspSnapshot, IOdspSnapshotCommit } from "./contracts.js";

/**
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @returns the hierarchical tree
 */
function buildHierarchy(flatTree: IOdspSnapshotCommit): api.ISnapshotTree {
	const lookup: { [path: string]: api.ISnapshotTree } = {};
	// id is required for root tree as it will be used to determine the version we loaded from.
	const root: api.ISnapshotTree = { id: flatTree.id, blobs: {}, trees: {} };
	lookup[""] = root;

	for (const entry of flatTree.entries) {
		const lastIndex = entry.path.lastIndexOf("/");
		const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entry.path.slice(lastIndex + 1);

		// ODSP snapshots are created breadth-first so we can assume we see tree nodes prior to their contents
		const node = lookup[entryPathDir];

		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree: api.ISnapshotTree = {
				blobs: {},
				trees: {},
				unreferenced: entry.unreferenced,
				groupId: entry.groupId,
			};
			node.trees[decodeURIComponent(entryPathBase)] = newTree;
			lookup[entry.path] = newTree;
		} else if (entry.type === "blob") {
			node.blobs[decodeURIComponent(entryPathBase)] = entry.id;
		}
	}

	return root;
}

/**
 * Converts existing IOdspSnapshot to snapshot tree, blob array and ops
 * @param odspSnapshot - snapshot
 */
export function convertOdspSnapshotToSnapshotTreeAndBlobs(odspSnapshot: IOdspSnapshot): ISnapshot {
	const blobsWithBufferContent = new Map<string, ArrayBuffer>();
	if (odspSnapshot.blobs) {
		for (const blob of odspSnapshot.blobs) {
			assert(
				blob.encoding === "base64" || blob.encoding === undefined,
				0x0a4 /* Unexpected blob encoding type */,
			);
			blobsWithBufferContent.set(
				blob.id,
				stringToBuffer(blob.content, blob.encoding ?? "utf8"),
			);
		}
	}

	const sequenceNumber = odspSnapshot?.trees[0].sequenceNumber;

	const val: ISnapshot = {
		blobContents: blobsWithBufferContent,
		ops: odspSnapshot.ops?.map((op) => op.op) ?? [],
		sequenceNumber,
		snapshotTree: buildHierarchy(odspSnapshot.trees[0]),
		latestSequenceNumber:
			odspSnapshot.ops && odspSnapshot.ops.length > 0
				? odspSnapshot.ops[odspSnapshot.ops.length - 1].sequenceNumber
				: sequenceNumber,
		snapshotFormatV: 1,
	};
	return val;
}
