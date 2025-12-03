/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ChangeRebaser,
	type FinalChange,
	FinalChangeStatus,
	makeAnonChange,
	mapTaggedChange,
	type RevisionInfo,
	type RevisionMetadataSource,
	type TaggedChange,
	tagChange,
	tagRollbackInverse,
} from "./changeRebaser.js";
export { RevisionTagCodec } from "./revisionTagCodec.js";
export {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	asChangeAtomId,
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type ChangeAtomIdRangeMap,
	type ChangesetLocalId,
	CommitKind,
	type CommitMetadata,
	compareRevisions,
	type EncodedChangeAtomId,
	type EncodedRevisionTag,
	type EncodedStableId,
	type GraphCommit,
	makeChangeAtomId,
	mintCommit,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
	type RevisionTag,
	RevisionTagSchema,
	replaceAtomRevisions,
	SessionIdSchema,
	StableIdSchema,
	subtractChangeAtomIds,
	taggedAtomId,
	taggedOptAtomId,
} from "./types.js";
export {
	type BranchRebaseResult,
	diffHistories,
	findAncestor,
	findCommonAncestor,
	isAncestor,
	type RebaseStats,
	type RebaseStatsWithDuration,
	rebaseBranch,
	rebaseChange,
	rebaseChangeOverChanges,
	replaceChange,
	revisionMetadataSourceFromInfo,
} from "./utils.js";
