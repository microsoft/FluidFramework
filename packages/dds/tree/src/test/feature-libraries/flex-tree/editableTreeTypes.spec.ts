/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaBuilder,
	type jsonArray,
	jsonObject,
	jsonSchema,
	leaf,
} from "../../../domains/index.js";
import type {
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeTypedNode,
	FlexTreeTypedNodeUnion,
	FlexTreeUnboxNodeUnion,
	FlexTreeUnknownUnboxed,
	IsArrayOfOne,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/flex-tree/flexTreeTypes.js";
import {
	Any,
	FieldKinds,
	type FlexAllowedTypes,
	FlexFieldSchema,
	type FlexMapNodeSchema,
	type FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	type LeafNodeSchema,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { ConstantFlexListToNonLazyArray } from "../../../feature-libraries/typed-schema/flexList.js";
import type {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";

describe("flexTreeTypes", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyStruct = builder.object("empty", {});
	const basicStruct = builder.object("basicObject", { foo: builder.optional(Any) });
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	const mixedStruct = builder.object("mixedStruct", {
		/**
		 * Test doc comment.
		 */
		leaf: leaf.number,
		polymorphic: [leaf.number, leaf.string],
		optionalLeaf: builder.optional(leaf.number),
		optionalObject: SchemaBuilder.optional(jsonObject),
		sequence: SchemaBuilder.sequence(leaf.number),
	});
	type Mixed = FlexTreeTypedNode<typeof mixedStruct>;

	const recursiveStruct = builder.objectRecursive("recursiveStruct", {
		/**
		 * Test Recursive Field.
		 */
		foo: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveStruct]),
		/**
		 * Data field.
		 */
		x: SchemaBuilder.required(leaf.number),
	});
	type Recursive = FlexTreeTypedNode<typeof recursiveStruct>;

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, FlexMapNodeSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, FlexObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, FlexObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, FlexMapNodeSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicStruct, FlexMapNodeSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicStruct, FlexObjectNodeSchema>>;
	}

	function nominalTyping(): void {
		const builder2 = new SchemaBuilder({ scope: "test" });
		const emptyStruct1 = builder2.object("empty1", {});
		const emptyStruct2 = builder2.object("empty2", {});

		// Schema for types which only different in name are distinguished
		{
			type _1 = requireFalse<isAssignableTo<typeof emptyStruct1, typeof emptyStruct2>>;
			type _2 = requireFalse<isAssignableTo<typeof emptyStruct2, typeof emptyStruct1>>;
		}
		type Empty1 = FlexTreeTypedNode<typeof emptyStruct1>;
		type Empty2 = FlexTreeTypedNode<typeof emptyStruct2>;

		// Schema for TypedNode which only different in name are distinguished
		{
			// TODO: Fix this. Might be fixed when moving to class based schema builder. Otherwise add strongly typed named to nodes.
			// @ts-expect-error TODO: fix this and remove expected error.
			type _1 = requireFalse<isAssignableTo<Empty1, Empty2>>;
			// @ts-expect-error TODO: fix this and remove expected error.
			type _2 = requireFalse<isAssignableTo<Empty2, Empty1>>;
		}
	}

	// Two different simple node types to compare and test with.
	type BasicStruct = FlexTreeTypedNode<typeof basicStruct>;
	type EmptyStruct = FlexTreeTypedNode<typeof emptyStruct>;

	// Basic unit test for TreeNode.is type narrowing.
	function nodeIs(node: FlexTreeNode): void {
		if (node.is(basicStruct)) {
			type _1 = requireAssignableTo<typeof node, BasicStruct>;
		}
		if (node.is(emptyStruct)) {
			type _1 = requireAssignableTo<typeof node, EmptyStruct>;
		}
	}

	// TypedNodeUnion
	{
		// Any
		{
			type _1 = requireTrue<areSafelyAssignable<FlexTreeTypedNodeUnion<[Any]>, FlexTreeNode>>;
		}

		// Direct
		{
			type UnionBasic1 = FlexTreeTypedNodeUnion<[typeof basicStruct]>;
			type _1 = requireTrue<areSafelyAssignable<UnionBasic1, BasicStruct>>;
		}
		// Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<[() => typeof basicStruct]>, BasicStruct>
			>;
		}
		// Union
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					FlexTreeTypedNodeUnion<[typeof basicStruct, typeof emptyStruct]>,
					BasicStruct | EmptyStruct
				>
			>;
		}
		// Recursive
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<[typeof recursiveStruct]>, Recursive>
			>;
		}
		// Recursive Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<[() => typeof recursiveStruct]>, Recursive>
			>;
		}
		// Type-Erased
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<[FlexTreeNodeSchema]>, FlexTreeNode>
			>;
			type _2 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<[FlexObjectNodeSchema]>, FlexTreeObjectNode>
			>;
			type _3 = requireTrue<
				areSafelyAssignable<
					FlexTreeTypedNodeUnion<[FlexTreeNodeSchema, FlexTreeNodeSchema]>,
					FlexTreeNode
				>
			>;
			type _4 = requireTrue<areSafelyAssignable<FlexTreeTypedNodeUnion<[Any]>, FlexTreeNode>>;
			type y = ConstantFlexListToNonLazyArray<FlexTreeNodeSchema[]>;

			type _5 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<FlexTreeNodeSchema[]>, FlexTreeNode>
			>;
			type _6 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNodeUnion<FlexAllowedTypes>, FlexTreeNode>
			>;
		}
	}

	// UnboxNodeUnion
	{
		// Any
		{
			type _1 = requireTrue<areSafelyAssignable<FlexTreeUnboxNodeUnion<[Any]>, FlexTreeNode>>;
		}

		// Union
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					FlexTreeUnboxNodeUnion<[typeof basicStruct, typeof emptyStruct]>,
					BasicStruct | EmptyStruct
				>
			>;
		}

		// Type-Erased
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					FlexTreeUnboxNodeUnion<[FlexTreeNodeSchema]>,
					FlexTreeUnknownUnboxed
				>
			>;

			type _3 = requireTrue<
				areSafelyAssignable<
					FlexTreeUnboxNodeUnion<[FlexTreeNodeSchema, FlexTreeNodeSchema]>,
					FlexTreeNode
				>
			>;
			type _4 = requireTrue<areSafelyAssignable<FlexTreeUnboxNodeUnion<[Any]>, FlexTreeNode>>;
			type _5 = requireTrue<
				areSafelyAssignable<
					FlexTreeUnboxNodeUnion<FlexTreeNodeSchema[]>,
					FlexTreeUnknownUnboxed
				>
			>;
			type _6 = requireTrue<
				areSafelyAssignable<FlexTreeUnboxNodeUnion<FlexAllowedTypes>, FlexTreeUnknownUnboxed>
			>;
		}

		// Generic
		// eslint-disable-next-line no-inner-declarations
		function genericTest<T extends FlexAllowedTypes>(t: T) {
			type Unboxed = FlexTreeUnboxNodeUnion<T>;
			// @ts-expect-error union can unbox to undefined or a sequence
			type _1 = requireAssignableTo<Unboxed, FlexTreeNode>;
		}
	}

	// IsArrayOfOne
	{
		type _1 = requireFalse<IsArrayOfOne<[FlexTreeNodeSchema, FlexTreeNodeSchema]>>;
		type _2 = requireFalse<IsArrayOfOne<[]>>;
		type _3 = requireTrue<areSafelyAssignable<IsArrayOfOne<FlexAllowedTypes>, boolean>>;
		type _4 = requireTrue<IsArrayOfOne<[Any]>>;
	}
});
