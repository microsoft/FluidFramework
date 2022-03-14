/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, Mutable } from './Common';
import { NodeId, StableNodeId } from './Identifiers';
import { convertTreeNodes } from './EditUtilities';
import { NodeIdConverter } from './NodeIdUtilities';
import {
	ChangeNode,
	ChangeNode_0_0_2,
	NodeData,
	StablePlaceInternal_0_0_2,
	StableRangeInternal_0_0_2,
	TraitLocationInternal,
	TraitLocationInternal_0_0_2,
} from './persisted-types';
import { StablePlace, StableRange } from './ChangeTypes';

/**
 * Convert a {@link ChangeNode_0_0_2} to a {@link ChangeNode}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToChangeNode(
	tree: ChangeNode_0_0_2,
	idConverter: NodeIdConverter,
	convertId: (nodeId: StableNodeId, idConverter: NodeIdConverter) => NodeId | undefined = (id, manager) =>
		manager.tryConvertToNodeId(id)
): ChangeNode | undefined {
	return convertTreeNodes<ChangeNode_0_0_2, ChangeNode>(tree, (nodeData) =>
		tryConvertToNodeData(nodeData, idConverter, convertId)
	);
}

/**
 * Convert a {@link ChangeNode} to a {@link ChangeNode_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToChangeNode_0_0_2(
	tree: ChangeNode,
	idConverter: NodeIdConverter,
	convertId: (nodeId: NodeId, idConverter: NodeIdConverter) => StableNodeId | undefined = (id, manager) =>
		manager.tryConvertToStableNodeId(id)
): ChangeNode_0_0_2 | undefined {
	return convertTreeNodes<ChangeNode, ChangeNode_0_0_2>(tree, (nodeData) =>
		tryConvertToNodeData_0_0_2(nodeData, idConverter, convertId)
	);
}

/**
 * Convert a {@link NodeData_0_0_2} to a {@link NodeData}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToNodeData(
	nodeData: NodeData<StableNodeId>,
	idConverter: NodeIdConverter,
	convertId: (nodeId: StableNodeId, idConverter: NodeIdConverter) => NodeId | undefined = (id, manager) =>
		manager.tryConvertToNodeId(id)
): NodeData<NodeId> | undefined {
	const identifier = convertId(nodeData.identifier, idConverter);
	if (identifier === undefined) {
		return undefined;
	}
	const output = { definition: nodeData.definition, identifier };
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

/**
 * Convert a {@link NodeData} to a {@link NodeData_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToNodeData_0_0_2(
	nodeData: NodeData<NodeId>,
	idConverter: NodeIdConverter,
	convertId: (nodeId: NodeId, idConverter: NodeIdConverter) => StableNodeId | undefined = (id, manager) =>
		manager.tryConvertToStableNodeId(id)
): NodeData<StableNodeId> | undefined {
	const identifier = convertId(nodeData.identifier, idConverter);
	if (identifier === undefined) {
		return undefined;
	}
	const output = { definition: nodeData.definition, identifier };
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

/**
 * Convert a {@link TraitLocation} to a {@link TraitLocation_0_0_2}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToTraitLocation(
	traitLocation: TraitLocationInternal_0_0_2,
	idConverter: NodeIdConverter
): TraitLocationInternal | undefined {
	const parent = idConverter.tryConvertToNodeId(traitLocation.parent);
	if (parent === undefined) {
		return undefined;
	}
	return {
		label: traitLocation.label,
		parent,
	};
}

/**
 * Convert a {@link TraitLocation_0_0_2} to a {@link TraitLocation}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToTraitLocation_0_0_2(
	traitLocation: TraitLocationInternal,
	idConverter: NodeIdConverter
): TraitLocationInternal_0_0_2 | undefined {
	const parent = idConverter.tryConvertToStableNodeId(traitLocation.parent);
	if (parent === undefined) {
		return undefined;
	}
	return {
		label: traitLocation.label,
		parent,
	};
}

/**
 * Converts a {@link StableRangeInternal_0_0_2} to a {@link StableRange}. Returns undefined if the conversion was not possible.
 */
export function tryConvertToStableRange(
	stableRange: StableRangeInternal_0_0_2,
	idManager: NodeIdConverter
): StableRange | undefined {
	const start = tryConvertToStablePlace(stableRange.start, idManager);
	if (start === undefined) {
		return undefined;
	}
	const end = tryConvertToStablePlace(stableRange.end, idManager);
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
	stablePlace: StablePlaceInternal_0_0_2,
	idManager: NodeIdConverter
): StablePlace | undefined {
	const stablePlaceNew: Mutable<StablePlace> = {
		side: stablePlace.side,
	};
	if (stablePlace.referenceSibling !== undefined) {
		const nodeId = idManager.tryConvertToNodeId(stablePlace.referenceSibling);
		if (nodeId === undefined) {
			return undefined;
		}
		stablePlaceNew.referenceSibling = nodeId;
	}

	if (stablePlace.referenceTrait !== undefined) {
		const parent = idManager.tryConvertToNodeId(stablePlace.referenceTrait.parent);
		if (parent === undefined) {
			return undefined;
		}
		stablePlaceNew.referenceTrait = {
			label: stablePlace.referenceTrait.label,
			parent,
		};
	}
	return stablePlaceNew;
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
