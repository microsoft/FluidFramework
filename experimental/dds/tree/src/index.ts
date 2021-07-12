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
 * This file represents the public API. Consumers of this package will not see exported modules unless they are enumerated here.
 * Removing / editing existing exports here will often indicate a breaking change, so please be cognizant of changes made here.
 */

// API Exports

export { initialTree } from './InitialTree';
export { TreeNodeHandle } from './TreeNodeHandle';
export { Delta } from './Forest';
export { sharedTreeAssertionErrorType, isSharedTreeEvent, comparePayloads } from './Common';
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
export * from './ReconciliationPath';
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
	isDetachedSequenceId,
} from './default-edits';
export {
	EditCommittedHandler,
	EditCommittedEventArguments,
	ISharedTreeEvents,
	GenericSharedTree,
	SharedTreeEvent,
	SharedTreeDiagnosticEvent,
	Edit,
	newEdit,
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
	GenericTransaction,
	EditingResult,
	ValidEditingResult,
	SharedTreeSummarizer,
	SharedTreeSummary,
	SharedTreeSummaryBase,
} from './generic';
