/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../core/index.js";
import { defaultSchemaPolicy } from "../feature-libraries/index.js";

import {
	Context,
	UnhydratedContext,
	type TreeNodeSchema,
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
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
 * Utility for creating {@link Context}s for unhydrated nodes that use the provided stored schema.
 * @remarks
 * Unlike {@link getUnhydratedContext}, the resulting context uses `storedSchema`, not a stored schema derived from `schema`.
 * Use this for nodes that must agree with the stored schema of a document, which can include unknown optional fields.
 */
export function getUnhydratedContextWithStoredSchema(
	schema: ImplicitFieldSchema,
	storedSchema: TreeStoredSchema,
): Context {
	return new Context(
		new UnhydratedContext(defaultSchemaPolicy, storedSchema.nodeSchema),
		getRootSchemaDerivedData(schema).definitions,
	);
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
