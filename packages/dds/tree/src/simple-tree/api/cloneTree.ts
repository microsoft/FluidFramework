/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeFieldStoredSchema } from "../../core/index.js";
import { defaultSchemaPolicy, FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	Context,
	getKernel,
	isTreeNode,
	UnhydratedContext,
	type Unhydrated,
} from "../core/index.js";
import { getUnhydratedContext } from "../createContext.js";
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
	const flexContext = new UnhydratedContext(
		defaultSchemaPolicy,
		kernel.context.flexContext.schema,
	);
	const context = new Context(flexContext, getUnhydratedContext(kernel.schema).schema);

	const fieldSchema: TreeFieldStoredSchema = {
		kind: FieldKinds.required.identifier,
		types: new Set([brand(kernel.schema.identifier)]),
		persistedMetadata: undefined,
	};
	return createFromCursor(kernel.schema, cursor, fieldSchema, context) as Unhydrated<
		TreeFieldFromImplicitField<TSchema>
	>;
}
