/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree, ITreeEntry } from "@fluidframework/gitresources";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
	IWholeFlatSummaryBlob,
	IWholeFlatSummaryTreeEntry,
	IWholeSummaryBlob,
	IWholeSummaryTree,
	IWholeSummaryTreeHandleEntry,
	IWholeSummaryTreeValueEntry,
	NetworkError,
	WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { IRepositoryManager } from "../definitions";
import { IFullGitTree } from "./definitions";
import { Constants } from "./constants";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * A representation of an IFullGitTree in summary format that
 * can be understood by Fluid. This heirarchical format is
 * useful for converting to/from client summary format and Git summary format.
 */
export interface IFullSummaryTree {
	treeEntries: IWholeFlatSummaryTreeEntry[];
	blobs: IWholeFlatSummaryBlob[];
}

/**
 * Package a Git tree into a Full Git Tree object by (optionally) parsing and unpacking
 * inner full git tree blobs and (optionally) retrieving all referenced blobs from storage.
 *
 * @param gitTree - Git tree object containing tree entries
 * @param repoManager - Repository manager to use for retrieving referenced blobs
 * @param parseInnerFullGitTrees - Whether to parse and unpack inner full git tree blobs
 * @param retrieveBlobs - Whether to retrieve blobs (other than full git trees) from storage
 * @param depth - internally tracks recursion depth for potential future logging or protection
 */
export async function buildFullGitTreeFromGitTree(
	gitTree: ITree,
	repoManager: IRepositoryManager,
	blobCache: Record<string, IBlob> = {},
	parseInnerFullGitTrees = true,
	retrieveBlobs = true,
	depth = 0,
): Promise<IFullGitTree> {
	let parsedFullTreeBlobs = false;
	const blobPs: Promise<IBlob>[] = [];
	const treeEntries: ITreeEntry[] = [];
	const getBlob = async (sha: string): Promise<IBlob> =>
		blobCache[sha] ?? repoManager.getBlob(sha);
	for (const treeEntry of gitTree.tree) {
		if (treeEntry.type === "blob") {
			if (treeEntry.path.endsWith(Constants.FullTreeBlobPath) && parseInnerFullGitTrees) {
				parsedFullTreeBlobs = true;
				const fullTreeBlob = await getBlob(treeEntry.sha);
				const fullTree = JSON.parse(
					fullTreeBlob.encoding === "base64"
						? // Convert base64 to utf-8 for JSON parsing
						  Buffer.from(fullTreeBlob.content, fullTreeBlob.encoding).toString("utf-8")
						: fullTreeBlob.content,
				) as IFullGitTree;
				const builtFullGitTree = await buildFullGitTreeFromGitTree(
					fullTree.tree,
					repoManager,
					blobCache,
					true /* parseInnerFullGitTrees */,
					// All blobs associated with full git tree are included in the full git tree blob, and
					// will not exists in storage individually.
					false /* retrieveBlobs */,
					depth + 1,
				);
				const baseTreeEntryPath = treeEntry.path.replace(Constants.FullTreeBlobPath, "");
				treeEntries.push(
					...builtFullGitTree.tree.tree.map((fullTreeEntry) => ({
						...fullTreeEntry,
						path: `${baseTreeEntryPath}${fullTreeEntry.path}`,
					})),
				);
				const fullTreeBlobs = {
					...fullTree.blobs,
					...builtFullGitTree.blobs,
				};
				blobPs.push(...Object.values(fullTreeBlobs).map(async (blob) => blob));
				continue;
			} else if (retrieveBlobs) {
				blobPs.push(getBlob(treeEntry.sha));
			}
		}
		treeEntries.push(treeEntry);
	}
	const blobs = await Promise.all(blobPs);
	const blobMap = {};
	blobs.forEach((blob) => (blobMap[blob.sha] = blob));
	return {
		tree: {
			sha: gitTree.sha,
			url: gitTree.url,
			tree: treeEntries,
		},
		blobs: blobMap,
		parsedFullTreeBlobs,
	};
}

/**
 * Convert a Git blob object into Summary blob format.
 *
 * @param blob - Git blob to convert to summary blob
 * @returns summary blob
 */
function convertGitBlobToSummaryBlob(blob: IBlob): IWholeFlatSummaryBlob {
	return {
		content: blob.content,
		encoding: blob.encoding === "base64" ? "base64" : "utf-8",
		id: blob.sha,
		size: blob.size,
	};
}

/**
 * Convert a Full Git tree into summary format for use in Fluid.
 *
 * @param fullGitTree - Full Git tree to convert
 * @returns summary tree
 */
