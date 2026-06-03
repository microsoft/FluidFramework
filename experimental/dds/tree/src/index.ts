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
} from './ChangeTypes.js';
export { Checkout, CheckoutEvent, EditValidationResult, ICheckoutEvents } from './Checkout.js';
export { isSharedTreeEvent, Result, sharedTreeAssertionErrorType } from './Common.js';
export { EagerCheckout } from './EagerCheckout.js';
export type { EditHandle, OrderedEditSet } from './EditLog.js';
export {
	areRevisionViewsSemanticallyEqual,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResult,
	RangeValidationResultKind,
	setTrait,
} from './EditUtilities.js';
export { SharedTreeDiagnosticEvent, SharedTreeEvent } from './EventTypes.js';
export { Delta, Forest, ForestNode, ParentData } from './Forest.js';
export type {
	AttributionId,
	CompressedId,
	Definition,
	DetachedSequenceId,
	EditId,
	FinalCompressedId,
	InternedStringId,
	LocalCompressedId,
	NodeId,
	NodeIdBrand,
	SessionSpaceCompressedId,
	SessionUnique,
	StableNodeId,
	TraitLabel,
	UuidString,
} from './Identifiers.js';
export { isDetachedSequenceId } from './Identifiers.js';
export { initialTree } from './InitialTree.js';
export { LazyCheckout } from './LazyCheckout.js';
export { LogViewer } from './LogViewer.js';
export {
	MergeHealthStats,
	SharedTreeMergeHealthTelemetryHeartbeat,
	useFailedSequencedEditTelemetry,
} from './MergeHealth.js';
export {
	type IMigrationEvent,
	type IShim,
	MigrationShim,
	MigrationShimFactory,
	SharedTreeShim,
	SharedTreeShimFactory,
} from './migration-shim/index.js';
export { NodeIdContext, NodeIdConverter, NodeIdGenerator } from './NodeIdUtilities.js';
export { comparePayloads } from './PayloadUtilities.js';
export {
	BuildInternal,
	BuildInternal_0_0_2,
	BuildNodeInternal,
	BuildNodeInternal_0_0_2,
	ChangeInternal,
	ChangeNode,
	ChangeNode_0_0_2,
	ChangeTypeInternal,
	ConstraintEffect,
	ConstraintInternal,
	ConstraintInternal_0_0_2,
	DetachInternal,
	DetachInternal_0_0_2,
	Edit,
	EditBase,
	EditLogSummary,
	EditStatus,
	EditWithoutId,
	FluidEditHandle,
	HasTraits,
	InsertInternal,
	InsertInternal_0_0_2,
	InternalizedChange,
	NodeData,
	Payload,
	PlaceholderTree,
	SetValueInternal,
	SetValueInternal_0_0_2,
	SharedTreeSummaryBase,
	Side,
	StablePlaceInternal,
	StablePlaceInternal_0_0_2,
	StableRangeInternal,
	StableRangeInternal_0_0_2,
	TraitLocationInternal,
	TraitLocationInternal_0_0_2,
	TraitMap,
	TreeNode,
	TreeNodeSequence,
	WriteFormat,
} from './persisted-types/index.js';
export { SharedTreeAttributes, SharedTreeFactoryType } from './publicContracts.js';
export {
	ReconciliationChange,
	ReconciliationEdit,
	ReconciliationPath,
} from './ReconciliationPath.js';
export { Revision } from './RevisionValueCache.js';
export { RevisionView, TransactionView } from './RevisionView.js';
export {
	EditApplicationOutcome,
	EditCommittedEventArguments,
	EditCommittedHandler,
	ISharedTreeEvents,
	SequencedEditAppliedEventArguments,
	SequencedEditAppliedHandler,
	SharedTree,
	SharedTreeArgs,
	SharedTreeBaseOptions,
	SharedTreeFactory,
	SharedTreeOptions,
	SharedTreeOptions_0_0_2,
	SharedTreeOptions_0_1_1,
	StashedLocalOpMetadata,
} from './SharedTree.js';
export { StringInterner } from './StringInterner.js';
/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	getSerializedUploadedEditChunkContents as getUploadedEditChunkContents,
	getSerializedUploadedEditChunkContents,
} from './SummaryTestUtilities.js';
export { Transaction, TransactionEvent, TransactionEvents } from './Transaction.js';
export {
	ChangeResult,
	EditingResult,
	EditingResultBase,
	FailedEditingResult,
	FailingTransactionState,
	GenericTransaction,
	GenericTransactionPolicy,
	SucceedingTransactionState,
	TransactionFailure,
	TransactionInternal,
	TransactionState,
	ValidEditingResult,
} from './TransactionInternal.js';
export { TreeNodeHandle } from './TreeNodeHandle.js';
export {
	NodeInTrait,
	PlaceIndex,
	TraitLocation,
	TraitNodeIndex,
	TreeView,
	TreeViewNode,
	TreeViewPlace,
	TreeViewRange,
} from './TreeView.js';
export {
	getTraitLocationOfRange,
	placeFromStablePlace,
	rangeFromStableRange,
} from './TreeViewUtilities.js';
export { IRevertible, IUndoConsumer, SharedTreeUndoRedoHandler } from './UndoRedoHandler.js';
