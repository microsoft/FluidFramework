/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	areEqualChangeAtomIds,
	makeChangeAtomId,
	asChangeAtomId,
	mintCommit,
	type GraphCommit,
	CommitKind,
	type CommitMetadata,
	type RevisionTag,
	RevisionTagSchema,
	type EncodedRevisionTag,
	type EncodedChangeAtomId,
	type ChangesetLocalId,
	type ChangeAtomId,
	type ChangeAtomIdMap,
	SessionIdSchema,
	taggedAtomId,
	taggedOptAtomId,
	offsetChangeAtomId,
	replaceAtomRevisions,
	replaceChange,
} from "./types.js";
export { RevisionTagCodec } from "./revisionTagCodec.js";
export {
	type ChangeRebaser,
	type FinalChange,
	FinalChangeStatus,
	makeAnonChange,
	tagChange,
	mapTaggedChange,
	tagRollbackInverse,
	type TaggedChange,
	type RevisionMetadataSource,
	type RevisionInfo,
} from "./changeRebaser.js";
export {
	findAncestor,
	findCommonAncestor,
	rebaseBranch,
	type BranchRebaseResult,
	rebaseChange,
	rebaseChangeOverChanges,
	revisionMetadataSourceFromInfo,
	type RebaseStats,
	type RebaseStatsWithDuration,
} from "./utils.js";
