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
export type { OrderedEditSet } from './EditLog';
export { LogViewer, Revision } from './LogViewer';
export { Checkout, CheckoutEvent, ICheckoutEvents, EditValidationResult } from './Checkout';
export { LazyCheckout } from './LazyCheckout';
export { EagerCheckout } from './EagerCheckout';
export * from './ReconciliationPath';
export * from './MergeHealth';
export * from './TreeViewUtilities';
export { StringInterner } from './StringInterner';
export {
	Side,
	EditStatus,
	TreeNode,
	TreeNodeSequence,
	Payload,
	ConstraintEffect,
	Edit,
	ChangeInternal,
	ChangeNode,
	ChangeNode_0_0_2,
	SharedTreeEditOp,
	EditLogSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary,
	EditWithoutId,
	CompressedPlaceholderTree,
	EditBase,
	HasTraits,
	VersionedOp,
	SharedTreeOpType,
	InsertInternal,
	DetachInternal,
	BuildInternal,
	SetValueInternal,
	DeleteInternal,
	ConstraintInternal,
	BuildNodeInternal,
	StablePlaceInternal_0_0_2,
	StableRangeInternal_0_0_2,
	NodeData,
	CompressedTraits,
	CompressedChangeNode,
	EditHandle,
	TraitMap,
	ChangeTypeInternal,
	TraitLocationInternal_0_0_2,
	WriteFormat,
} from './persisted-types';
export {
	SharedTree,
	EditCommittedHandler,
	SequencedEditAppliedHandler,
	EditCommittedEventArguments,
	SequencedEditAppliedEventArguments,
	EditApplicationOutcome,
	ISharedTreeEvents,
	SharedTreeFactoryOptions,
} from './SharedTree';
export { SharedTreeFactory } from './Factory';
export * from './EventTypes';
export {
	setTrait,
	areRevisionViewsSemanticallyEqual,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResult,
	RangeValidationResultKind,
	comparePayloads,
} from './EditUtilities';
export {
	Transaction,
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
} from './Transaction';
export { SharedTreeSummarizer, EditLogSummarizer, SummaryContents } from './Summary';
export {
	NodeInTrait,
	PlaceIndex,
	TreeViewNode,
	TreeView,
	TraitNodeIndex,
	TreeViewPlace,
	TreeViewRange,
	TraitLocation,
} from './TreeView';
export { RevisionView, TransactionView } from './RevisionView';
export { NodeIdContext, NodeIdGenerator, NodeIdConverter } from './NodeIdUtilities';
export type { SharedTreeEncoder } from './SharedTreeEncoder';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	getUploadedEditChunkContents,
	saveUploadedEditChunkContents,
	UploadedEditChunkContents,
} from './SummaryTestUtilities';

export * from './ChangeTypes';
