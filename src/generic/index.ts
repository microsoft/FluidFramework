/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// API Exports

export {
	EditCommittedHandler,
	SequencedEditAppliedHandler,
	EditCommittedEventArguments,
	SequencedEditAppliedEventArguments,
	EditApplicationOutcome,
	ISharedTreeEvents,
	GenericSharedTree,
	SharedTreeFactoryOptions,
	SharedTreeSummaryWriteFormat,
	SharedTreeSummaryReadFormat,
	SharedTreeChangeType,
	SharedTreeFailureType,
} from './GenericSharedTree';
export * from './EventTypes';
export {
	Side,
	Edit,
	EditWithoutId,
	EditBase,
	TraitMap,
	TreeNodeSequence,
	Payload,
	NodeData,
	TreeNode,
	ChangeNode,
	EditStatus,
	TraitLocation,
	StableTraitLocation,
	SharedTreeOpType,
	PlaceholderTree,
	HasTraits,
} from './PersistedTypes';
export {
	newEdit,
	newEditId,
	comparePayloads,
	convertTreeNodes,
	deepCloneStablePlace,
	deepCloneStableRange,
	NoTraits,
} from './GenericEditUtilities';
export {
	GenericTransaction,
	GenericTransactionPolicy,
	EditingResult,
	EditingResultBase,
	FailedEditingResult,
	ValidEditingResult,
	TransactionState,
	TransactionFailure,
	SucceedingTransactionState,
	FailingTransactionState,
	ChangeResult,
} from './GenericTransaction';
export {
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummarizer,
	EditLogSummarizer,
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_1,
	formatVersion,
	serialize,
} from './Summary';
export {
	NodeInTrait,
	PlaceIndex,
	TreeViewNode,
	TreeView,
	RevisionView,
	TransactionView,
	TraitNodeIndex,
	TreeViewPlace,
	TreeViewRange,
} from './TreeView';
export { NodeIdGenerator, NodeIdConverter } from './NodeIdUtilities';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	getUploadedEditChunkContents,
	saveUploadedEditChunkContents,
	UploadedEditChunkContents,
} from './SummaryTestUtilities';
