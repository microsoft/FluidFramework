/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * \@intentional/shared-tree
 *
 * Libraries related to whiteboard collaboration using FluidFramework
 * @packageDocumentation
 */

/**
 * This file represents the public API. Consumers of this package will not see exported modules unless they are enumerated here.
 * Removing / editing existing exports here will often indicate a breaking change, so please be cognizant of changes made here.
 */

// API Exports

export { initialTree } from './InitialTree';
export { BlobId, SharedTree, SharedTreeEvent, SharedTreeEditor } from './SharedTree';
export { TreeNodeHandle } from './TreeNodeHandle';
export { Delta } from './Forest';
export { SharedTreeSummaryBase, SharedTreeSummarizer, fullHistorySummarizer, noHistorySummarizer } from './Summary';
export { sharedTreeAssertionErrorType } from './Common';
export * from './PersistedTypes';
export * from './Factory';
export * from './HistoryEditFactory';
export * from './Identifiers';
export { OrderedEditSet, EditLogSummary } from './EditLog';
export {
	EditValidationResult,
	NodeInTrait,
	PlaceIndex,
	SnapshotNode,
	Snapshot,
	TraitNodeIndex,
	SnapshotPlace,
	SnapshotRange,
} from './Snapshot';
export { setTrait } from './EditUtilities';
export { LogViewer } from './LogViewer';
export { Checkout, CheckoutEvent } from './Checkout';
export { PrefetchingCheckout } from './PrefetchingCheckout';
export { BasicCheckout } from './BasicCheckout';
