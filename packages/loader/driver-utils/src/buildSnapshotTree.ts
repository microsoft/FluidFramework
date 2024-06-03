/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IGitTree, IGitTreeEntry } from "@fluidframework/driver-definitions/internal";
import {
	FileMode,
	ISnapshotTree,
	ITreeEntry,
	TreeEntry,
} from "@fluidframework/driver-definitions/internal";
import { buildGitTreeHierarchy } from "@fluidframework/protocol-base";
import { v4 as uuid } from "uuid";

function flattenCore(
	path: string,
	treeEntries: ITreeEntry[],
	blobMap: Map<string, ArrayBufferLike>,
): IGitTreeEntry[] {
	const entries: IGitTreeEntry[] = [];
	for (const treeEntry of treeEntries) {
		const subPath = `${path}${treeEntry.path}`;

		if (treeEntry.type === TreeEntry.Blob) {
			const blob = treeEntry.value;
			const buffer = stringToBuffer(blob.contents, blob.encoding);
			const id = uuid();
			blobMap.set(id, buffer);

			const entry: IGitTreeEntry = {
				mode: FileMode[treeEntry.mode],
				path: subPath,
				sha: id,
				size: 0,
				type: "blob",
				url: "",
			};
			entries.push(entry);
		} else if (treeEntry.type === TreeEntry.Tree) {
			assert(
				treeEntry.type === TreeEntry.Tree,
				0x101 /* "Unexpected tree entry type on flatten!" */,
			);
			const t = treeEntry.value;
			const entry: IGitTreeEntry = {
				mode: FileMode[treeEntry.mode],
				path: subPath,
				sha: "",
				size: -1,
				type: "tree",
				url: "",
			};
			entries.push(entry);

			const subTreeEntries = flattenCore(`${subPath}/`, t.entries, blobMap);
			entries.push(...subTreeEntries);
		}
	}

	return entries;
}

/**
 * Create a flatten view of an array of ITreeEntry
 *
 * @param tree - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content
 * @returns A flatten with of the ITreeEntry
 */
function flatten(tree: ITreeEntry[], blobMap: Map<string, ArrayBufferLike>): IGitTree {
	const entries = flattenCore("", tree, blobMap);
	return {
		sha: "",
		tree: entries,
		url: "",
	};
}

/**
 * Build a tree hierarchy base on an array of ITreeEntry
 *
 * @param entries - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content that gets filled with content from entries
 * NOTE: blobMap's validity is contingent on the returned promise's resolution
 * @returns the hierarchical tree
 * @internal
 */
export function buildSnapshotTree(
	entries: ITreeEntry[],
	blobMap: Map<string, ArrayBufferLike>,
): ISnapshotTree {
	const flattened = flatten(entries, blobMap);
	return buildGitTreeHierarchy(flattened);
}
