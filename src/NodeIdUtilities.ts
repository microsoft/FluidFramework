/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeId, StableNodeId } from './Identifiers';
import { NodeData } from './persisted-types';

/**
 * An object which can generate node IDs and convert node IDs between compressed and stable variants
 * @public
 */
export interface NodeIdContext extends NodeIdGenerator, NodeIdConverter {}

/**
 * An object which can generate node IDs
 * @public
 */
export interface NodeIdGenerator {
	/**
	 * Generate an identifier that may be used for a new node that will be inserted into this tree
	 * @param override - an optional UUID to associate with the new id for future lookup
	 */
	generateNodeId(override?: string): NodeId;
}

/**
 * An object which can convert node IDs between compressed and stable variants
 * @public
 */
export interface NodeIdConverter {
	/**
	 * Given a NodeId, return the corresponding UUID. The result is safe to persist and re-use across `SharedTree` instances, unlike NodeId
	 */
	convertToStableNodeId(id: NodeId): StableNodeId;

	/**
	 * Given a NodeId, attempt to return the corresponding UUID.
	 * The returned UUID is undefined if no such ID was ever created. If a UUID is returned, it is not guaranteed to be in the current
	 * revision (but it is guaranteed to exist in at least one prior revision).
	 */
	tryConvertToStableNodeId(id: NodeId): StableNodeId | undefined;

	/**
	 * Given an UUID, return the corresponding NodeId.
	 * The returned NodeId is not guaranteed to be in the current revision (but it is guaranteed to exist in at least one prior revision).
	 */
	convertToNodeId(id: StableNodeId): NodeId;

	/**
	 * Given an UUID, attempt to return the corresponding NodeId.
	 * The returned NodeId is undefined if no such ID was ever created. If a NodeId is returned, it is not guaranteed to be in the current
	 * revision (but it is guaranteed to exist in at least one prior revision).
	 */
	tryConvertToNodeId(id: StableNodeId): NodeId | undefined;
}

/** Accepts either a node or a node's identifier, and returns the identifier */
export function getNodeId<TId>(node: TId | NodeData<TId>): TId {
	return (node as NodeData<TId>).identifier ?? (node as TId);
}
