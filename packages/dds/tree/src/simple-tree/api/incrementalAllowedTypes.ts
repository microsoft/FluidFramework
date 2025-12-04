/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTreeNodeSchemaPrivateData, type AllowedTypesFull } from "../core/index.js";
import { isArrayNodeSchema, isObjectNodeSchema } from "../node-kinds/index.js";
import type { TreeSchema } from "./configuration.js";
import type { IncrementalEncodingPolicy } from "../../feature-libraries/index.js";
import { oneFromIterable } from "../../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import type { FieldKey } from "../../core/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * A symbol when present in the {@link AnnotatedAllowedTypes.metadata}'s `custom` property as true, opts in the allowed
 * types to incremental summary optimization.
 * These allowed types will be optimized during summary such that if they don't change across summaries,
 * they will not be encoded and their content will not be included in the summary that is uploaded to the service.
 * @remarks
 * See {@link incrementalEncodingPolicyForAllowedTypes} for more details.
 *
 * Use {@link SchemaStaticsBeta.types} to add this metadata to allowed types in a schema.
 * @example
 * ```typescript
 * const sf = new SchemaFactoryAlpha("IncrementalSummarization");
 * class Foo extends sf.objectAlpha("foo", {
 *   bar: sf.types([{ type: sf.string, metadata: {} }], {
 *     custom: { [incrementalSummaryHint]: true },
 *   }),
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
 * of type {@link IncrementalEncodingPolicy}. It determines if each {@link AllowedTypes} in a schema should be
 * incrementally summarized.
 * This callback can be passed as the value for {@link SharedTreeOptions.shouldEncodeIncrementally} parameter
 * when creating the tree.
 *
 * @param rootSchema - The schema for the root of the tree.
 * @returns A callback function of type {@link IncrementalEncodingPolicy} which determines if allowed types should
 * be incrementally summarized based on whether they have opted in via the {@link incrementalSummaryHint} metadata.
 *
 * @remarks
 * This only works for forest type {@link ForestTypeOptimized} and compression strategy
 * {@link TreeCompressionStrategy.CompressedIncremental}.
 *
 * @privateRemarks
 * The {@link incrementalSummaryHint} will be replaced with a specialized metadata property once the
 * incremental summary feature and APIs are stabilized.
 *
 * @alpha
 */
export function incrementalEncodingPolicyForAllowedTypes(
	rootSchema: TreeSchema,
): IncrementalEncodingPolicy {
	return (targetNodeIdentifier: string | undefined, targetFieldKey?: string) => {
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
					return isIncrementalSummaryHintInAllowedTypes(fieldSchema.allowedTypesFull);
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
