/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	areEqualChangeAtomIds,
	mintCommit,
	GraphCommit,
	RevisionTag,
	RevisionTagSchema,
	EncodedRevisionTag,
	EncodedChangeAtomId,
	ChangesetLocalId,
	ChangeAtomId,
	ChangeAtomIdMap,
	SessionIdSchema,
} from "./types";
export {
	ChangeRebaser,
	FinalChange,
	FinalChangeStatus,
	makeAnonChange,
	tagChange,
	tagRollbackInverse,
	TaggedChange,
	RevisionMetadataSource,
	RevisionInfo,
} from "./changeRebaser";
export {
	Exception,
	Failure,
	noFailure,
	OutputType,
	verifyChangeRebaser,
	Violation,
} from "./verifyChangeRebaser";
export {
	findAncestor,
	findCommonAncestor,
	rebaseBranch,
	BranchRebaseResult,
	rebaseChange,
	rebaseChangeOverChanges,
	revisionMetadataSourceFromInfo,
} from "./utils";
