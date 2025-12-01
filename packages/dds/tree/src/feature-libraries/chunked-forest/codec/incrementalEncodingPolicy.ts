/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Policy type to determine whether one of more fields of {@link NodeKind} in a schema should be incrementally encoded.
 * @param nodeIdentifier - The identifier of the node. The node is one of the kinds defined in {@link NodeKind}.
 * @param fieldKey - The key of the field in the node's children:
 * For {@link NodeKind.Object} nodes, this is the key of one of its fields.
 * For {@link NodeKind.Leaf} nodes, this is not applicable because incremental encoding is not supported.
 * For all other node kinds, this will be an empty string and the policy will apply to all their fields.
 * @returns whether the field in the node should be incrementally encoded.
 *
 * @remarks
 * See {@link incrementalEncodingPolicyForAllowedTypes} for an example policy implementation.
 *
 * Incremental encoding has a significant size overhead,
 * but allows reuse of previously encoded unchanged subtrees.
 * Thus it should only be enabled for large subtrees which are modified infrequently.
 * TODO: AB#9068: Measure the actual overhead.
 * @alpha
 */
export type IncrementalEncodingPolicy = (
	nodeIdentifier: string | undefined,
	fieldKey: string,
) => boolean;

/**
 * Default policy for incremental encoding is to not encode incrementally.
 */
export const defaultIncrementalEncodingPolicy: IncrementalEncodingPolicy = (
	nodeIdentifier: string | undefined,
	fieldKey: string,
): boolean => {
	return false;
};
