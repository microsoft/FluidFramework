/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TreeNodeSchemaBase } from "../feature-libraries/index.js";
import { TreeNodeSchema } from "./schemaTypes.js";

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Eagerly set on leaves, and lazily set for other cases.
 */
export const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

/**
 * A symbol for storing TreeNodeSchema on FlexTreeNode's schema.
 */
export const simpleNodeSchemaSymbol: unique symbol = Symbol(`simpleNodeSchema`);

export function cachedFlexSchemaFromClassSchema(
	schema: TreeNodeSchema,
): TreeNodeSchemaBase | undefined {
	return (schema as any)[flexSchemaSymbol] as TreeNodeSchemaBase | undefined;
}

export function setFlexSchemaFromClassSchema(
	simple: TreeNodeSchema,
	flex: TreeNodeSchemaBase,
): void {
	assert(!(flexSchemaSymbol in simple), "simple schema already marked");
	assert(!(simpleNodeSchemaSymbol in flex), "flex schema already marked");
	(simple as any)[flexSchemaSymbol] = flex;
	(flex as any)[simpleNodeSchemaSymbol] = simple;
}
