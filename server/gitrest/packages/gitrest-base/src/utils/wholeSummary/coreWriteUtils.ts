/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ICreateTreeEntry, ITree, ITreeEntry } from "@fluidframework/gitresources";
import {
	IWholeSummaryBlob,
	IWholeSummaryTree,
	IWholeSummaryTreeHandleEntry,
	IWholeSummaryTreeValueEntry,
	NetworkError,
	WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { IRepositoryManager } from "../definitions";
import { IFullGitTree } from "./definitions";
import {
	buildFullGitTreeFromGitTree,
	convertFullGitTreeToFullSummaryTree,
	convertFullSummaryToWholeSummaryEntries,
	convertWholeSummaryTreeEntryToSummaryObject,
} from "./conversions";

export interface IWriteSummaryTreeOptions {
	repoManager: IRepositoryManager;
	precomputeFullTree: boolean;
	currentPath: string;
	enableLowIoWrite: boolean;
	treeCache: Record<string, ITree>;
	blobCache: Record<string, IBlob>;
	entryHandleToObjectShaCache: Map<string, string>;
}

export async function writeFullGitTreeAsSummaryTree(
	fullGitTree: IFullGitTree,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const fullSummaryTree = convertFullGitTreeToFullSummaryTree(fullGitTree);
	const wholeSummaryTreeEntries = convertFullSummaryToWholeSummaryEntries(fullSummaryTree);
	const tree = await writeSummaryTree(wholeSummaryTreeEntries, options);
	return tree.tree.sha;
}

async function writeSummaryTreeBlob(
	blob: IWholeSummaryBlob,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const blobResponse = await options.repoManager.createBlob({
		content: blob.content,
		encoding: blob.encoding,
	});
	const sha = blobResponse.sha;
	// Store blob in cache for use upstream
	options.blobCache[sha] = {
		content: blob.content,
		encoding: blob.encoding,
		sha,
		url: blobResponse.url,
		size: blob.content.length,
	};
	return sha;
}
async function writeSummaryTreeTree(
	tree: IWholeSummaryTree,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const fullGitTree = await writeSummaryTree(tree.entries ?? [], options);
	const sha = fullGitTree.tree.sha;
	options.treeCache[sha] = {
		sha,
		url: fullGitTree.tree.url,
		tree: fullGitTree.tree.tree,
	};
	return sha;
}

async function getShaFromTreeHandleEntry(
	entry: IWholeSummaryTreeHandleEntry,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	if (!entry.id) {
		throw new NetworkError(400, `Empty summary tree handle`);
	}
	if (entry.id.split("/").length === 1) {
		// The entry id is already a sha, so just return it
		return entry.id;
	}

	const cachedSha = options.entryHandleToObjectShaCache.get(entry.id);
	if (cachedSha) {
		return cachedSha;
	}

	// The entry is in the format { id: `<parent commit sha>/<tree path>`, path: `<tree path>` }
	const parentHandle = entry.id.split("/")[0];
	// Must use `this.repoManager` to ensure that we retrieve the shas from storage, not memory
	const parentCommit = await options.repoManager.getCommit(parentHandle);
	const parentTree = await options.repoManager.getTree(
		parentCommit.tree.sha,
		true /* recursive */,
	);
	const gitTree: IFullGitTree = await buildFullGitTreeFromGitTree(
		parentTree,
		options.repoManager,
		options.blobCache /* blobCache */,
		// Parse inner git tree blobs so that we can properly reference blob shas in new summary.
		true /* parseInnerFullGitTrees */,
		// We only need shas here, so don't waste resources retrieving blobs that are not included in fullGitTrees.
		false /* retrieveBlobs */,
	);
	if (gitTree.parsedFullTreeBlobs && options.enableLowIoWrite !== true) {
		// If the git tree/blob shas being referenced by a shredded summary write (high-io write) with handles
		// are hidden within a fullGitTree blob, we need to write those hidden blobs as individual trees/blobs
		// into storage so that they can be appropriately referenced by the uploaded summary tree.
		await writeFullGitTreeAsSummaryTree(gitTree, options);
	}
	for (const treeEntry of gitTree.tree.tree) {
		options.entryHandleToObjectShaCache.set(`${parentHandle}/${treeEntry.path}`, treeEntry.sha);
	}
	const sha = options.entryHandleToObjectShaCache.get(entry.id);
	if (!sha) {
		throw new NetworkError(
			404,
			`Summary tree handle object not found: id: ${entry.id}, path: ${entry.path}`,
		);
	}
	return sha;
}

async function writeSummaryTreeObject(
	wholeSummaryTreeEntry: WholeSummaryTreeEntry,
	options: IWriteSummaryTreeOptions,
): Promise<ICreateTreeEntry> {
	const summaryObject = convertWholeSummaryTreeEntryToSummaryObject(wholeSummaryTreeEntry);
	const type = getGitType(summaryObject);
	const path = wholeSummaryTreeEntry.path;
	const fullPath = options.currentPath
		? `${options.currentPath}/${wholeSummaryTreeEntry.path}`
		: wholeSummaryTreeEntry.path;
	const mode = getGitMode(summaryObject);

	let sha: string;
	// eslint-disable-next-line unicorn/prefer-switch
	if (summaryObject.type === SummaryType.Blob) {
		const blob = (wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
			.value as IWholeSummaryBlob;
		sha = await writeSummaryTreeBlob(blob, options);
	} else if (summaryObject.type === SummaryType.Tree) {
		const tree = (wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
			.value as IWholeSummaryTree;
		sha = await writeSummaryTreeTree(tree, { ...options, currentPath: fullPath });
	} else if (summaryObject.type === SummaryType.Handle) {
		sha = await getShaFromTreeHandleEntry(
			wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry,
			options,
		);
	} else {
		// Invalid/unimplemented summary object type
		throw new NetworkError(501, "Not Implemented");
	}

	const createEntry: ICreateTreeEntry = {
		mode,
		path,
		sha,
		type,
	};
	return createEntry;
}

async function precomputeFullGitTree(
	newlyCreatedTree: ITree,
	options: IWriteSummaryTreeOptions,
): Promise<IFullGitTree> {
	const retrieveEntries = async (tree: ITree, path: string = ""): Promise<ITreeEntry[]> => {
		const treeEntries: ITreeEntry[] = [];
		for (const treeEntry of tree.tree) {
			const entryPath = path ? `${path}/${treeEntry.path}` : treeEntry.path;
			treeEntries.push({
				...treeEntry,
				path: entryPath,
			});
			if (treeEntry.type === "tree") {
				const cachedTree: ITree | undefined = options.treeCache[treeEntry.sha];
				if (!cachedTree) {
					// This is likely caused by a Handle object in the written tree.
					// We must retrieve it to send a full summary back to historian.
					const missingTree = await options.repoManager.getTree(
						treeEntry.sha,
						true /* recursive */,
					);
					treeEntries.push(
						...missingTree.tree.map((entry) => ({
							...entry,
							path: `${entryPath}/${entry.path}`,
						})),
					);
				} else {
					treeEntries.push(...(await retrieveEntries(cachedTree, entryPath)));
				}
			}
		}
		return treeEntries;
	};
	const gitTreeEntries = await retrieveEntries(newlyCreatedTree);
	const computedGitTree: ITree = {
		sha: newlyCreatedTree.sha,
		url: newlyCreatedTree.url,
		tree: gitTreeEntries,
	};
	return buildFullGitTreeFromGitTree(
		computedGitTree,
		options.repoManager,
		options.blobCache,
		true /* parseInnerFullGitTrees */,
		true /* retrieveBlobs */,
	);
}

export async function writeSummaryTree(
	wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
	options: IWriteSummaryTreeOptions,
): Promise<IFullGitTree> {
	const createTreeEntries: ICreateTreeEntry[] = await Promise.all(
		wholeSummaryTreeEntries.map(async (entry) => {
			return writeSummaryTreeObject(entry, options);
		}),
	);

	const createdTree = await options.repoManager.createTree({ tree: createTreeEntries });
	if (options.precomputeFullTree && options.currentPath === "") {
		return precomputeFullGitTree(createdTree, options);
	}
	return {
		tree: createdTree,
		blobs: options.blobCache,
		parsedFullTreeBlobs: false,
	};
}
