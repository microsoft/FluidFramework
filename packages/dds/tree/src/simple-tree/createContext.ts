/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Context, TreeNodeSchema, TreeNodeSchemaInitializedData } from "./core/index.js";
import type { ImplicitFieldSchema } from "./fieldSchema.js";
import { getRootSchemaDerivedData, SchemaComponent } from "./treeSchema.js";

/**
 * Utility for creating {@link Context}s for unhydrated nodes.
 * @remarks
 * The resulting context will not allow any unknown optional fields.
 */
export function getUnhydratedContext(schema: ImplicitFieldSchema): Context {
	return getRootSchemaDerivedData(schema).context;
}

/**
 * Utility for creating {@link TreeNodeSchemaInitializedData}.
 * @remarks
 * Node-specific conversion handlers belong to this initialization data.
 * Its component owns shared definitions and the lazy default context.
 * Stored-schema generation can access root analysis without invoking node initialization.
 */
export function getTreeNodeSchemaInitializedData(
	schema: TreeNodeSchema,
	handler: Pick<TreeNodeSchemaInitializedData, "toFlexContent" | "shallowCompatibilityTest">,
): TreeNodeSchemaInitializedData {
	return {
		...handler,
		component: SchemaComponent.fromSchema(schema),
	};
}
