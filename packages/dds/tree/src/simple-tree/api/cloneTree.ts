/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeFieldStoredSchema } from "../../core/index.js";
import { FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { getKernel, isTreeNode, type Unhydrated } from "../core/index.js";
import { getUnhydratedContextWithStoredSchema } from "../createContext.js";
import type { ImplicitFieldSchema, TreeFieldFromImplicitField } from "../fieldSchema.js";

import { createFromCursor } from "./create.js";

/**
 * Clones the persisted data associated with a node.
 */
export function cloneTree<const TSchema extends ImplicitFieldSchema>(
	node: TreeFieldFromImplicitField<TSchema>,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	if (!isTreeNode(node)) {
		return node;
	}

	const kernel = getKernel(node);
	const cursor = kernel.getInnerNode().borrowCursor();
	const context = getUnhydratedContextWithStoredSchema(
		kernel.schema,
		kernel.context.flexContext.schema,
	);

	const fieldSchema: TreeFieldStoredSchema = {
		kind: FieldKinds.required.identifier,
		types: new Set([brand(kernel.schema.identifier)]),
		persistedMetadata: undefined,
	};
	return createFromCursor(kernel.schema, cursor, fieldSchema, context) as Unhydrated<
		TreeFieldFromImplicitField<TSchema>
	>;
}
