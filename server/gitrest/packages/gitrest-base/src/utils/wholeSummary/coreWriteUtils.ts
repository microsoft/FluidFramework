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
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Options and flags for writing a summary tree.
 */
export interface IWriteSummaryTreeOptions {
	/**
	 * The Git repository manager to use for writing the summary tree.
	 * This will be treated as the "final destination" for Git objects.
	 */
	repoManager: IRepositoryManager;
	/**
	 * The Git repository manager to use for retrieving Git objects from storage.
	 * This will often be the same as `repoManager`, but may be different when writing a low-io summary.
	 */
	sourceOfTruthRepoManager: IRepositoryManager;
	/**
	 * Whether or not to precompute the full git tree for the written summary tree.
	 * This will cause the returned {@link IFullGitTree} to contain the entire newly written Git tree.
	 * When false, the returned {@link IFullGitTree} will only contain the shas of the newly written Git tree and whatever ended up in the blob cache.
	 */
	precomputeFullTree: boolean;
	/**
	 * The current path of the summary tree being written.
	 * When writing the summary tree recursively, this will be updated for each level of the tree.
	 * When writing from the root of the tree, this should be an empty string.
	 */
	currentPath: string;
	/**
	 * Whether or not to enable low-io write.
	 * When true, the resulting tree written to the Git repo referenced by `repoManager` will contain a single blob.
	 */
	enableLowIoWrite: boolean;
	/**
	 * Tree cache used to store references to git trees. Utilized when precomputing full tree.
	 */
	treeCache: Record<string, ITree>;
	/**
	 * Blob cache used to store references to git blobs. Utilized when precomputing full tree.
	 */
	blobCache: Record<string, IBlob>;
	/**
	 * Cache used to store key/value pairs, where the key is a summary object handle (commitSha/treepath) and the value is the sha of the object at that path.
	 */
	entryHandleToObjectShaCache: Map<string, string>;
}

/**
 * Converts an {@link IFullGitTree} into a {@link IFullSummaryTree},
 * then to an array of {@link WholeSummaryTreeEntry}, and finally, writes it into Git storage using {@link writeSummaryTree}.
 *
 * This appears to be an unnecessary amount of conversions, but the internal logic for parsing {@link IFullGitTree}s stored as blobs
 * makes a more straightforward approach difficult. It should be possible to simplify this in the future with care and appropriate testing.
 */
export async function writeFullGitTreeAsSummaryTree(
	fullGitTree: IFullGitTree,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const fullSummaryTree = convertFullGitTreeToFullSummaryTree(fullGitTree);
	const wholeSummaryTreeEntries = convertFullSummaryToWholeSummaryEntries(fullSummaryTree);
	const tree = await writeSummaryTree(wholeSummaryTreeEntries, options);
	return tree.tree.sha;
}

/**
 * Write a single summary tree blob into Git storage.
 */
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

/**
 * Recursively write a summary tree into Git storage.
 */
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

/**
 * Resolve a tree handle entry to a sha based on its path.
 * The path is expected to be in the form: `<parent commit sha>/<tree path>`,
 * where the parent commit references the tree that the path traverses.
 */
async function getShaFromTreeHandleEntry(
	entry: IWholeSummaryTreeHandleEntry,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	if (!entry.id) {
		Lumberjack.error("Empty summary tree handle");
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
	// Must use `options.sourceOfTruthRepoManager` to ensure that we retrieve the shas from storage, not memory, in low-io mode.
	const parentCommit = await options.sourceOfTruthRepoManager.getCommit(parentHandle);
	const parentTree = await options.sourceOfTruthRepoManager.getTree(
		parentCommit.tree.sha,
		true /* recursive */,
	);
	const gitTree: IFullGitTree = await buildFullGitTreeFromGitTree(
		parentTree,
		options.sourceOfTruthRepoManager,
		{} /* blobCache */,
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
		Lumberjack.error("Summary tree handle object not found", {
			id: entry.id,
			path: entry.path,
		});
		throw new NetworkError(
			404,
			`Summary tree handle object not found: id: ${entry.id}, path: ${entry.path}`,
		);
	}
	return sha;
}

/**
 * Write a single summary tree object into Git storage.
 * - A blob is written as a Git blob.
 * - A tree is recursively written as a Git tree, possibly writing additional trees and blobs.
 * - A handle is resolved to a sha based on its path.
 */
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

/**
 * Use tree and blob caches to precompute the {@link IFullGitTree} for the newly written Git tree.
 */
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

/**
 * Write a summary tree as a Git tree in the provided filesystem.
 *
 * Optionally, while writing the tree, it will also precompute the full git tree for the written tree by combining
 * the shas returned for each entry on write with the data that was just written. This prevents unnecessary
 * reading of data that is already known just for the sake of retrieving it with a sha attached.
 */
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
