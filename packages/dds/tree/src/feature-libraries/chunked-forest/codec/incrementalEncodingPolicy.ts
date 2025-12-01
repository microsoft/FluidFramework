/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Policy to determine whether a node / field should be incrementally encoded.
 * @param nodeIdentifier - The identifier of the node containing the field.
 * If undefined, the field is a root field.
 * @param fieldKey - The key of the field to check.
 * @returns whether the node / field should be incrementally encoded.
 * @remarks
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
