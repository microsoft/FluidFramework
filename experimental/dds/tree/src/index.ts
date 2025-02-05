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
export { Checkout, CheckoutEvent, ICheckoutEvents, EditValidationResult } from './Checkout.js';
export { isSharedTreeEvent, sharedTreeAssertionErrorType, Result } from './Common.js';
export { EagerCheckout } from './EagerCheckout.js';
export type { OrderedEditSet, EditHandle } from './EditLog.js';
export {
	setTrait,
	areRevisionViewsSemanticallyEqual,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResult,
	RangeValidationResultKind,
} from './EditUtilities.js';
export { SharedTreeDiagnosticEvent, SharedTreeEvent } from './EventTypes.js';
export { Delta, Forest, ForestNode, ParentData } from './Forest.js';
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
} from './Identifiers.js';
export { isDetachedSequenceId } from './Identifiers.js';
export { initialTree } from './InitialTree.js';
export { LazyCheckout } from './LazyCheckout.js';
export { LogViewer } from './LogViewer.js';
export { NodeIdContext, NodeIdGenerator, NodeIdConverter } from './NodeIdUtilities.js';
export {
	MergeHealthStats,
	SharedTreeMergeHealthTelemetryHeartbeat,
	useFailedSequencedEditTelemetry,
} from './MergeHealth.js';
export { comparePayloads } from './PayloadUtilities.js';
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
} from './persisted-types/index.js';
export {
	ReconciliationChange,
	ReconciliationEdit,
	ReconciliationPath,
} from './ReconciliationPath.js';
export { Revision } from './RevisionValueCache.js';
export { RevisionView, TransactionView } from './RevisionView.js';
export { TreeNodeHandle } from './TreeNodeHandle.js';
export {
	getTraitLocationOfRange,
	placeFromStablePlace,
	rangeFromStableRange,
} from './TreeViewUtilities.js';
export {
	SharedTreeArgs,
	SharedTreeOptions,
	SharedTreeBaseOptions,
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
} from './SharedTree.js';
export { StringInterner } from './StringInterner.js';
export { SharedTreeAttributes, SharedTreeFactoryType } from './publicContracts.js';

/**
 * TODO:#61413: Publish test utilities from a separate test package
 */
export {
	getSerializedUploadedEditChunkContents as getUploadedEditChunkContents,
	getSerializedUploadedEditChunkContents,
} from './SummaryTestUtilities.js';

export { Transaction, TransactionEvent, TransactionEvents } from './Transaction.js';
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
} from './TransactionInternal.js';
export {
	NodeInTrait,
	PlaceIndex,
	TreeViewNode,
	TreeView,
	TraitNodeIndex,
	TreeViewPlace,
	TreeViewRange,
	TraitLocation,
} from './TreeView.js';

export {
	type IMigrationEvent,
	type IShim,
	MigrationShim,
	MigrationShimFactory,
	SharedTreeShim,
	SharedTreeShimFactory,
} from './migration-shim/index.js';

export { IRevertible, IUndoConsumer, SharedTreeUndoRedoHandler } from './UndoRedoHandler.js';
