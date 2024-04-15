/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree } from "@fluidframework/gitresources";
import { IRepositoryManager, type IRepoManagerParams } from "../definitions";
import type { InMemoryRepoManagerFactory } from "../helpers";

export interface IWholeSummaryOptions {
	documentId: string;
	repoManager: IRepositoryManager;
	repoManagerParams: IRepoManagerParams;
	lumberjackProperties: Record<string, any>;
	externalStorageEnabled: boolean;
	inMemoryRepoManagerFactory: InMemoryRepoManagerFactory;
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
