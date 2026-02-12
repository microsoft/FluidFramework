/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
	getInnerNode,
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
		 *
		 * @throws if {@link isValid} is false.
		 */
		readonly union: T | undefined;

		/**
		 * Returns true, unless this node is in an invalid state.
		 * @remarks
		 * A well behaved application should not need this API.
		 * If an application is hitting errors when accessing {@link ExtensibleUnionNode.members.union},
		 * this API can be used to help detect and recover from the invalid state which causes those errors (for example by replacing the invalid nodes with new ones).
		 *
		 * In this context "invalid" means that the internal implementation details of this node have had their invariants violated.
		 * This can happen when:
		 * - Using weakly typed construction APIs like {@link TreeBeta.importConcise} or {@link TreeBeta.importVerbose} to construct an invalid state directly.
		 * Using such APIs, even when not creating invalid nodes, is not supported for this schema,
		 * since doing so requires knowing the implementation details of this node which are subject to change.
		 * - By editing a document using a different client using a different schema for this node.
		 * - Violating the TypeScript types to directly manipulate the node internals.
		 * - A bug in this node's implementation (possibly in a different client) corrupted the node.
		 * - Corruption of the document this node is contained in.
		 *
		 * @privateRemarks
		 * We could support {@link TreeBeta.exportVerbose} using {@link KeyEncodingOptions.allStoredKeys}
		 * then {@link TreeBeta.importVerbose} with {@link KeyEncodingOptions.knownStoredKeys}.
		 * However, even this will error (but will not produce an invalid node) if there is a node of an unknown type in the union.
		 */
		isValid(): boolean;
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
				if (!this.isValid()) {
					throw new UsageError(
						`This ExtensibleUnionNode (${Union.identifier}) is in an invalid state. It must have been edited by another client using a different schema or been directly imported or constructed in an invalid state.`,
					);
				}
				for (const [_key, child] of TreeAlpha.children(this)) {
					return child as TreeNodeFromImplicitAllowedTypes<T>;
				}
				return undefined;
			}

			public isValid(): boolean {
				// Use inner node, since it includes populated fields even when they are unknown.
				const inner = getInnerNode(this);
				// Fields only includes non-empty fields, so this is what we need to check the one child invariant.
				return [...inner.fields].length === 1;
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
