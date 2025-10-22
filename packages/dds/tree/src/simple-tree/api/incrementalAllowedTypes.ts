/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, TreeNodeSchemaIdentifier } from "../../core/index.js";
import { getTreeNodeSchemaPrivateData, type AllowedTypesFull } from "../core/index.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";
import type { TreeSchema } from "./configuration.js";
import type { IncrementalEncodingPolicy } from "../../feature-libraries/index.js";
import { oneFromIterable } from "../../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";

/**
 * A symbol when present in the {@link AnnotatedAllowedTypes.metadata.custom} property as true, opts in the allowed
 * types to incremental summary optimization.
 * These allowed types will be optimized during summary such that if they don't change across summaries,
 * they will not be encoded and their content will not be included in the summary that is uploaded to the service.
 * @remarks
 * See {@link getShouldIncrementallySummarizeAllowedTypes} for more details.
 *
 * Use {@link SchemaStaticsAlpha.types} to add this metadata to allowed types in a schema.
 * @example
 * ```typescript
 * const sf = new SchemaFactoryAlpha("IncrementalSummarization");
 * class Foo extends sf.objectAlpha("foo", {
 *   bar: sf.types([{ type: sf.string, metadata: {} }], {
 *     custom: { [incrementalSummaryHint]: true },
 *   }),
 * }) {}
 * ```
 */
export const incrementalSummaryHint: unique symbol = Symbol("IncrementalSummaryHint");

/**
 * Returns true if the provided allowed types's custom metadata has {@link incrementalSummaryHint} as true.
 */
function isIncrementalSummaryHintInAllowedTypes(allowedTypes: AllowedTypesFull): boolean {
	const customMetadata = allowedTypes.metadata.custom;
	return (
		customMetadata !== undefined &&
		(customMetadata as Record<symbol, unknown>)[incrementalSummaryHint] === true
	);
}

/**
 * This helper function {@link getShouldIncrementallySummarizeAllowedTypes} can be used to generate a callback function
 * of type {@link IncrementalEncodingPolicy}.
 * This callback can be passed as the value for {@link SharedTreeOptionsInternal.shouldEncodeFieldIncrementally} parameter
 * when creating the tree.
 * It will be called for each {@link AllowedTypes} in the schema to determine if it should be incrementally summarized.
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
					return isIncrementalSummaryHintInAllowedTypes(fieldSchema.allowedTypesFull);
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
		return isIncrementalSummaryHintInAllowedTypes(allowedTypes);
	};
}
