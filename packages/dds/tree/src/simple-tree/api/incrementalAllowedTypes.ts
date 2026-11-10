/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { FieldKey } from "../../core/index.js";
import type { IncrementalEncodingPolicy } from "../../feature-libraries/index.js";
import { oneFromIterable } from "../../util/index.js";
import { getTreeNodeSchemaPrivateData, type AllowedTypesFull } from "../core/index.js";
import type { FieldPropsAlpha } from "../fieldSchema.js";
import { isArrayNodeSchema, isObjectNodeSchema } from "../node-kinds/index.js";
import type { TreeSchema } from "../treeSchema.js";

/**
 * A symbol when present in the {@link AnnotatedAllowedTypes.metadata}'s `custom` property as true, opts in the allowed
 * types to incremental summary optimization.
 * These allowed types will be optimized during summary such that if they don't change across summaries,
 * they will not be encoded and their content will not be included in the summary that is uploaded to the service.
 * @remarks
 * See {@link incrementalEncodingPolicyForAllowedTypes} for more details.
 *
 * For new schemas, prefer setting {@link FieldPropsAlpha.summarizeIncrementally} through a
 * {@link SchemaFactoryAlpha} field creation API rather than using this symbol directly.
 * @example
 * ```typescript
 * const sf = new SchemaFactoryAlpha("IncrementalSummarization");
 * class Foo extends sf.objectAlpha("foo", {
 *   bar: sf.required(sf.string, { summarizeIncrementally: true }),
 * }) {}
 * ```
 * @alpha
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
 * This helper function {@link incrementalEncodingPolicyForAllowedTypes} can be used to generate a callback function
 * of type {@link IncrementalEncodingPolicy}. It determines if each field in a schema should be incrementally
 * summarized.
 * This callback can be passed as the value for {@link SharedTreeOptions.shouldEncodeIncrementally} parameter
 * when creating the tree.
 *
 * @param rootSchema - The schema for the root of the tree.
 * @returns A callback function of type {@link IncrementalEncodingPolicy} which determines if fields should
 * be incrementally summarized based on whether they have opted in via
 * {@link FieldPropsAlpha.summarizeIncrementally}.
 *
 * @remarks
 * This only works for forest type {@link ForestTypeOptimized} and compression strategy
 * {@link TreeCompressionStrategy.CompressedIncremental}.
 * See the {@link https://fluidframework.com/docs/data-structures/tree/incremental-summary/ | Incremental Summary documentation}
 * for setup instructions and details about how incremental summary works.
 *
 * @alpha
 */
export function incrementalEncodingPolicyForAllowedTypes(
	rootSchema: TreeSchema,
): IncrementalEncodingPolicy {
	return (targetNodeIdentifier: string | undefined, targetFieldKey?: string) => {
		if (targetNodeIdentifier === undefined) {
			// The root is already an independent summary boundary.
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
			if (targetFieldKey === undefined) {
				throw new UsageError(
					`Field key must be provided for object or array node '${targetNodeIdentifier}'`,
				);
			}
			const targetPropertyKey = targetNode.storedKeyToPropertyKey.get(
				targetFieldKey as FieldKey,
			);
			if (targetPropertyKey !== undefined) {
				const fieldSchema = targetNode.fields.get(targetPropertyKey);
				if (fieldSchema !== undefined) {
					return (
						(fieldSchema.props as Partial<FieldPropsAlpha> | undefined)
							?.summarizeIncrementally ??
						isIncrementalSummaryHintInAllowedTypes(fieldSchema.allowedTypesFull)
					);
				}
			}
			return false;
		}

		if (targetFieldKey !== undefined && !isArrayNodeSchema(targetNode)) {
			throw new UsageError(
				`Field key must not be provided for leaf, map or record node '${targetNodeIdentifier}'`,
			);
		}

		const allowedTypes = oneFromIterable(
			getTreeNodeSchemaPrivateData(targetNode).childAllowedTypes,
		);
		assert(
			allowedTypes !== undefined,
			0xc87 /* Non object nodes with fields should only have one allowedTypes entry */,
		);
		return isIncrementalSummaryHintInAllowedTypes(allowedTypes);
	};
}
