/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mutable } from '../Common';
import { NodeIdConverter } from '../generic';
import { StablePlace, StableRange } from './ChangeTypes';
import { StablePlace_0_0_2, StableRange_0_0_2 } from './PersistedTypes';

/**
 * Converts a {@link StableRange_0_0_2} to a {@link StableRange}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStableRange(
	stableRange_0_0_2: StableRange_0_0_2,
	idManager: NodeIdConverter
): StableRange | undefined {
	const start = tryConvertToStablePlace(stableRange_0_0_2.start, idManager);
	if (start === undefined) {
		return undefined;
	}
	const end = tryConvertToStablePlace(stableRange_0_0_2.end, idManager);
	if (end === undefined) {
		return undefined;
	}
	return { start, end };
}

/**
 * Converts the {@link StableRange} to a {@link StableRange_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStableRange_0_0_2(
	stableRange: StableRange,
	idManager: NodeIdConverter
): StableRange_0_0_2 | undefined {
	const start = tryConvertToStablePlace_0_0_2(stableRange.start, idManager);
	if (start === undefined) {
		return undefined;
	}
	const end = tryConvertToStablePlace_0_0_2(stableRange.end, idManager);
	if (end === undefined) {
		return undefined;
	}
	return { start, end };
}

/**
 * Converts a {@link StablePlace_0_0_2} to a {@link StablePlace}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStablePlace(
	stablePlace_0_0_2: StablePlace_0_0_2,
	idManager: NodeIdConverter
): StablePlace | undefined {
	const stablePlace: Mutable<StablePlace> = {
		side: stablePlace_0_0_2.side,
	};
	if (stablePlace_0_0_2.referenceSibling !== undefined) {
		const nodeId = idManager.tryConvertToNodeId(stablePlace_0_0_2.referenceSibling);
		if (nodeId === undefined) {
			return undefined;
		}
		stablePlace.referenceSibling = nodeId;
	}

	if (stablePlace_0_0_2.referenceTrait !== undefined) {
		const parent = idManager.tryConvertToNodeId(stablePlace_0_0_2.referenceTrait.parent);
		if (parent === undefined) {
			return undefined;
		}
		stablePlace.referenceTrait = {
			label: stablePlace_0_0_2.referenceTrait.label,
			parent,
		};
	}
	return stablePlace;
}

/**
 * Converts the {@link StablePlace} to a {@link StablePlace_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStablePlace_0_0_2(
	stablePlace: StablePlace,
	idConverter: NodeIdConverter
): StablePlace_0_0_2 | undefined {
	const stablePlace_0_0_2: Mutable<StablePlace_0_0_2> = {
		side: stablePlace.side,
	};
	if (stablePlace.referenceSibling !== undefined) {
		const stableId = idConverter.tryConvertToStableNodeId(stablePlace.referenceSibling);
		if (stableId === undefined) {
			return undefined;
		}
		stablePlace_0_0_2.referenceSibling = stableId;
	}

	if (stablePlace.referenceTrait !== undefined) {
		const parent = idConverter.tryConvertToStableNodeId(stablePlace.referenceTrait.parent);
		if (parent === undefined) {
			return undefined;
		}
		stablePlace_0_0_2.referenceTrait = {
			label: stablePlace.referenceTrait.label,
			parent,
		};
	}

	return stablePlace_0_0_2;
}
