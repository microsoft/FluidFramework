/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, TreeNodeSchemaIdentifier } from "../../core/index.js";
import { normalizeAnnotatedAllowedTypes, type AllowedTypesMetadata } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
} from "../node-kinds/index.js";
import { TreeViewConfigurationAlpha } from "./configuration.js";

/**
 * Metadata that can be added to allowed types in a schema to opt them in to incremental summary optimization.
 */
export const incrementalAllowedTypesMetadata: AllowedTypesMetadata["custom"] = {
	incrementalSummaryOptimization: true,
};

/**
 * A set of allowed types in a schema can be opted in to incremental summary optimization by adding the
 * {@link incrementalAllowedTypesMetadata} to them. These allowed types will be optimized during summary
 * such that if they don't change across summaries, they will not be encoded and their content will not be
 * included in the summary that is uploaded to the service.
 *
 * In addition, {@link SharedTreeOptionsInternal.shouldEncodeFieldIncrementally} must be passed when creating
 * the tree. This callback function will be called for each allowed types in the schema to determine if it
 * should be incrementally summarized.
 * The helper function {@link shouldIncrementallySummarizeAllowedTypes} can be used to implement this callback which
 * takes in the schema and the node identifier and field key of the target allowed types. The last two parameters
 * are the same as the ones in {@link SharedTreeOptionsInternal.shouldEncodeFieldIncrementally}.
 *
 * @remarks
 * This only works for forest type {@link ForestTypeOptimized} and compression strategy
 * {@link TreeCompressionStrategyExtended.CompressedIncremental}.
 *
 * The {@link incrementalAllowedTypesMetadata} will be replaced with a specialized metadata property once the
 * incremental summary feature and APIs are stabilized.
 */
export function shouldIncrementallySummarizeAllowedTypes<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
>(
	targetNodeIdentifier: TreeNodeSchemaIdentifier,
	targetFieldKey: FieldKey,
	schema: TSchema,
): boolean {
	const treeSchema = new TreeViewConfigurationAlpha({ schema });
	const targetNode = treeSchema.definitions.get(targetNodeIdentifier);
	if (targetNode === undefined) {
		return false;
	}

	if (isObjectNodeSchema(targetNode)) {
		for (const [key, fieldSchema] of targetNode.fields) {
			if (key === targetFieldKey) {
				const annotatedAllowedTypes = normalizeAnnotatedAllowedTypes(
					fieldSchema.annotatedAllowedTypes,
				);
				return annotatedAllowedTypes.metadata.custom === incrementalAllowedTypesMetadata;
			}
		}
		return false;
	}

	if (isArrayNodeSchema(targetNode) || isMapNodeSchema(targetNode)) {
		const annotatedAllowedTypes = normalizeAnnotatedAllowedTypes(targetNode.info);
		return annotatedAllowedTypes.metadata.custom === incrementalAllowedTypesMetadata;
	}

	return false;
}
