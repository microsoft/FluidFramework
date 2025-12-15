/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Policy type to determine whether one of more fields of a {@link NodeKind | node} in a schema should be incrementally encoded.
 * @param nodeIdentifier - The identifier of the node. The node is one of the kinds defined in {@link NodeKind}.
 * @param fieldKey - An optional key for fields in the node. It must be one of the following based on the kind of node.
 * Policy implementations may throw an error if the provided key is invalid for the node kind:
 * - {@link NodeKind.Object | object} - Must be defined and should be the key of one of its fields. If the object node does not
 * have a field with the specified key, returns false.
 * - {@link NodeKind.Array | array} - Must be defined and be the "" (empty string) which is special value for arrays.
 * - {@link NodeKind.Map | map} and {@link NodeKind.Record | record} - Must be undefined.
 * - {@link NodeKind.Leaf | leaf} - Must be undefined. Leaf nodes do not support incremental encoding. If called for leaf nodes,
 * returns false.
 *
 * @remarks
 * See {@link incrementalEncodingPolicyForAllowedTypes} for a reference policy implementation.
 *
 * Incremental encoding has a significant size overhead,
 * but allows reuse of previously encoded unchanged subtrees.
 * Thus it should only be enabled for large subtrees which are modified infrequently.
 * TODO: AB#9068: Measure the actual overhead.
 * @alpha
 */
export type IncrementalEncodingPolicy = (
	nodeIdentifier: string | undefined,
	fieldKey?: string,
) => boolean;

/**
 * Default policy for incremental encoding is to not encode incrementally.
 */
export const defaultIncrementalEncodingPolicy: IncrementalEncodingPolicy = (
	nodeIdentifier: string | undefined,
	fieldKey?: string,
): boolean => {
	return false;
};
