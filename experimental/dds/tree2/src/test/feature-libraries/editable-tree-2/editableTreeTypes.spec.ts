/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/core-utils";
import {
	jsonArray,
	jsonBoolean,
	jsonNull,
	jsonNumber,
	jsonObject,
	jsonRoot,
	jsonSchema,
	jsonString,
} from "../../../domains";

import {
	Sequence,
	TypedNode,
	TreeField,
	RequiredField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/editableTreeTypes";
import { jsonSequenceRootSchema } from "../../utils";
import { isAssignableTo, requireAssignableTo, requireFalse, requireTrue } from "../../../util";
import { EmptyKey } from "../../../core";
import {
	FieldKinds,
	Any,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	SchemaBuilder,
	StructSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
} from "../../../feature-libraries";

describe("editableTreeTypes", () => {
	/**
	 * Example showing the node kinds used in the json domain (everything except structs),
	 * including narrowing and exhaustive matches.
	 */
	function jsonExample(root: TreeField): void {
		assert(root.is(jsonSequenceRootSchema.rootFieldSchema));
		for (const tree of root) {
			if (tree.is(jsonBoolean)) {
				const b: boolean = tree.value;
			} else if (tree.is(jsonNumber)) {
				const n: number = tree.value;
			} else if (tree.is(jsonString)) {
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

	const builder = new SchemaBuilder("test", {}, jsonSchema);
	const emptyStruct = builder.struct("empty", {});
	const basicStruct = builder.struct("basicStruct", { foo: SchemaBuilder.fieldOptional(Any) });
	const basicFieldNode = builder.fieldNode("field", SchemaBuilder.fieldOptional(Any));
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	const mixedStruct = builder.struct("mixedStruct", {
		/**
		 * Test doc comment.
		 */
		leaf: SchemaBuilder.fieldValue(jsonNumber),
		polymorphic: SchemaBuilder.fieldValue(jsonNumber, jsonString),
		optionalLeaf: SchemaBuilder.fieldOptional(jsonNumber),
		optionalObject: SchemaBuilder.fieldOptional(jsonObject),
		sequence: SchemaBuilder.fieldSequence(jsonNumber),
	});
	type Mixed = TypedNode<typeof mixedStruct>;

	const recursiveStruct = builder.structRecursive("recursiveStruct", {
		/**
		 * Test Recursive Field.
		 */
		foo: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveStruct),
		/**
		 * Data field.
		 */
		x: SchemaBuilder.fieldValue(jsonNumber),
	});
	type Recursive = TypedNode<typeof recursiveStruct>;

	/**
	 * All combinations of boxed and unboxed access.
	 */
	function boxingExample(mixed: Mixed): void {
		const leaf: number = mixed.leaf;
		const leafBoxed: TypedNode<typeof jsonNumber> = mixed.boxedLeaf.boxedContent;

		// Current policy is to box polymorphic values so they can be checked for type with `is`.
		// Note that this still unboxes the value field.
		const polymorphic: TypedNode<typeof jsonNumber> | TypedNode<typeof jsonString> =
			mixed.polymorphic;

		// Fully boxed, including the value field.
		const boxedPolymorphic: RequiredField<[typeof jsonNumber, typeof jsonString]> =
			mixed.boxedPolymorphic;

		const optionalLeaf: number | undefined = mixed.optionalLeaf;
		const boxedOptionalLeaf: TypedNode<typeof jsonNumber> | undefined =
			mixed.boxedOptionalLeaf.boxedContent;
		const sequence: Sequence<[typeof jsonNumber]> = mixed.sequence;

		const child: number = sequence.at(0);
		const childBoxed: TypedNode<typeof jsonNumber> = sequence.boxedAt(0);
	}

	function recursiveStructExample(struct: Recursive): void {
		const child: Recursive | undefined = struct.foo;
		const data = struct.x + (struct.foo?.foo?.foo?.x ?? 0);
		assert(child);

		// TODO: add shorthand setters
		// child.foo?.foo?.foo?.foo?.setX(5);
		// child.foo?.boxedFoo.content?.foo?.foo?.setFoo({ x: 5, foo: { x: 5, foo: undefined } });

		struct.boxedFoo.setContent(undefined);
		// Shorthand for the above.
		// TODO: add shorthand setters
		// struct.setFoo(undefined);
	}

	it("schema is", () => {
		assert(schemaIsLeaf(jsonBoolean));
		assert(!schemaIsFieldNode(jsonBoolean));
		assert(!schemaIsStruct(jsonBoolean));
		assert(!schemaIsMap(jsonBoolean));

		assert(!schemaIsLeaf(jsonArray));
		assert(schemaIsFieldNode(jsonArray));
		assert(!schemaIsStruct(jsonArray));
		assert(!schemaIsMap(jsonArray));

		assert(!schemaIsLeaf(jsonObject));
		assert(!schemaIsFieldNode(jsonObject));
		assert(!schemaIsStruct(jsonObject));
		assert(schemaIsMap(jsonObject));

		assert(!schemaIsLeaf(emptyStruct));
		assert(!schemaIsFieldNode(emptyStruct));
		assert(schemaIsStruct(emptyStruct));
		assert(!schemaIsMap(emptyStruct));

		assert(!schemaIsLeaf(basicStruct));
		assert(!schemaIsFieldNode(basicStruct));
		assert(schemaIsStruct(basicStruct));
		assert(!schemaIsMap(basicStruct));
	});

	{
		type _1 = requireAssignableTo<typeof jsonBoolean, LeafSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, MapSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, StructSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, StructSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof jsonBoolean, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonBoolean, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonBoolean, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonBoolean, StructSchema>>;
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
});
