/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	KeyFinderDependencyScope,
	type TreeIndex,
	type TreeIndexNodes,
} from "../../feature-libraries/index.js";
import type { TreeNode } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

import { createTreeIndexWithDependencyScope, type TreeIndexKey } from "./simpleTreeIndex.js";
import type { TreeView } from "./tree.js";
import { getPropertyKeyFromStoredKey } from "./treeNodeApi.js";
import { oneFromIterable } from "../../util/index.js";

/**
 * An index that returns tree nodes given their associated identifiers.
 *
 * @remarks
 * Create an identifier index with {@link createIdentifierIndex} to index fields defined using
 * {@link SchemaFactory.identifier}.
 *
 * @beta
 */
export type IdentifierIndex = TreeIndex<string, TreeNode>;

function isStringKey(key: TreeIndexKey): key is string {
	return typeof key === "string";
}

/**
 * Creates an {@link IdentifierIndex} for a given {@link TreeView}.
 *
 * @remarks
 * The sole identifier field of each schema reachable from the view's schema is indexed automatically. Schemas with
 * no identifier fields or multiple identifier fields are not indexed. The index remains up to date as nodes are
 * inserted, removed, or changed. Looking up an identifier shared by multiple nodes throws a
 * `UsageError`. Call {@link TreeIndex.dispose} when the index is no longer needed.
 * @privateRemarks
 * TODO: Performance:
 * This currently uses full identifiers strings, and does not leverage any form of identifier compression or optimization.
 * In the future, we may want to optimize it to use shortIds where practical internally, and/or provide an alternative which works in terms of ShortIds.
 *
 * TODO:
 * In the future we may want to make it possible for an index to store the same node multiple times under different keys (allow key finder to return 0 or more keys).
 * If done, we should reevaluate the policy to skip nodes with multiple identifiers: maybe provide an option to opt out of that (and/or an option to error if they are encountered).
 *
 * @beta
 */
export function createIdentifierIndex<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): IdentifierIndex {
	// For each node schema, include it if it has exactly one identifier field.
	const identifierFields = new Map<string, string>();
	walkFieldSchema(view.schema, {
		node: (schema) => {
			if (isObjectNodeSchema(schema)) {
				const storedKey = oneFromIterable(schema.identifierFieldKeys);
				if (storedKey !== undefined) {
					const propertyKey = getPropertyKeyFromStoredKey(schema, storedKey);
					identifierFields.set(schema.identifier, propertyKey.toString());
				}
			}
		},
	});

	return createTreeIndexWithDependencyScope(
		view,
		(schema) => identifierFields.get(schema.identifier),
		(nodes: TreeIndexNodes<TreeNode>) => {
			if (nodes.length > 1) {
				throw new UsageError(
					"cannot retrieve node from index: there are multiple nodes with the same identifier",
				);
			}

			return nodes[0];
		},
		isStringKey,
		KeyFinderDependencyScope.Immutable,
	);
}
