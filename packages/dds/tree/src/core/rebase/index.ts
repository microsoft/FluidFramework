/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	areEqualChangeAtomIds,
	makeChangeAtomId,
	asChangeAtomId,
	mintCommit,
	GraphCommit,
	CommitKind,
	CommitMetadata,
	RevisionTag,
	RevisionTagSchema,
	EncodedRevisionTag,
	EncodedChangeAtomId,
	ChangesetLocalId,
	ChangeAtomId,
	ChangeAtomIdMap,
	SessionIdSchema,
	taggedAtomId,
	taggedOptAtomId,
	offsetChangeAtomId,
	replaceAtomRevisions,
} from "./types.js";
export { RevisionTagCodec } from "./revisionTagCodec.js";
export {
	ChangeRebaser,
	FinalChange,
	FinalChangeStatus,
	makeAnonChange,
	tagChange,
	mapTaggedChange,
	tagRollbackInverse,
	TaggedChange,
	RevisionMetadataSource,
	RevisionInfo,
} from "./changeRebaser.js";
export {
	Exception,
	Failure,
	noFailure,
	OutputType,
	verifyChangeRebaser,
	Violation,
} from "./verifyChangeRebaser.js";
export {
	findAncestor,
	findCommonAncestor,
	rebaseBranch,
	BranchRebaseResult,
	rebaseChange,
	rebaseChangeOverChanges,
	revisionMetadataSourceFromInfo,
} from "./utils.js";
