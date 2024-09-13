/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The original Git protocol type names sometimes conflict with the names of
// other types exported from this package.  To avoid conflicts, we prefix the
// Git protocol type names with "IGit" while exporting.
//
// The original Git protocol types names are preserved in 'resources.ts' to
// facilitate comparison and/or automatic synchronization with the server
// side definitions in the future (if desireable).
export type {
	IAuthor as IGitAuthor,
	IBlob as IGitBlob,
	ICommitDetails as IGitCommitDetails,
	ICommitHash as IGitCommitHash,
	ICommitter as IGitCommitter,
	ICreateBlobParams as IGitCreateBlobParams,
	ICreateBlobResponse as IGitCreateBlobResponse,
	ICreateTreeEntry as IGitCreateTreeEntry,
	ICreateTreeParams as IGitCreateTreeParams,
	ITree as IGitTree,
	ITreeEntry as IGitTreeEntry,
} from "./resources.js";
