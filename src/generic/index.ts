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
	ChangeNode_0_0_2,
	EditStatus,
	TraitLocation,
	TraitLocation_0_0_2,
	SharedTreeOpType,
	SharedTreeSummaryWriteFormat,
	PlaceholderTree,
	HasTraits,
} from './PersistedTypes';
export {
	newEdit,
	newEditId,
	comparePayloads,
	convertTreeNodes,
	NoTraits,
	iterateChildren,
	compareNodes,
	deepCompareNodes,
	areRevisionViewsSemanticallyEqual,
} from './EditUtilities';
export {
	TransactionFactory,
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
	TraitNodeIndex,
	TreeViewPlace,
	TreeViewRange,
} from './TreeView';
export { RevisionView, TransactionView } from './RevisionView';
export { NodeIdContext, NodeIdGenerator, NodeIdConverter } from './NodeIdUtilities';
export * from './Conversion002';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	getUploadedEditChunkContents,
	saveUploadedEditChunkContents,
	UploadedEditChunkContents,
} from './SummaryTestUtilities';
