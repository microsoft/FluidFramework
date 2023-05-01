/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IWholeFlatSummary, IWholeFlatSummaryTree } from "@fluidframework/server-services-client";
import { stringToBuffer } from "@fluidframework/common-utils";
import { INormalizedWholeSummary } from "./contracts";

/**
 * Build a tree heirarchy from a flat tree.
 *
 * @param flatTree - a flat tree
 * @param treePrefixToRemove - tree prefix to strip
 * @returns the heirarchical tree
 */
function buildHierarchy(
	flatTree: IWholeFlatSummaryTree,
	treePrefixToRemove: string,
): ISnapshotTree {
	const lookup: { [path: string]: ISnapshotTree } = {};
	// Root tree id will be used to determine which version was downloaded.
	const root: ISnapshotTree = { id: flatTree.id, blobs: {}, trees: {} };
	lookup[""] = root;

	for (const entry of flatTree.entries) {
		// Strip the `treePrefixToRemove` path from tree entries such that they are stored under root.
		const entryPath = entry.path.replace(new RegExp(`^${treePrefixToRemove}/`), "");
		const lastIndex = entryPath.lastIndexOf("/");
		const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entryPath.slice(lastIndex + 1);

		// The flat output is breadth-first so we can assume we see tree nodes prior to their contents
		const node = lookup[entryPathDir];

		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree: ISnapshotTree = {
				blobs: {},
				trees: {},
				unreferenced: entry.unreferenced,
			};
			node.trees[decodeURIComponent(entryPathBase)] = newTree;
			lookup[entryPath] = newTree;
		} else if (entry.type === "blob") {
			node.blobs[decodeURIComponent(entryPathBase)] = entry.id;
		} else {
			throw new Error(`Unknown entry type!!`);
		}
	}

	return root;
}

/**
 * Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.
 *
 * @param flatSummary - flat summary
 * @param treePrefixToRemove - tree prefix to strip. By default we are stripping ".app" prefix
 * @returns snapshot tree, blob array, and sequence number
 */
export function convertWholeFlatSummaryToSnapshotTreeAndBlobs(
	flatSummary: IWholeFlatSummary,
	treePrefixToRemove: string = ".app",
): INormalizedWholeSummary {
	const blobs = new Map<string, ArrayBuffer>();
	if (flatSummary.blobs) {
		flatSummary.blobs.forEach((blob) => {
			blobs.set(blob.id, stringToBuffer(blob.content, blob.encoding ?? "utf-8"));
		});
	}
	const flatSummaryTree = flatSummary.trees?.[0];
	const sequenceNumber = flatSummaryTree?.sequenceNumber;
	const snapshotTree = buildHierarchy(flatSummaryTree, treePrefixToRemove);

	return {
		blobs,
		snapshotTree,
		sequenceNumber,
		id: flatSummary.id,
	};
}
