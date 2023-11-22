/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNodeSchemaBase as FlexTreeNodeSchemaBase } from "../feature-libraries";
import { type TreeNodeSchema } from "./schemaFactory";

// Putting this in its own file was the simplest fix for a dependency cycle.

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Only set when TreeNodeSchema are wrapping existing FlexTreeSchema (done for as with leaves).
 */
export const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

export function cachedFlexSchemaFromClassSchema(
	schema: TreeNodeSchema,
): FlexTreeNodeSchemaBase | undefined {
	return (schema as any)[flexSchemaSymbol] as FlexTreeNodeSchemaBase | undefined;
}

export function setFlexSchemaFromClassSchema(
	simple: TreeNodeSchema,
	flex: FlexTreeNodeSchemaBase,
): void {
	(simple as any)[flexSchemaSymbol] = flex;
}
