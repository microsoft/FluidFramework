/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree } from "@fluidframework/gitresources";
import { IRepositoryManager } from "../definitions";

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
