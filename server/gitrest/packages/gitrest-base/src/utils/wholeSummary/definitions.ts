/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBlob, ITree } from "@fluidframework/gitresources";

import type { IRepositoryManager } from "../definitions";

export interface IWholeSummaryOptions {
	documentId: string;
	repoManager: IRepositoryManager;
	lumberjackProperties: Record<string, any>;
	externalStorageEnabled: boolean;
}

/**
 * A representation of a summary's version containing both
 * the Git commit sha and the Git tree sha pointed to by the commit.
 */
export interface ISummaryVersion {
	/**
	 * Commit sha.
	 */
	id: string;
	/**
	 * Tree sha.
	 */
	treeId: string;
}

/**
 * A representation of a recursive Git Tree containing a map
 * with all of the referenced blobs. This can be stored as an
 * individual git blob using the `.fullTree` path.
 */
export interface IFullGitTree {
	/**
	 * Original git tree object containing all tree entries.
	 */
	tree: ITree;
	/**
	 * Sha-Blob map of all blobs in this git tree.
	 */
	blobs: Record<string, IBlob>;
	/**
	 * Inform consumer that this tree contained "FullGitTree" blobs.
	 */
	parsedFullTreeBlobs: boolean;
}

export enum WriteSummaryTraceStage {
	/**
	 * Summary write operation started, no logic executed yet.
	 */
	WriteSummaryStarted = "WriteSummaryStarted",
	/**
	 * Retrieved document's Git Ref from storage (if it existed).
	 * This is a no-op in some scenarios, like on initial summary.
	 */
	DocRefRetrieved = "DocRefRetrieved",
	/**
	 * Computed the Git tree entries for the summary tree to be written.
	 * This includes performing any "low IO" logic if enabled.
	 */
	ComputedTreeEntries = "ComputedTreeEntries",
	/**
	 * Successfully wrote the summary tree to Git storage.
	 * This includes writing any blobs and tree nodes to storage.
	 */
	WroteSummaryTree = "WroteSummaryTree",
	/**
	 * Created a new commit referencing the written summary tree.
	 */
	CreatedNewSummaryVersion = "CreatedNewSummaryVersion",
	/**
	 * Created or updated the document Git Ref to point to the new commit.
	 */
	CreatedOrUpdatedDocRef = "CreatedOrUpdatedDocRef",
	/**
	 * Converted the full Git tree into a Whole Flat Summary structure to be returned
	 * to the caller.
	 */
	ConvertedToWholeFlatSummary = "ConvertedToWholeFlatSummary",
}
