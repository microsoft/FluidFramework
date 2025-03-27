/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type TreeValue, ValueSchema } from "../core/index.js";
import {
	type FlexTreeNode,
	isFlexTreeNode,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import { NodeKind, type TreeNodeSchema, type TreeNodeSchemaNonClass } from "./core/index.js";
import type { NodeSchemaMetadata, TreeLeafValue } from "./schemaTypes.js";

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
	public readonly childTypes: ReadonlySet<TreeNodeSchema> = new Set();

	public create(data: TreeValue<T> | FlexTreeNode): TreeValue<T> {
		if (isFlexTreeNode(data)) {
			const value = data.value;
			assert(valueSchemaAllows(this.info, value), 0x916 /* invalid value */);
			return value;
		}
		return data;
	}

	public createFromInsertable(data: TreeValue<T>): TreeValue<T> {
		return data;
	}

	public readonly leafKind: ValueSchema;

	public readonly metadata: NodeSchemaMetadata = {};

	public constructor(name: Name, t: T) {
		this.identifier = name;
		this.info = t;
		this.leafKind = t;
	}
}

/**
 * Wrapper around LeafNodeSchema's constructor that provides the return type that is desired in the package public API.
 */
function makeLeaf<Name extends string, const T extends ValueSchema>(
	name: Name,
	t: T,
): LeafSchema<Name, TreeValue<T>> {
	// Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
	return new LeafNodeSchema(`com.fluidframework.leaf.${name}`, t);
}

/**
 * A {@link TreeNodeSchema} for a {@link TreeLeafValue}.
 * @remarks
 * This is just a more specific alias for a particular {@link TreeNodeSchemaNonClass}.
 * It only exists to make the API (particularly errors, IntelliSense, and generated .d.ts files) more readable.
 *
 * See {@link SchemaFactory} and its various properties for actual leaf schema objects.
 * @privateRemarks
 * This is an interface so its name will show up in things like type errors instead of the fully expanded TreeNodeSchemaNonClass.
 * @system @sealed @public
 */
export interface LeafSchema<Name extends string, T extends TreeLeafValue>
	extends TreeNodeSchemaNonClass<
		`com.fluidframework.leaf.${Name}`,
		NodeKind.Leaf,
		/* TNode */ T,
		/* TInsertable */ T,
		/* ImplicitlyConstructable */ true
	> {}

// Leaf schema shared between all SchemaFactory instances.
export const stringSchema = makeLeaf("string", ValueSchema.String);
export const numberSchema = makeLeaf("number", ValueSchema.Number);
export const booleanSchema = makeLeaf("boolean", ValueSchema.Boolean);
export const nullSchema = makeLeaf("null", ValueSchema.Null);
export const handleSchema = makeLeaf("handle", ValueSchema.FluidHandle);
