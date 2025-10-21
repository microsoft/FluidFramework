/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, TreeNodeSchemaIdentifier } from "../../core/index.js";
import {
	getTreeNodeSchemaPrivateData,
	type AllowedTypesFull,
	type AllowedTypesMetadata,
} from "../core/index.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";
import type { TreeSchema } from "./configuration.js";
import type { IncrementalEncodingPolicy } from "../../feature-libraries/index.js";
import { oneFromIterable } from "../../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";

export const incrementalSummaryOptimizationSymbol: unique symbol = Symbol(
	"IncrementalSummaryOptimization",
);

/**
 * A set of allowed types in a schema can be opted in to incremental summary optimization by adding the
 * {@link incrementalAllowedTypesMetadata} to them. These allowed types will be optimized during summary
 * such that if they don't change across summaries, they will not be encoded and their content will not be
 * included in the summary that is uploaded to the service.
 */
export const incrementalAllowedTypesMetadata: AllowedTypesMetadata["custom"] = {
	[incrementalSummaryOptimizationSymbol]: true,
};

/**
 * Returns true if the provided allowed types has the {@link incrementalAllowedTypesMetadata} custom metadata.
 */
function isIncrementalAllowedTypesMetadata(allowedTypes: AllowedTypesFull): boolean {
	const customMetadata = allowedTypes.metadata.custom;
	return (
		customMetadata !== undefined &&
		(customMetadata as Record<symbol, unknown>)[incrementalSummaryOptimizationSymbol] === true
	);
}

/**
 * This helper function {@link getShouldIncrementallySummarizeAllowedTypes} can be used to generate a callback function
 * of type {@link IncrementalEncodingPolicy}.
 * This callback can be passed as the value for {@link SharedTreeOptionsInternal.shouldEncodeFieldIncrementally} parameter
 * when creating the tree.
 * It will be called for each allowed types in the schema to determine if it should be incrementally summarized.
 *
 * @param rootSchema - The schema for the root of the tree.
 * @returns A callback function of type {@link IncrementalEncodingPolicy} which can be used to determine if a field
 * should be incrementally summarized based on whether it is an allowed types with the
 * {@link incrementalAllowedTypesMetadata} metadata.
 *
 * @remarks
 * This only works for forest type {@link ForestTypeOptimized} and compression strategy
 * {@link TreeCompressionStrategyExtended.CompressedIncremental}.
 *
 * The {@link incrementalAllowedTypesMetadata} will be replaced with a specialized metadata property once the
 * incremental summary feature and APIs are stabilized.
 */
export function getShouldIncrementallySummarizeAllowedTypes(
	rootSchema: TreeSchema,
): IncrementalEncodingPolicy {
	return (
		targetNodeIdentifier: TreeNodeSchemaIdentifier | undefined,
		targetFieldKey: FieldKey,
	) => {
		if (targetNodeIdentifier === undefined) {
			// Root fields cannot be allowed types, so we don't incrementally summarize them.
			return false;
		}

		const targetNode = rootSchema.definitions.get(targetNodeIdentifier);
		if (targetNode === undefined) {
			// The requested type is unknown to this schema.
			// In this case we have no hints available from the view schema, and fall back to the default behavior of non-incremental encoding.
			// There are two ways this can happen:
			// 1. The view schema being used does not match the stored schema.
			// 2. The view schema is compatible, but there are unknown optional fields which contain new types not described by the view schema.
			return false;
		}

		if (isObjectNodeSchema(targetNode)) {
			const targetPropertyKey = targetNode.storedKeyToPropertyKey.get(targetFieldKey);
			if (targetPropertyKey !== undefined) {
				const fieldSchema = targetNode.fields.get(targetPropertyKey);
				if (fieldSchema !== undefined) {
					return isIncrementalAllowedTypesMetadata(fieldSchema.allowedTypesFull);
				}
			}
			return false;
		}

		const allowedTypes = oneFromIterable(
			getTreeNodeSchemaPrivateData(targetNode).childAllowedTypes,
		);
		assert(
			allowedTypes !== undefined,
			"Non object nodes with fields should only have one allowedTypes entry",
		);
		return isIncrementalAllowedTypesMetadata(allowedTypes);
	};
}
