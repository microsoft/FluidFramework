/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeIndexKey } from "../../feature-libraries/index.js";
import { FieldKind, type ImplicitFieldSchema } from "../schemaTypes.js";
import type { TreeNode } from "../core/index.js";
import { ObjectNodeSchema } from "../objectNodeTypes.js";
import type { TreeView } from "./tree.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
import { createSimpleTreeIndex, type SimpleTreeIndex } from "./simpleTreeIndex.js";

/**
 * An index that returns tree nodes given their associated identifiers.
 *
 * @alpha
 */
export type IdentifierIndex = SimpleTreeIndex<string, TreeNode>;

function isStringKey(key: TreeIndexKey): key is string {
	return typeof key === "string";
}

/**
 * Creates an {@link IdentifierIndex} for a given {@link TreeView}.
 *
 * @alpha
 */
export function createIdentifierIndex<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): IdentifierIndex {
	// For each node schema, find which field key the identifier field is under.
	// This can be done easily because identifiers are their own field kinds.
	const identifierFields = new Map<string, string>();
	walkFieldSchema(view.schema, {
		node: (schemus) => {
			if (schemus instanceof ObjectNodeSchema) {
				for (const [fieldKey, fieldSchema] of schemus.fields.entries()) {
					if (fieldSchema.kind === FieldKind.Identifier) {
						identifierFields.set(schemus.identifier, fieldKey);
						break;
					}
				}
			}
		},
	});

	return createSimpleTreeIndex(
		view,
		(schemus) => identifierFields.get(schemus.identifier),
		(nodes) => {
			if (nodes.length > 1) {
				throw new UsageError(
					"cannot retrieve node from index: there are multiple nodes with the same identifier",
				);
			}

			return nodes[0];
		},
		isStringKey,
	);
}
