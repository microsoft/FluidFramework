/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type TreeValue, ValueSchema } from "../core/index.js";
import { leaf } from "../domains/index.js";
import {
	type LeafNodeSchema as FlexLeafNodeSchema,
	type FlexTreeNode,
	isFlexTreeNode,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import {
	setFlexSchemaFromClassSchema,
	NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
} from "./core/index.js";

/**
 * Instances of this class are schema for leaf nodes.
 * @remarks
 * Unlike other schema, leaf schema are class instances instead of classes themselves.
 * This is because the instance type (the tree node type) for leaves are not objects,
 * so those instances can't be instances of a schema based class.
 * @privateRemarks
 * This class refers to the underlying flex tree schema in its constructor, so this class can't be included in the package API.
 */
export class LeafNodeSchema<Name extends string, const T extends ValueSchema>
	implements TreeNodeSchemaNonClass<Name, NodeKind.Leaf, TreeValue<T>, TreeValue<T>>
{
	public readonly identifier: Name;
	public readonly kind = NodeKind.Leaf;
	public readonly info: T;
	public readonly implicitlyConstructable = true as const;
	public create(data: TreeValue<T> | FlexTreeNode): TreeValue<T> {
		if (isFlexTreeNode(data)) {
			const value = data.value;
			assert(valueSchemaAllows(this.info, value), 0x916 /* invalid value */);
			return value;
		}
		return data;
	}

	public constructor(name: Name, t: T, schema: FlexLeafNodeSchema) {
		assert((name as string) === schema.name, "bad leaf config");
		assert(t === schema.info, "bad leaf config");

		setFlexSchemaFromClassSchema(this, schema);
		this.identifier = name;
		this.info = t;
	}
}

/**
 * Wrapper around LeafNodeSchema's constructor that provides the return type that is desired in the package public API.
 */
function makeLeaf<Name extends string, const T extends ValueSchema>(
	name: Name,
	t: T,
	schema: FlexLeafNodeSchema,
): TreeNodeSchema<
	`com.fluidframework.leaf.${Name}`,
	NodeKind.Leaf,
	TreeValue<T>,
	TreeValue<T>
> {
	return new LeafNodeSchema(`com.fluidframework.leaf.${name}`, t, schema);
}

// Leaf schema shared between all SchemaFactory instances.
export const stringSchema = makeLeaf("string", ValueSchema.String, leaf.string);
export const numberSchema = makeLeaf("number", ValueSchema.Number, leaf.number);
export const booleanSchema = makeLeaf("boolean", ValueSchema.Boolean, leaf.boolean);
export const nullSchema = makeLeaf("null", ValueSchema.Null, leaf.null);
export const handleSchema = makeLeaf("handle", ValueSchema.FluidHandle, leaf.handle);
