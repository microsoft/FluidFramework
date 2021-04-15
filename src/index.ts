/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Libraries related to whiteboard collaboration using FluidFramework
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
export { Delta } from './Forest';
export { SharedTreeSummary_0_0_2 } from './SummaryBackCompatibility';
export { sharedTreeAssertionErrorType, isSharedTreeEvent } from './Common';
export * from './Identifiers';
export { OrderedEditSet, EditLogSummary, EditHandle, EditChunkOrHandle } from './EditLog';
export {
	NodeInTrait,
	PlaceIndex,
	SnapshotNode,
	Snapshot,
	TraitNodeIndex,
	SnapshotPlace,
	SnapshotRange,
	Side,
} from './Snapshot';
export { LogViewer, Revision } from './LogViewer';
export { Checkout, CheckoutEvent, ICheckoutEvents, EditValidationResult } from './Checkout';
export { BasicCheckout } from './BasicCheckout';
export {
	SharedTree,
	SharedTreeEditor,
	ChangeType,
	Change,
	Build,
	Insert,
	Detach,
	SetValue,
	Constraint,
	ConstraintEffect,
	Delete,
	Move,
	StablePlace,
	StableRange,
	SharedTreeFactory,
	revert,
	setTrait,
	validateStablePlace,
	validateStableRange,
	rangeFromStableRange,
	placeFromStablePlace,
	Transaction,
	noHistorySummarizer,
	isDetachedSequenceId,
} from './default-edits';
export {
	EditCommittedHandler,
	EditCommittedEventArguments,
	ISharedTreeEvents,
	GenericSharedTree,
	SharedTreeEvent,
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
	EditNode,
	EditResult,
	TraitLocation,
} from './PersistedTypes';
export { newEdit } from './GenericEditUtilities';
export { comparePayloads } from './SnapshotUtilities';
export { GenericTransaction, EditingResult, ValidEditingResult } from './GenericTransaction';
export { SharedTreeSummary, SharedTreeSummaryBase, SharedTreeSummarizer, fullHistorySummarizer } from './Summary';
