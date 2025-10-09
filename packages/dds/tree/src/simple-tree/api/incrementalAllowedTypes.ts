/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { FieldKey, TreeNodeSchemaIdentifier } from "../../core/index.js";
import {
	NodeKind,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AllowedTypesMetadata,
} from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
	isRecordNodeSchema,
} from "../node-kinds/index.js";
import { TreeViewConfigurationAlpha } from "./configuration.js";
import { getOrCreate } from "../../util/index.js";
import type { IncrementalEncodingPolicy } from "../../feature-libraries/index.js";

/**
 * A set of allowed types in a schema can be opted in to incremental summary optimization by adding the
 * {@link incrementalAllowedTypesMetadata} to them. These allowed types will be optimized during summary
 * such that if they don't change across summaries, they will not be encoded and their content will not be
 * included in the summary that is uploaded to the service.
 */
export const incrementalAllowedTypesMetadata: AllowedTypesMetadata["custom"] = {
	incrementalSummaryOptimization: true,
};

const schemaCache = new WeakMap<ImplicitFieldSchema, TreeViewConfigurationAlpha>();

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
	rootSchema: ImplicitFieldSchema,
): IncrementalEncodingPolicy {
	const treeSchema = getOrCreate(
		schemaCache,
		rootSchema,
		() => new TreeViewConfigurationAlpha({ schema: rootSchema }),
	);

	return (
		targetNodeIdentifier: TreeNodeSchemaIdentifier | undefined,
		targetFieldKey: FieldKey,
	) => {
		if (targetNodeIdentifier === undefined) {
			// Root fields cannot be allowed types, so we don't incrementally summarize them.
			return false;
		}

		const targetNode = treeSchema.definitions.get(targetNodeIdentifier);
		if (targetNode === undefined) {
			// The requested type is unknown to this schema.
			// In this case we have no hints available from the view schema, and fall back to the default behavior of non-incremental encoding.
			// There are two ways this can happen:
			// 1. The view schema being used does not match the stored schema.
			// 2. The view schema is compatible, but there are unknown optional fields which contain new types not described by the view schema.
			return false;
		}

		if (isObjectNodeSchema(targetNode)) {
			for (const [key, fieldSchema] of targetNode.fields) {
				if (key === targetFieldKey) {
					const annotatedAllowedTypes = normalizeAndEvaluateAnnotatedAllowedTypes(
						fieldSchema.allowedTypes,
					);
					return annotatedAllowedTypes.metadata.custom === incrementalAllowedTypesMetadata;
				}
			}
			return false;
		}

		if (
			isArrayNodeSchema(targetNode) ||
			isMapNodeSchema(targetNode) ||
			isRecordNodeSchema(targetNode)
		) {
			const annotatedAllowedTypes = normalizeAndEvaluateAnnotatedAllowedTypes(targetNode.info);
			return annotatedAllowedTypes.metadata.custom === incrementalAllowedTypesMetadata;
		}

		assert(targetNode.kind === NodeKind.Leaf, "unexpected node kind");
		return false;
	};
}
