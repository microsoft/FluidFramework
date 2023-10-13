/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/core-utils";
import {
	jsonArray,
	jsonNull,
	jsonObject,
	jsonRoot,
	jsonSchema,
	leaf,
	SchemaBuilder,
} from "../../../domains";

import {
	Sequence,
	TypedNode,
	TreeField,
	RequiredField,
	TreeNode,
	TypedNodeUnion,
	UnboxNodeUnion,
	MapNode,
	TypedField,
	boxedIterator,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/editableTreeTypes";
import { jsonSequenceRootSchema } from "../../utils";
import {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util";
import { EmptyKey, FieldKey } from "../../../core";
import {
	FieldKinds,
	Any,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	StructSchema,
	TreeSchema,
	FieldSchema,
} from "../../../feature-libraries";

describe("editableTreeTypes", () => {
	/**
	 * Example showing the node kinds used in the json domain (everything except structs),
	 * including narrowing and exhaustive matches.
	 */
	function jsonExample(root: TreeField): void {
		assert(root.is(jsonSequenceRootSchema.rootFieldSchema));
		for (const tree of root) {
			if (tree.is(leaf.boolean)) {
				const b: boolean = tree.value;
			} else if (tree.is(leaf.number)) {
				const n: number = tree.value;
			} else if (tree.is(leaf.string)) {
				const s: string = tree.value;
			} else if (tree.is(jsonArray)) {
				const a: Sequence<typeof jsonRoot> = tree.content;
				jsonExample(a);
			} else if (tree.is(jsonObject)) {
				const x = tree.get(EmptyKey);
			} else if (tree.is(jsonNull)) {
				const x = tree.schema;
			} else {
				// Proves at compile time exhaustive match checking works, and tree is typed `never`.
				unreachableCase(tree);
			}
		}
	}

	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyStruct = builder.struct("empty", {});
	const basicStruct = builder.struct("basicStruct", { foo: builder.optional(Any) });
	const basicFieldNode = builder.fieldNode("field", builder.optional(Any));
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	const mixedStruct = builder.struct("mixedStruct", {
		/**
		 * Test doc comment.
		 */
		leaf: leaf.number,
		polymorphic: [leaf.number, leaf.string],
		optionalLeaf: builder.optional(leaf.number),
		optionalObject: SchemaBuilder.optional(jsonObject),
		sequence: SchemaBuilder.sequence(leaf.number),
	});
	type Mixed = TypedNode<typeof mixedStruct>;

	const recursiveStruct = builder.structRecursive("recursiveStruct", {
		/**
		 * Test Recursive Field.
		 */
		foo: FieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveStruct]),
		/**
		 * Data field.
		 */
		x: SchemaBuilder.required(leaf.number),
	});
	type Recursive = TypedNode<typeof recursiveStruct>;

	/**
	 * All combinations of boxed and unboxed access.
	 */
	function boxingExample(mixed: Mixed): void {
		const leafNode: number = mixed.leaf;
		const leafBoxed: TypedNode<typeof leaf.number> = mixed.boxedLeaf.boxedContent;

		// Current policy is to box polymorphic values so they can be checked for type with `is`.
		// Note that this still unboxes the value field.
		const polymorphic: TypedNode<typeof leaf.number> | TypedNode<typeof leaf.string> =
			mixed.polymorphic;

		// Fully boxed, including the value field.
		const boxedPolymorphic: RequiredField<[typeof leaf.number, typeof leaf.string]> =
			mixed.boxedPolymorphic;

		const optionalLeaf: number | undefined = mixed.optionalLeaf;
		const boxedOptionalLeaf: TypedNode<typeof leaf.number> | undefined =
			mixed.boxedOptionalLeaf.boxedContent;
		const sequence: Sequence<[typeof leaf.number]> = mixed.sequence;

		const child: number = sequence.at(0);
		const childBoxed: TypedNode<typeof leaf.number> = sequence.boxedAt(0);
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
		const boxedListIteration: TypedNode<typeof leaf.number>[] = [
			...mixed.sequence[boxedIterator](),
		];

		const optionalNumberField = SchemaBuilder.optional(leaf.number);
		const mapSchema = undefined as unknown as TreeSchema<
			"MapIteration",
			{ mapFields: typeof optionalNumberField }
		>;
		const mapNode = undefined as unknown as MapNode<typeof mapSchema>;
		const unboxedMapIteration: [FieldKey, number][] = [...mapNode];
		const boxedMapIteration: TypedField<typeof optionalNumberField>[] = [
			...mapNode[boxedIterator](),
		];
	}

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, MapSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, StructSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, StructSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof leaf.boolean, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, StructSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, MapSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, StructSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, StructSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicStruct, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicStruct, MapSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicStruct, StructSchema>>;
	}

	function nominalTyping(): void {
		const builder2 = new SchemaBuilder({ scope: "test" });
		const emptyStruct1 = builder2.struct("empty1", {});
		const emptyStruct2 = builder2.struct("empty2", {});

		// Schema for types which only different in name are distinguished
		{
			type _1 = requireFalse<isAssignableTo<typeof emptyStruct1, typeof emptyStruct2>>;
			type _2 = requireFalse<isAssignableTo<typeof emptyStruct2, typeof emptyStruct1>>;
		}
		type Empty1 = TypedNode<typeof emptyStruct1>;
		type Empty2 = TypedNode<typeof emptyStruct2>;

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
	type BasicStruct = TypedNode<typeof basicStruct>;
	type BasicFieldNode = TypedNode<typeof basicFieldNode>;
	{
		type _1 = requireFalse<isAssignableTo<BasicStruct, BasicFieldNode>>;
		type _2 = requireFalse<isAssignableTo<BasicFieldNode, BasicStruct>>;
	}

	// Basic unit test for TreeNode.is type narrowing.
	function nodeIs(node: TreeNode): void {
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
			type _1 = requireTrue<areSafelyAssignable<TypedNodeUnion<[Any]>, TreeNode>>;
		}

		// Direct
		{
			type UnionBasic1 = TypedNodeUnion<[typeof basicStruct]>;
			type _1 = requireTrue<areSafelyAssignable<UnionBasic1, BasicStruct>>;
		}
		// Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<TypedNodeUnion<[() => typeof basicStruct]>, BasicStruct>
			>;
		}
		// Union
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					TypedNodeUnion<[typeof basicStruct, typeof basicFieldNode]>,
					BasicStruct | BasicFieldNode
				>
			>;
		}
		// Recursive
		{
			type _1 = requireTrue<
				areSafelyAssignable<TypedNodeUnion<[typeof recursiveStruct]>, Recursive>
			>;
		}
		// Recursive Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<TypedNodeUnion<[() => typeof recursiveStruct]>, Recursive>
			>;
		}
	}

	// UnboxNodeUnion
	{
		// Any
		{
			type _1 = requireTrue<areSafelyAssignable<UnboxNodeUnion<[Any]>, TreeNode>>;
		}

		// Direct
		{
			type UnionBasic1 = UnboxNodeUnion<[typeof basicStruct]>;
			type _1 = requireTrue<areSafelyAssignable<UnionBasic1, BasicStruct>>;
		}
		// Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<UnboxNodeUnion<[() => typeof basicStruct]>, BasicStruct>
			>;
		}
		// Union
		{
			type _1 = requireTrue<
				areSafelyAssignable<
					UnboxNodeUnion<[typeof basicStruct, typeof basicFieldNode]>,
					BasicStruct | BasicFieldNode
				>
			>;
		}
		// Unboxed FieldNode
		{
			type UnboxedFieldNode = UnboxNodeUnion<[typeof basicFieldNode]>;
			// TODO: areSafelyAssignable doesn't seem to work in this case. Revisit this once on TS 5 and TypeCheck is updated for it.
			type _1 = requireAssignableTo<UnboxedFieldNode, TreeNode | undefined>;
			type _2 = requireAssignableTo<TreeNode | undefined, UnboxedFieldNode>;
		}
		// Recursive
		{
			type _1 = requireTrue<
				areSafelyAssignable<UnboxNodeUnion<[typeof recursiveStruct]>, Recursive>
			>;
		}
		// Recursive Lazy
		{
			type _1 = requireTrue<
				areSafelyAssignable<UnboxNodeUnion<[() => typeof recursiveStruct]>, Recursive>
			>;
		}
	}
});
