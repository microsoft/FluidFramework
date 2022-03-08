/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mutable } from '../Common';
import { NodeIdConverter } from '../generic';
import { StablePlace, StableRange } from './ChangeTypes';
import { StablePlaceInternal_0_0_2, StableRangeInternal_0_0_2 } from './persisted-types';

/**
 * Converts a {@link StableRangeInternal_0_0_2} to a {@link StableRange}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStableRange(
	StableRangeInternal_0_0_2: StableRangeInternal_0_0_2,
	idManager: NodeIdConverter
): StableRange | undefined {
	const start = tryConvertToStablePlace(StableRangeInternal_0_0_2.start, idManager);
	if (start === undefined) {
		return undefined;
	}
	const end = tryConvertToStablePlace(StableRangeInternal_0_0_2.end, idManager);
	if (end === undefined) {
		return undefined;
	}
	return { start, end };
}

/**
 * Converts the {@link StableRange} to a {@link StableRangeInternal_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStableRangeInternal_0_0_2(
	stableRange: StableRange,
	idManager: NodeIdConverter
): StableRangeInternal_0_0_2 | undefined {
	const start = tryConvertToStablePlaceInternal_0_0_2(stableRange.start, idManager);
	if (start === undefined) {
		return undefined;
	}
	const end = tryConvertToStablePlaceInternal_0_0_2(stableRange.end, idManager);
	if (end === undefined) {
		return undefined;
	}
	return { start, end };
}

/**
 * Converts a {@link StablePlaceInternal_0_0_2} to a {@link StablePlace}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStablePlace(
	StablePlaceInternal_0_0_2: StablePlaceInternal_0_0_2,
	idManager: NodeIdConverter
): StablePlace | undefined {
	const stablePlace: Mutable<StablePlace> = {
		side: StablePlaceInternal_0_0_2.side,
	};
	if (StablePlaceInternal_0_0_2.referenceSibling !== undefined) {
		const nodeId = idManager.tryConvertToNodeId(StablePlaceInternal_0_0_2.referenceSibling);
		if (nodeId === undefined) {
			return undefined;
		}
		stablePlace.referenceSibling = nodeId;
	}

	if (StablePlaceInternal_0_0_2.referenceTrait !== undefined) {
		const parent = idManager.tryConvertToNodeId(StablePlaceInternal_0_0_2.referenceTrait.parent);
		if (parent === undefined) {
			return undefined;
		}
		stablePlace.referenceTrait = {
			label: StablePlaceInternal_0_0_2.referenceTrait.label,
			parent,
		};
	}
	return stablePlace;
}

/**
 * Converts the {@link StablePlace} to a {@link StablePlaceInternal_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStablePlaceInternal_0_0_2(
	stablePlace: StablePlace,
	idConverter: NodeIdConverter
): StablePlaceInternal_0_0_2 | undefined {
	const StablePlaceInternal_0_0_2: Mutable<StablePlaceInternal_0_0_2> = {
		side: stablePlace.side,
	};
	if (stablePlace.referenceSibling !== undefined) {
		const stableId = idConverter.tryConvertToStableNodeId(stablePlace.referenceSibling);
		if (stableId === undefined) {
			return undefined;
		}
		StablePlaceInternal_0_0_2.referenceSibling = stableId;
	}

	if (stablePlace.referenceTrait !== undefined) {
		const parent = idConverter.tryConvertToStableNodeId(stablePlace.referenceTrait.parent);
		if (parent === undefined) {
			return undefined;
		}
		StablePlaceInternal_0_0_2.referenceTrait = {
			label: stablePlace.referenceTrait.label,
			parent,
		};
	}

	return StablePlaceInternal_0_0_2;
}
