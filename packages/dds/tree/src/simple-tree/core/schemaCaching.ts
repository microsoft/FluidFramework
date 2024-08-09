/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { FlexTreeNodeSchema, TreeNodeSchemaBase } from "../../feature-libraries/index.js";
import { fail } from "../../util/index.js";

import type { TreeNodeSchema } from "./treeNodeSchema.js";

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Eagerly set on leaves, and lazily set for other cases.
 */
const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

/**
 * A symbol for storing TreeNodeSchema on FlexTreeNode's schema.
 */
const simpleNodeSchemaSymbol: unique symbol = Symbol(`simpleNodeSchema`);

export function cachedFlexSchemaFromClassSchema(
	schema: TreeNodeSchema,
): TreeNodeSchemaBase | undefined {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (schema as any)[flexSchemaSymbol] as TreeNodeSchemaBase | undefined;
}

export function setFlexSchemaFromClassSchema(
	simple: TreeNodeSchema,
	flex: TreeNodeSchemaBase,
): void {
	assert(!(flexSchemaSymbol in simple), 0x91f /* simple schema already marked */);
	assert(!(simpleNodeSchemaSymbol in flex), 0x920 /* flex schema already marked */);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(simple as any)[flexSchemaSymbol] = flex;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(flex as any)[simpleNodeSchemaSymbol] = simple;
}

/**
 * Gets the {@link TreeNodeSchema} cached on the provided {@link FlexTreeNodeSchema | flexSchema}.
 * Returns `undefined` if no cached value is found.
 */
export function tryGetSimpleNodeSchema(
	flexSchema: FlexTreeNodeSchema,
): TreeNodeSchema | undefined {
	if (simpleNodeSchemaSymbol in flexSchema) {
		return flexSchema[simpleNodeSchemaSymbol] as TreeNodeSchema;
	}
	return undefined;
}

/**
 * Gets the {@link TreeNodeSchema} cached on the provided {@link FlexTreeNodeSchema | flexSchema}.
 * Fails if no cached value is found.
 */
export function getSimpleNodeSchema(flexSchema: FlexTreeNodeSchema): TreeNodeSchema {
	return tryGetSimpleNodeSchema(flexSchema) ?? fail("missing simple schema");
}
