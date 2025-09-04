/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, TreeNodeSchemaIdentifier } from "../../../core/index.js";

/**
 * Policy to determine whether a node / field should be incrementally encoded.
 * @param nodeIdentifier - The identifier of the node containing the field.
 * @param fieldKey - The key of the field to check.
 * @returns whether the node / field should be incrementally encoded.
 */
export type IncrementalEncodingPolicy = (
	nodeIdentifier: TreeNodeSchemaIdentifier,
	fieldKey: FieldKey,
) => boolean;

/**
 * Default policy for incremental encoding is to not encode incrementally.
 */
export const defaultIncrementalEncodingPolicy: IncrementalEncodingPolicy = (
	nodeIdentifier: TreeNodeSchemaIdentifier,
	fieldKey: FieldKey,
): boolean => {
	return false;
};
