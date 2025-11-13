/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, TreeNodeSchemaIdentifier } from "../../../core/index.js";

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
 */
export type IncrementalEncodingPolicy = (
	nodeIdentifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey,
) => boolean;

/**
 * Default policy for incremental encoding is to not encode incrementally.
 */
export const defaultIncrementalEncodingPolicy: IncrementalEncodingPolicy = (
	nodeIdentifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey,
): boolean => {
	return false;
};
