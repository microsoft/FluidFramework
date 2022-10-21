/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid DDS storing a tree.
 *
 * @packageDocumentation
 */

/**
 * This file represents the public API. Consumers of this library will not see exported modules unless they are enumerated here.
 * Removing / editing existing exports here will often indicate a breaking change, so please be cognizant of changes made here.
 */

// API Exports

export {
	Build,
	BuildNode,
	BuildTreeNode,
	Change,
	ChangeType,
	Constraint,
	Detach,
	HasVariadicTraits,
	Insert,
	SetValue,
	StablePlace,
	StableRange,
} from './ChangeTypes';
export { Checkout, CheckoutEvent, ICheckoutEvents, EditValidationResult } from './Checkout';
export { isSharedTreeEvent, sharedTreeAssertionErrorType, Result } from './Common';
export { EagerCheckout } from './EagerCheckout';
export type { OrderedEditSet, EditHandle } from './EditLog';
export {
	setTrait,
	areRevisionViewsSemanticallyEqual,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResult,
	RangeValidationResultKind,
} from './EditUtilities';
export { SharedTreeDiagnosticEvent, SharedTreeEvent } from './EventTypes';
export { Delta, Forest, ForestNode, ParentData } from './Forest';
export type {
	CompressedId,
	Definition,
	DetachedSequenceId,
	EditId,
	InternedStringId,
	FinalCompressedId,
	LocalCompressedId,
	NodeId,
	NodeIdBrand,
	StableNodeId,
	SessionSpaceCompressedId,
	SessionUnique,
	TraitLabel,
	UuidString,
	AttributionId,
} from './Identifiers';
export { isDetachedSequenceId } from './Identifiers';
export { initialTree } from './InitialTree';
export { LazyCheckout } from './LazyCheckout';
export { LogViewer } from './LogViewer';
export { NodeIdContext, NodeIdGenerator, NodeIdConverter } from './NodeIdUtilities';
export {
	MergeHealthStats,
	SharedTreeMergeHealthTelemetryHeartbeat,
	useFailedSequencedEditTelemetry,
} from './MergeHealth';
export { comparePayloads } from './PayloadUtilities';
export {
	Side,
	EditStatus,
	TreeNode,
	TreeNodeSequence,
	Payload,
	ConstraintEffect,
	Edit,
	ChangeInternal,
	InternalizedChange,
	ChangeNode,
	ChangeNode_0_0_2,
	EditLogSummary,
	FluidEditHandle,
	SharedTreeSummaryBase,
	EditWithoutId,
	PlaceholderTree,
	EditBase,
	HasTraits,
	InsertInternal,
	DetachInternal,
	BuildInternal,
	SetValueInternal,
	ConstraintInternal,
	BuildNodeInternal,
	StablePlaceInternal_0_0_2,
	StableRangeInternal_0_0_2,
	NodeData,
	TraitMap,
	ChangeTypeInternal,
	TraitLocationInternal_0_0_2,
	WriteFormat,
	ConstraintInternal_0_0_2,
	StablePlaceInternal,
	StableRangeInternal,
	BuildNodeInternal_0_0_2,
	BuildInternal_0_0_2,
	InsertInternal_0_0_2,
	DetachInternal_0_0_2,
	SetValueInternal_0_0_2,
	TraitLocationInternal,
} from './persisted-types';
export { ReconciliationChange, ReconciliationEdit, ReconciliationPath } from './ReconciliationPath';
export { Revision } from './RevisionValueCache';
export { RevisionView, TransactionView } from './RevisionView';
export { TreeNodeHandle } from './TreeNodeHandle';
export { getTraitLocationOfRange, placeFromStablePlace, rangeFromStableRange } from './TreeViewUtilities';
export {
	SharedTreeArgs,
	SharedTreeOptions,
	SharedTreeOptions_0_0_2,
	SharedTreeOptions_0_1_1,
	SharedTreeFactory,
	SharedTree,
	EditCommittedHandler,
	SequencedEditAppliedHandler,
	EditCommittedEventArguments,
	SequencedEditAppliedEventArguments,
	EditApplicationOutcome,
	ISharedTreeEvents,
	StashedLocalOpMetadata,
} from './SharedTree';
export { StringInterner } from './StringInterner';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	/** @deprecated Use `getSerializedUploadedEditChunkContents` instead. */
	getSerializedUploadedEditChunkContents as getUploadedEditChunkContents,
	getSerializedUploadedEditChunkContents,
} from './SummaryTestUtilities';

export { Transaction, TransactionEvent, TransactionEvents } from './Transaction';
export {
	TransactionInternal,
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
} from './TransactionInternal';
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
