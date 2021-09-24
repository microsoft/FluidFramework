/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// API Exports

export { SharedTreeWithAnchors, SharedTreeWithAnchorsEditor } from './SharedTreeWithAnchors';
export * from './PersistedTypes';
export * from './Factory';
export { TransactionWithAnchors } from './TransactionWithAnchors';
export {
	resolveChangeAnchors,
	findLastOffendingChange,
	resolveNodeAnchor,
	resolvePlaceAnchor,
	resolveRangeAnchor,
	updateRelativePlaceAnchorForChange,
	updateRelativePlaceAnchorForPath,
	EvaluatedChange,
	ResolutionFailure,
	ResolutionFailureKind,
	NodeResolutionFailure,
	PlaceResolutionFailure,
	PlaceUpdateFailureKind,
	PlaceUpdateFailure,
	PlaceUpdateDeletedParentFailure,
	RangeResolutionFailure,
	RangeUpdateFailure,
	RangeUpdateFailureKind,
} from './AnchorResolution';
