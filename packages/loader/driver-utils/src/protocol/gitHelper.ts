/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	FileMode,
	IGitTree,
	ISnapshotTreeEx,
	SummaryType,
	SummaryObject,
} from "@fluidframework/driver-definitions/internal";

/**
 * Take a summary object and returns its git mode.
 *
 * @param value - summary object
 * @returns the git mode of summary object
 * @internal
 */
export function getGitMode(value: SummaryObject): string {
	const type = value.type === SummaryType.Handle ? value.handleType : value.type;
	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return FileMode.File;
		case SummaryType.Tree:
			return FileMode.Directory;
		default:
			unreachableCase(type, `Unknown type: ${type}`);
	}
}

/**
 * Take a summary object and returns its type.
 *
 * @param value - summary object
 * @returns the type of summary object
 * @internal
 */
export function getGitType(value: SummaryObject): "blob" | "tree" {
	const type = value.type === SummaryType.Handle ? value.handleType : value.type;

	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return "blob";
		case SummaryType.Tree:
			return "tree";
		default:
			unreachableCase(type, `Unknown type: ${type}`);
	}
}

/**
 * NOTE: Renamed from `buildHierarchy` to `buildGitTreeHierarchy`. There is usage of this function in loader and driver layer.
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @param removeAppTreePrefix - Remove `.app/` from beginning of paths when present
 * @returns the hierarchical tree
 * @internal
 */
export function buildGitTreeHierarchy(
	flatTree: IGitTree,
	blobsShaToPathCache: Map<string, string> = new Map<string, string>(),
	removeAppTreePrefix = false,
): ISnapshotTreeEx {
	const lookup: { [path: string]: ISnapshotTreeEx } = {};
	const root: ISnapshotTreeEx = { id: flatTree.sha, blobs: {}, trees: {} };
	lookup[""] = root;

	for (const entry of flatTree.tree) {
		const entryPath = removeAppTreePrefix ? entry.path.replace(/^\.app\//, "") : entry.path;
		const lastIndex = entryPath.lastIndexOf("/");
		const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entryPath.slice(lastIndex + 1);

		// The flat output is breadth-first so we can assume we see tree nodes prior to their contents
		const node: ISnapshotTreeEx | undefined = lookup[entryPathDir];

		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree = { id: entry.sha, blobs: {}, commits: {}, trees: {} };
			node.trees[decodeURIComponent(entryPathBase)] = newTree;
			lookup[entryPath] = newTree;
		} else if (entry.type === "blob") {
			node.blobs[decodeURIComponent(entryPathBase)] = entry.sha;
			blobsShaToPathCache.set(entry.sha, `/${entryPath}`);
		} else {
			throw new Error("Unknown entry type!!");
		}
	}

	return root;
}
