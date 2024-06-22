/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { TreeNodeSchemaIdentifier, TreeValue } from "../core/index.js";
import { leaf } from "../domains/index.js";
import {
	type LeafNodeSchema as FlexLeafNodeSchema,
	type FlexTreeNode,
	isFlexTreeNode,
	valueSchemaAllows,
} from "../feature-libraries/index.js";

import { setFlexSchemaFromClassSchema } from "./schemaCaching.js";
import { NodeKind, type TreeNodeSchema, type TreeNodeSchemaNonClass } from "./schemaTypes.js";

type UnbrandedName<T extends FlexLeafNodeSchema> = T["name"] extends TreeNodeSchemaIdentifier<
	infer Name extends string
>
	? Name
	: T["name"];

/**
 * Instances of this class are schema for leaf nodes.
 * @remarks
 * Unlike other schema, leaf schema are class instances instead of classes themselves.
 * This is because the instance type (the tree node type) for leaves are not objects,
 * so those instances can't be instances of a schema based class.
 * @privateRemarks
 * This class refers to the underlying flex tree schema in its constructor, so this class can't be included in the package API.
 */
class LeafNodeSchema<T extends FlexLeafNodeSchema>
	implements TreeNodeSchemaNonClass<UnbrandedName<T>, NodeKind.Leaf, TreeValue<T["info"]>>
{
	public readonly identifier: UnbrandedName<T>;
	public readonly kind = NodeKind.Leaf;
	public readonly info: T["info"];
	public readonly implicitlyConstructable = true as const;
	public create(data: TreeValue<T["info"]> | FlexTreeNode): TreeValue<T["info"]> {
		if (isFlexTreeNode(data)) {
			const value = data.value;
			assert(valueSchemaAllows(this.info, value), 0x916 /* invalid value */);
			return value;
		}
		return data;
	}

	public constructor(schema: T) {
		setFlexSchemaFromClassSchema(this, schema);
		this.identifier = schema.name as UnbrandedName<T>;
		this.info = schema.info;
	}
}

/**
 * Wrapper around LeafNodeSchema's constructor that provides the return type that is desired in the package public API.
 */
function makeLeaf<T extends FlexLeafNodeSchema>(
	schema: T,
): TreeNodeSchema<
	UnbrandedName<T>,
	NodeKind.Leaf,
	TreeValue<T["info"]>,
	TreeValue<T["info"]>
> {
	return new LeafNodeSchema(schema);
}

// Leaf schema shared between all SchemaFactory instances.
export const stringSchema = makeLeaf(leaf.string);
export const numberSchema = makeLeaf(leaf.number);
export const booleanSchema = makeLeaf(leaf.boolean);
export const nullSchema = makeLeaf(leaf.null);
export const handleSchema = makeLeaf(leaf.handle);
