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
	SharedTreeEvent,
	SharedTreeDiagnosticEvent,
	SharedTreeFactoryOptions,
	SharedTreeSummaryWriteFormat,
	SharedTreeSummaryReadFormat,
	SharedTreeChangeType,
	SharedTreeFailureType,
} from './GenericSharedTree';
export {
	Edit,
	EditWithoutId,
	EditBase,
	TraitMap,
	TreeNodeSequence,
	Payload,
	NodeData,
	TreeNode,
	ChangeNode,
	BuildNode,
	EditStatus,
	TraitLocation,
	SharedTreeOpType,
} from './PersistedTypes';
export { newEdit, newEditId } from './GenericEditUtilities';
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
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_1,
	formatVersion,
	serialize,
} from './Summary';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export { saveUploadedEditChunkContents, UploadedEditChunkContents } from './SummaryTestUtilities';
