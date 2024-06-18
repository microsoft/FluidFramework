/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { unreachableCase } from "@fluidframework/core-utils/internal";

import { EmptyKey, type FieldKey } from "../../../core/index.js";
import {
	SchemaBuilder,
	jsonArray,
	jsonObject,
	type jsonRoot,
	jsonSchema,
	leaf,
} from "../../../domains/index.js";
import type {
	FlexTreeField,
	FlexTreeMapNode,
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeTypedField,
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
	type FlexFieldNodeSchema,
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
	/**
	 * Example showing narrowing and exhaustive matches.
	 */
	function exhaustiveMatchSimple(root: FlexTreeField): void {
		const schema = SchemaBuilder.required([() => leaf.number, leaf.string]);
		assert(root.is(schema));
		const tree = root.boxedContent;
		if (tree.is(leaf.number)) {
			const n: number = tree.value;
		} else if (tree.is(leaf.string)) {
			const s: string = tree.value;
		} else {
			// Proves at compile time exhaustive match checking works, and tree is typed `never`.
			unreachableCase(tree);
		}
	}

	/**
	 * Example showing the node kinds used in the json domain (everything except structs),
	 * including narrowing and exhaustive matches.
	 */
	function jsonExample(root: FlexTreeField): void {
		// Rather than using jsonSequenceRootSchema.rootFieldSchema, recreate an equivalent schema.
		// Doing this avoids a compile error (but not an intellisense error) on unreachableCase below.
		// This has not be fully root caused, but it likely due to to schema d.ts files for recursive types containing `any` due to:
		// https://github.com/microsoft/TypeScript/issues/55832
		const jsonPrimitives = [...leaf.primitives, leaf.null] as const;
		const jsonRoot2 = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;
		const schema = SchemaBuilder.sequence(jsonRoot2);

		assert(root.is(schema));
		for (const tree of root.boxedIterator()) {
			if (tree.is(leaf.boolean)) {
				const b: boolean = tree.value;
			} else if (tree.is(leaf.number)) {
				const n: number = tree.value;
			} else if (tree.is(leaf.string)) {
				const s: string = tree.value;
			} else if (tree.is(jsonArray)) {
				const a: FlexTreeSequenceField<typeof jsonRoot> = tree.content;
				jsonExample(a);
			} else if (tree.is(jsonObject)) {
				const x = tree.get(EmptyKey);
			} else if (tree.is(leaf.null)) {
				const x: null = tree.value;
			} else {
				// Proves at compile time exhaustive match checking works, and tree is typed `never`.
				unreachableCase(tree);
			}
		}
	}

	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyStruct = builder.object("empty", {});
	const basicStruct = builder.object("basicObject", { foo: builder.optional(Any) });
	const basicFieldNode = builder.fieldNode("field", builder.optional(Any));
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

	/**
	 * All combinations of boxed and unboxed access.
	 */
	function boxingExample(mixed: Mixed): void {
		const leafNode: number = mixed.leaf;
		const leafBoxed: FlexTreeTypedNode<typeof leaf.number> = mixed.boxedLeaf.boxedContent;

		// Current policy is to box polymorphic values so they can be checked for type with `is`.
		// Note that this still unboxes the value field.
		const polymorphic:
			| FlexTreeTypedNode<typeof leaf.number>
			| FlexTreeTypedNode<typeof leaf.string> = mixed.polymorphic;

		// Fully boxed, including the value field.
		const boxedPolymorphic: FlexTreeRequiredField<
			readonly [typeof leaf.number, typeof leaf.string]
		> = mixed.boxedPolymorphic;

		const optionalLeaf: number | undefined = mixed.optionalLeaf;
		const boxedOptionalLeaf: FlexTreeTypedNode<typeof leaf.number> | undefined =
			mixed.boxedOptionalLeaf.boxedContent;
		const sequence: FlexTreeSequenceField<readonly [typeof leaf.number]> = mixed.sequence;

		const child: number | undefined = sequence.at(0);
		const childBoxed: FlexTreeTypedNode<typeof leaf.number> | undefined = sequence.boxedAt(0);
	}

	function recursiveStructExample(struct: Recursive): void {
		const child: Recursive | undefined = struct.foo;
		const data = struct.x + (struct.foo?.foo?.foo?.x ?? 0);
		assert(child);

		child.foo?.foo?.foo?.foo?.setX(5);
		child.foo?.boxedFoo.content?.foo?.foo?.setFoo({ x: 5, foo: { x: 5, foo: undefined } });

		struct.boxedFoo.content = undefined;

		// Shorthand for the above.
		struct.setFoo(undefined);
		struct.foo = undefined;
	}

	function iteratorsExample(mixed: Mixed): void {
		const unboxedListIteration: number[] = [...mixed.sequence];
		const boxedListIteration: FlexTreeTypedNode<typeof leaf.number>[] = [
			...mixed.sequence.boxedIterator(),
		];

		const optionalNumberField = SchemaBuilder.optional(leaf.number);
		const mapSchema = undefined as unknown as FlexMapNodeSchema<
			"MapIteration",
			typeof optionalNumberField
		>;
		const mapNode = undefined as unknown as FlexTreeMapNode<typeof mapSchema>;
		const unboxedMapIteration: [FieldKey, number][] = [...mapNode];
		const boxedMapIteration: FlexTreeTypedField<typeof optionalNumberField>[] = [
			...mapNode.boxedIterator(),
		];
	}

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafNodeSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FlexFieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FlexFieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, FlexMapNodeSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, FlexObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, FlexObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexFieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafNodeSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FlexFieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, FlexMapNodeSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FlexFieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicStruct, FlexFieldNodeSchema>>;
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
	type BasicFieldNode = FlexTreeTypedNode<typeof basicFieldNode>;
	{
		type _1 = requireFalse<isAssignableTo<BasicStruct, BasicFieldNode>>;
		type _2 = requireFalse<isAssignableTo<BasicFieldNode, BasicStruct>>;
	}

	// Basic unit test for TreeNode.is type narrowing.
	function nodeIs(node: FlexTreeNode): void {
		if (node.is(basicStruct)) {
			type _1 = requireAssignableTo<typeof node, BasicStruct>;
		}
		if (node.is(basicFieldNode)) {
			type _1 = requireAssignableTo<typeof node, BasicFieldNode>;
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
					FlexTreeTypedNodeUnion<[typeof basicStruct, typeof basicFieldNode]>,
					BasicStruct | BasicFieldNode
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

		// Direct
		{
			type UnionBasic1 = FlexTreeUnboxNodeUnion<[typeof basicStruct]>;
			type _1 = requireTrue<areSafelyAssignable<UnionBasic1, BasicStruct>>;
		}
		// Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeUnboxNodeUnion<[() => typeof basicStruct]>, BasicStruct>
			>;
		}
		// Union
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					FlexTreeUnboxNodeUnion<[typeof basicStruct, typeof basicFieldNode]>,
					BasicStruct | BasicFieldNode
				>
			>;
		}
		// Unboxed FieldNode
		{
			type UnboxedFieldNode = FlexTreeUnboxNodeUnion<[typeof basicFieldNode]>;
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeTypedNode<typeof basicFieldNode>, UnboxedFieldNode>
			>;
			type _2 = requireAssignableTo<UnboxedFieldNode, FlexTreeNode>;
		}
		// Recursive
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeUnboxNodeUnion<[typeof recursiveStruct]>, Recursive>
			>;
		}
		// Recursive Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<FlexTreeUnboxNodeUnion<[() => typeof recursiveStruct]>, Recursive>
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
			type _2 = requireTrue<
				areSafelyAssignable<FlexTreeUnboxNodeUnion<[FlexObjectNodeSchema]>, FlexTreeObjectNode>
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
