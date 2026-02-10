/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeAlpha, Tree } from "./shared-tree/index.js";
import type {
	TreeNodeSchema,
	TreeNodeFromImplicitAllowedTypes,
	TreeFieldFromImplicitField,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	SchemaFactoryBeta,
} from "./simple-tree/index.js";
import {
	createCustomizedFluidFrameworkScopedFactory,
	eraseSchemaDetailsSubclassable,
	SchemaFactory,
	TreeBeta,
} from "./simple-tree/index.js";
import type { UnionToIntersection } from "./util/index.js";

/**
 * Utilities for creating extensible unions using a node.
 * @remarks
 * Use {@link ExtensibleUnionNode.createSchema} to create the union schema.
 *
 * Unlike a schema union created using {@link SchemaStaticsBeta.staged | staged} allowed types, this union allows for unknown future types to exist in addition to the known types.
 * This allows for faster roll-outs of new types without waiting for old clients to be updated to be aware of them.
 * This does mean however that old clients may see types they do not know about, which are simply exposed as `undefined` children.
 *
 * `staged` types are lower overhead, and might gain support for `unknown` types in the future, so prefer them when possible.
 * This is simply an alternative for when future compatibility with unknown types is required.
 * It is built on top of the existing {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields} feature.
 *
 * @example
 * ```typescript
 * const sf = new SchemaFactoryBeta("extensibleUnionNodeExample.items");
 * class ItemA extends sf.object("A", { x: sf.string }) {}
 * class ItemB extends sf.object("B", { x: sf.number }) {}
 *
 * class AnyItem extends ExtensibleUnionNode.createSchema(
 * 	[ItemA, ItemB], // Future versions may add more members here
 * 	sf,
 * 	"ExtensibleUnion",
 * ) {}
 * // Instances of the union are created using `create`.
 * const anyItem = AnyItem.create(new ItemA({ x: "hello" }));
 * // Reading the content from the union is done via the `union` property,
 * // which can be `undefined` to handle the case where a future version of this schema allows a type unknown to the current version.
 * const childNode: ItemA | ItemB | undefined = anyItem.union;
 * // To determine which member of the union was present, its schema can be inspected:
 * const aSchema = Tree.schema(childNode ?? assert.fail("No child"));
 * assert.equal(aSchema, ItemA);
 * ```
 * @alpha
 */
export namespace ExtensibleUnionNode {
	/**
	 * Members for classes created by {@link ExtensibleUnionNode.createSchema}.
	 * @alpha
	 */
	export interface Members<T> {
		/**
		 * The child wrapped by this node has one of the types allowed by the union,
		 * or `undefined` if the type is one which was added to the union by a future version of this schema.
		 */
		readonly union: T | undefined;
	}

	/**
	 * Statics for classes created by {@link ExtensibleUnionNode.createSchema}.
	 * @alpha
	 */
	export interface Statics<T extends readonly TreeNodeSchema[]> {
		/**
		 * Create a {@link TreeNode} with `this` schema which wraps the provided child to create the union.
		 */
		create<TThis extends TreeNodeSchema>(
			this: TThis,
			child: TreeNodeFromImplicitAllowedTypes<T>,
		): TreeFieldFromImplicitField<TThis>;
	}

	/**
	 * Create an extensible schema union which currently supports the types in `types`,
	 * but tolerates collaboration with future versions that may include additional types.
	 * @remarks
	 * See {@link ExtensibleUnionNode} for an example use.
	 * @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	export function createSchema<
		const T extends readonly TreeNodeSchema[],
		const TScope extends string,
		const TName extends string,
	>(types: T, inputSchemaFactory: SchemaFactoryBeta<TScope>, name: TName) {
		const record: Record<string, ImplicitFieldSchema> = {};
		for (const type of types) {
			record[`_${type.identifier}`] = SchemaFactory.optional(type, { key: type.identifier });
		}
		const schemaFactory = createCustomizedFluidFrameworkScopedFactory(
			inputSchemaFactory,
			"extensibleUnionNode",
		);
		class Union
			extends schemaFactory.object(name, record, { allowUnknownOptionalFields: true })
			implements Members<TreeNodeFromImplicitAllowedTypes<T>>
		{
			public get union(): TreeNodeFromImplicitAllowedTypes<T> | undefined {
				for (const [_key, child] of TreeAlpha.children(this)) {
					return child as TreeNodeFromImplicitAllowedTypes<T>;
				}
				return undefined;
			}

			public static create<TThis extends TreeNodeSchema>(
				this: TThis,
				child: TreeNodeFromImplicitAllowedTypes<T>,
			): TreeFieldFromImplicitField<TThis> {
				const schema = Tree.schema(child);
				return TreeBeta.create(this, {
					[`_${schema.identifier}`]: child,
				} as unknown as InsertableTreeFieldFromImplicitField<
					TThis,
					UnionToIntersection<TThis>
				>);
			}
		}
		return eraseSchemaDetailsSubclassable<
			Members<TreeNodeFromImplicitAllowedTypes<T>>,
			Statics<T>
		>()(Union);
	}
}
