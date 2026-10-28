/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getTreeNodeSchemaPrivateData,
	type TreeNodeSchema,
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
import { SchemaComponent } from "./treeSchema.js";

/**
 * Utility for creating {@link TreeNodeSchemaInitializedData}.
 * @remarks
 * Node-specific conversion handlers and evaluated child types belong to this initialization data.
 * Its component owns shared definitions and the lazy default context.
 * Stored-schema generation can access root analysis without invoking node initialization.
 */
export function getTreeNodeSchemaInitializedData(
	schema: TreeNodeSchema,
	handler: Pick<TreeNodeSchemaInitializedData, "toFlexContent" | "shallowCompatibilityTest">,
): TreeNodeSchemaInitializedData {
	const data = getTreeNodeSchemaPrivateData(schema);
	return {
		...handler,
		component: SchemaComponent.fromSchema(schema),
		childAllowedTypes: data.childAllowedTypes.map((t) => t.evaluate()),
	};
}
