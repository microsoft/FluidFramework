/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRef } from "@fluidframework/gitresources";
import {
	IWholeSummaryPayload,
	NetworkError,
	WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IRepositoryManager } from "../definitions";
import { MemFsManagerFactory } from "../filesystems";
import { IsomorphicGitManagerFactory } from "../isomorphicgitManager";
import { NullExternalStorageManager } from "../../externalStorageManager";
import { IFullGitTree, IWholeSummaryOptions } from "./definitions";
import {
	buildFullGitTreeFromGitTree,
	convertFullSummaryToWholeSummaryEntries,
} from "./conversions";
import { Constants } from "./constants";
import { readSummary } from "./readWholeSummary";
import {
	IWriteSummaryTreeOptions,
	writeFullGitTreeAsSummaryTree,
	writeSummaryTree,
} from "./coreWriteUtils";

/**
 * Retrieve a git tree from storage, then write it into the in-memory filesystem.
 * This is used when attempting to write a summary tree to memory that references a git tree that is not currently in memory.
 */
async function retrieveMissingGitTreeIntoMemory(
	missingTreeSha: string,
	options: IWholeSummaryOptions,
	writeSummaryTreeOptions: IWriteSummaryTreeOptions,
	inMemoryWriteSummaryTreeOptions: IWriteSummaryTreeOptions,
): Promise<void> {
	const missingTree = await writeSummaryTreeOptions.repoManager.getTree(
		missingTreeSha,
		true /* recursive */,
	);
	const fullTree = await buildFullGitTreeFromGitTree(
		missingTree,
		writeSummaryTreeOptions.repoManager,
		{} /* blobCache */,
		false /* parseInnerFullGitTrees */,
		true /* retrieveBlobs */,
	);
	const writtenTreeHandle = await writeFullGitTreeAsSummaryTree(
		fullTree,
		inMemoryWriteSummaryTreeOptions,
	);
	if (writtenTreeHandle !== missingTreeSha) {
		Lumberjack.error(
			`Attempted to recover from missing git object (${missingTreeSha}), but recovered data sha (${writtenTreeHandle}) did not match.`,
			{ ...options.lumberjackProperties },
		);
		throw new NetworkError(
			500,
			"Failed to compute new container summary.",
			false /* canRetry */,
		);
	}
}

/**
 * Write a summary tree (channel or container) into an in-memory filesystem, then read it out as an {@link IFullGitTree}.
 */
async function computeInMemoryFullGitTree(
	wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
	documentRef: IRef | undefined,
	inMemoryRepoManager: IRepositoryManager,
	writeSummaryTreeOptions: IWriteSummaryTreeOptions,
	options: IWholeSummaryOptions,
): Promise<IFullGitTree> {
	const inMemoryWriteSummaryTreeOptions: IWriteSummaryTreeOptions = {
		repoManager: inMemoryRepoManager,
		sourceOfTruthRepoManager: options.repoManager,
		enableLowIoWrite: false,
		precomputeFullTree: true,
		currentPath: "",
		// Use blank caches caches for in-memory repo manager. Otherwise, we will be referencing
		// blobs in storage that are not in-memory.
		entryHandleToObjectShaCache: new Map<string, string>(),
		blobCache: {},
		treeCache: {},
	};
	if (documentRef) {
		// Update in-memory repo manager with previous summary for handle references.
		const previousSummary = await readSummary(documentRef.object.sha, options);
		const fullSummaryPayload = convertFullSummaryToWholeSummaryEntries({
			treeEntries: previousSummary.trees[0].entries,
			blobs: previousSummary.blobs ?? [],
		});
		const previousSummaryMemoryFullGitTree = await writeSummaryTree(
			fullSummaryPayload,
			inMemoryWriteSummaryTreeOptions,
		);
		for (const treeEntry of previousSummaryMemoryFullGitTree.tree.tree) {
			// Update entry handle to object sha map for reference when writing summary handles.
			inMemoryWriteSummaryTreeOptions.entryHandleToObjectShaCache.set(
				`${documentRef.object.sha}/${treeEntry.path}`,
				treeEntry.sha,
			);
		}
	}

	const writeSummaryIntoMemory = async () =>
		writeSummaryTree(wholeSummaryTreeEntries, inMemoryWriteSummaryTreeOptions);

	const inMemorySummaryFullGitTree = await writeSummaryIntoMemory().catch(async (error) => {
		if (
			error?.caller === "git.walk" &&
			error.code === "NotFoundError" &&
			typeof error.data?.what === "string"
		) {
			// This is caused by the previous channel summary tree being missing.
			// Fetch the missing tree, write it into the in-memory storage, then retry.
			const missingTreeSha = error.data.what;
			await retrieveMissingGitTreeIntoMemory(
				missingTreeSha,
				options,
				writeSummaryTreeOptions,
				inMemoryWriteSummaryTreeOptions,
			);
			return writeSummaryIntoMemory();
		} else {
			throw error;
		}
	});
	return inMemorySummaryFullGitTree;
}

/**
 * Reduce a whole summary payload into a single tree entry containing the full tree as 1 blob containing an {@link IFullGitTree}.
 * This blob contains all the data needed to reconstruct the full tree (all tree entries and blob entries, including blob data) in a different storage system as needed.
 */
export async function computeLowIoSummaryTreeEntries(
	payload: IWholeSummaryPayload,
	documentRef: IRef | undefined,
	writeSummaryTreeOptions: IWriteSummaryTreeOptions,
	options: IWholeSummaryOptions,
): Promise<WholeSummaryTreeEntry[]> {
	const inMemoryFsManagerFactory = new MemFsManagerFactory();
	const inMemoryRepoManagerFactory = new IsomorphicGitManagerFactory(
		{
			baseDir: "/usr/gitrest",
			useRepoOwner: true,
		},
		{
			defaultFileSystemManagerFactory: inMemoryFsManagerFactory,
		},
		new NullExternalStorageManager(),
		true /* repoPerDocEnabled */,
		false /* enableRepositoryManagerMetrics */,
	);
	const inMemoryRepoManager = await inMemoryRepoManagerFactory.create({
		repoOwner: "gitrest",
		repoName: options.documentId,
		storageRoutingId: {
			tenantId: "internal",
			documentId: options.documentId,
		},
	});
	try {
		const fullGitTree = await computeInMemoryFullGitTree(
			payload.entries,
			documentRef,
			inMemoryRepoManager,
			writeSummaryTreeOptions,
			options,
		);
		return [
			{
				path: Constants.FullTreeBlobPath,
				type: "blob",
				value: {
					type: "blob",
					content: JSON.stringify(fullGitTree),
					encoding: "utf-8",
				},
			},
		];
	} finally {
		// Ensure temporary in-memory volume is destroyed.
		inMemoryFsManagerFactory.volume.reset();
	}
}