export function convertFullGitTreeToFullSummaryTree(fullGitTree: IFullGitTree): IFullSummaryTree {
	const wholeFlatSummaryTreeEntries: IWholeFlatSummaryTreeEntry[] = [];
	const wholeFlatSummaryBlobs: IWholeFlatSummaryBlob[] = [];
	fullGitTree.tree.tree.forEach((treeEntry) => {
		if (treeEntry.type === "blob") {
			wholeFlatSummaryTreeEntries.push({
				type: "blob",
				id: treeEntry.sha,
				path: treeEntry.path,
			});
			wholeFlatSummaryBlobs.push(
				convertGitBlobToSummaryBlob(fullGitTree.blobs[treeEntry.sha]),
			);
		} else {
			wholeFlatSummaryTreeEntries.push({
				type: "tree",
				path: treeEntry.path,
			});
		}
	});
	return {
		treeEntries: wholeFlatSummaryTreeEntries,
		blobs: wholeFlatSummaryBlobs,
	};
}

/**
 * Convert a Full Summary tree into a Full Summary payload, which can then be used to
 * write that full summary into an alternate storage repo (e.g. in-memory)
 *
 * @param fullSummaryTree - Full summary tree to parse into a full summary payload
 * @returns full summary as a write payload
 */
export function convertFullSummaryToWholeSummaryEntries(
	fullSummaryTree: IFullSummaryTree,
): WholeSummaryTreeEntry[] {
	const fullSummaryBlobMap = new Map<string, IWholeSummaryBlob>();
	fullSummaryTree.blobs.forEach((fullSummaryBlob) => {
		fullSummaryBlobMap.set(fullSummaryBlob.id, {
			type: "blob",
			content: fullSummaryBlob.content,
			encoding: fullSummaryBlob.encoding,
		});
	});

	// Inspired by `buildSummaryTreeHierarchy` from services-client
	const lookup: { [path: string]: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree } } =
		{};
	const rootPath = ""; // This would normally be parentHandle, but only important when there are handles
	const root: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree } = {
		type: "tree",
		path: rootPath,
		value: {
			type: "tree",
			entries: [],
		},
	};
	lookup[rootPath] = root;
	for (const entry of fullSummaryTree.treeEntries) {
		const entryPath = entry.path;
		const lastIndex = entryPath.lastIndexOf("/");
		const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entryPath.slice(lastIndex + 1);

		// The flat output is breadth-first so we can assume we see tree nodes prior to their contents
		const node = lookup[entryPathDir];
		if (!node.value.entries) {
			node.value.entries = [];
		}
		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree } = {
				type: "tree",
				path: entryPathBase,
				value: {
					type: "tree",
					entries: [],
				},
			};
			node.value.entries.push(newTree);
			lookup[entryPath] = newTree;
		} else if (entry.type === "blob") {
			const fullSummaryBlob = fullSummaryBlobMap.get(entry.id);
			if (!fullSummaryBlob) {
				throw new Error(`Could not find blob ${entry.id} in full summary`);
			}
			const newBlob: IWholeSummaryTreeValueEntry & { value: IWholeSummaryBlob } = {
				type: "blob",
				path: entryPathBase,
				value: fullSummaryBlob,
			};
			node.value.entries.push(newBlob);
		} else {
			throw new Error(`Unknown entry type!!`);
		}
	}
	return root.value.entries ?? [];
}

/**
 * Convert a Summary Tree Entry into a SummaryObject for type reference.
 */
export function convertWholeSummaryTreeEntryToSummaryObject(
	entry: WholeSummaryTreeEntry,
): SummaryObject {
	if ((entry as IWholeSummaryTreeHandleEntry).id !== undefined) {
		return {
			type: SummaryType.Handle,
			handleType: entry.type === "tree" ? SummaryType.Tree : SummaryType.Blob,
			handle: (entry as IWholeSummaryTreeHandleEntry).id,
		};
	}
	if (entry.type === "blob") {
		return {
			type: SummaryType.Blob,
			// We don't use this in the code below. We mostly just care about summaryObject for type inference.
			content: "",
		};
	}
	if (entry.type === "tree") {
		return {
			type: SummaryType.Tree,
			// We don't use this in the code below. We mostly just care about summaryObject for type inference.
			tree: {},
			unreferenced: (entry as IWholeSummaryTreeValueEntry).unreferenced,
		};
	}
	Lumberjack.error("Unknown entry type", { entryType: entry.type });
	throw new NetworkError(400, `Unknown entry type: ${entry.type}`);
}
