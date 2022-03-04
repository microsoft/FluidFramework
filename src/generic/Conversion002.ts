/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined } from '../Common';
import { NodeId, StableNodeId } from '../Identifiers';
import { convertTreeNodes } from './EditUtilities';
import { NodeIdConverter } from './NodeIdUtilities';
import { ChangeNode, ChangeNode_0_0_2, NodeData, TraitLocation, TraitLocation_0_0_2 } from './PersistedTypes';

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
	traitLocation: TraitLocation_0_0_2,
	idConverter: NodeIdConverter
): TraitLocation | undefined {
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
	traitLocation: TraitLocation,
	idConverter: NodeIdConverter
): TraitLocation_0_0_2 | undefined {
	const parent = idConverter.tryConvertToStableNodeId(traitLocation.parent);
	if (parent === undefined) {
		return undefined;
	}
	return {
		label: traitLocation.label,
		parent,
	};
}
