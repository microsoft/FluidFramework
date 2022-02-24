/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid DDS storing a tree.
 *
 * @packageDocumentation
 */

/**
 * This file represents the public API. Consumers of this package will not see exported modules unless they are enumerated here.
 * Removing / editing existing exports here will often indicate a breaking change, so please be cognizant of changes made here.
 */

// API Exports

export { initialTree } from './InitialTree';
export { TreeNodeHandle } from './TreeNodeHandle';
export { Delta, Forest, ForestNode, ParentData } from './Forest';
export { sharedTreeAssertionErrorType, isSharedTreeEvent, Result } from './Common';
export * from './Identifiers';
export { OrderedEditSet, EditLogSummary, EditHandle, EditChunkOrHandle } from './EditLog';
export { LogViewer, Revision } from './LogViewer';
export { Checkout, CheckoutEvent, ICheckoutEvents, EditValidationResult } from './Checkout';
export { LazyCheckout } from './LazyCheckout';
export { EagerCheckout } from './EagerCheckout';
export * from './ReconciliationPath';
export * from './MergeHealth';
export * from './TreeViewUtilities';
export {
	SharedTree,
	ChangeType,
	Change,
	Build,
	BuildNode,
	BuildTreeNode,
	Insert,
	Detach,
	SetValue,
	Constraint,
	ConstraintEffect,
	ChangeTypeInternal,
	ChangeInternal,
	BuildNodeInternal,
	BuildInternal,
	InsertInternal,
	DetachInternal,
	SetValueInternal,
	ConstraintInternal,
	Delete,
	Move,
	DeleteInternal,
	MoveInternal,
	StablePlace_0_0_2,
	StableRange_0_0_2,
	StablePlace,
	StableRange,
	SharedTreeFactory,
	setTrait,
	validateStablePlace,
	PlaceValidationResult,
	BadPlaceValidationResult,
	validateStableRange,
	RangeValidationResultKind,
	RangeValidationResult,
	BadRangeValidationResult,
	Transaction,
	isDetachedSequenceId,
} from './default-edits';
export {
	Side,
	EditCommittedHandler,
	EditCommittedEventArguments,
	SequencedEditAppliedHandler,
	SequencedEditAppliedEventArguments,
	EditApplicationOutcome,
	SharedTreeChangeType,
	SharedTreeFailureType,
	ISharedTreeEvents,
	GenericSharedTree,
	SharedTreeEvent,
	SharedTreeDiagnosticEvent,
	Edit,
	newEdit,
	comparePayloads,
	EditWithoutId,
	EditBase,
	HasTraits,
	TraitMap,
	TreeNodeSequence,
	Payload,
	NodeDataBase,
	NodeData_0_0_2,
	NodeData,
	TreeNode,
	TreeNode_0_0_2,
	ChangeNode,
	ChangeNode_0_0_2,
	EditStatus,
	TraitLocation,
	TraitLocation_0_0_2,
	GenericTransaction,
	GenericTransactionPolicy,
	TransactionFailure,
	TransactionState,
	SucceedingTransactionState,
	FailingTransactionState,
	FailedEditingResult,
	ChangeResult,
	EditingResult,
	EditingResultBase,
	ValidEditingResult,
	SharedTreeFactoryOptions,
	SharedTreeSummarizer,
	EditLogSummarizer,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
	UploadedEditChunkContents,
	getUploadedEditChunkContents,
	saveUploadedEditChunkContents,
	PlaceholderTree,
	PlaceholderTree_0_0_2,
	NodeIdContext,
	NodeIdGenerator,
	NodeIdConverter,
	NodeInTrait,
	PlaceIndex,
	TreeViewNode,
	TreeView,
	RevisionView,
	TransactionView,
	TraitNodeIndex,
	TreeViewPlace,
	TreeViewRange,
	TransactionFactory,
} from './generic';
