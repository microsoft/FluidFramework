/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type { TreeValue } from "../../core/index.js";
import {
	SchemaFactory,
	type booleanSchema,
	type InsertableObjectFromSchemaRecord,
	type numberSchema,
	type stringSchema,
	type TreeNode,
	type TreeNodeSchema,
} from "../../simple-tree/index.js";
import {
	type AllowedTypes,
	type FieldKind,
	type FieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTreeNodeFromAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type InsertableTypedNode,
	type NodeBuilderData,
	type NodeFromSchema,
	type TreeFieldFromImplicitField,
	type TreeLeafValue,
	type TreeNodeFromImplicitAllowedTypes,
	areImplicitFieldSchemaEqual,
	normalizeAllowedTypes,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
	UnionToIntersection,
} from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { objectSchema } from "../../simple-tree/objectNode.js";
import { validateUsageError } from "../utils.js";
import { TreeAlpha } from "../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");

describe("schemaTypes", () => {
	{
		class A extends schema.object("A", { x: [schema.number, schema.string] }) {}
		class B extends schema.object("B", { x: [schema.number, schema.null] }) {}
		// Unconstrained
		{
			// Input
			type I1 = InsertableTreeFieldFromImplicitField<ImplicitFieldSchema>;
			type I2 = InsertableTypedNode<TreeNodeSchema>;
			type I3 = NodeBuilderData<TreeNodeSchema>;

			type _check1 = requireTrue<areSafelyAssignable<I1, never>>;
			type _check2 = requireTrue<areSafelyAssignable<I2, never>>;
			type _check3 = requireTrue<areSafelyAssignable<I3, never>>;

			// Output
			type N1 = NodeFromSchema<TreeNodeSchema>;
			type N2 = TreeNodeFromImplicitAllowedTypes;
			type N3 = TreeFieldFromImplicitField;

			type _check4 = requireTrue<areSafelyAssignable<N1, TreeNode | TreeLeafValue>>;
			type _check5 = requireTrue<areSafelyAssignable<N2, TreeNode | TreeLeafValue>>;
			type _check6 = requireTrue<
				areSafelyAssignable<N3, TreeNode | TreeLeafValue | undefined>
			>;
		}

		// InsertableTreeFieldFromImplicitField
		{
			// Input
			type I2 = InsertableTreeFieldFromImplicitField<ImplicitFieldSchema>;
			type I3 = InsertableTreeFieldFromImplicitField<ImplicitAllowedTypes>;
			type I4 = InsertableTreeFieldFromImplicitField<AllowedTypes>;
			type I5 = InsertableTreeFieldFromImplicitField<
				typeof numberSchema | typeof stringSchema
			>;
			type I8 = InsertableTreeFieldFromImplicitField<TreeNodeSchema>;

			type I6 = InsertableTreeFieldFromImplicitField<
				typeof numberSchema & typeof stringSchema
			>;
			type I7 = InsertableTreeFieldFromImplicitField<AllowedTypes & TreeNodeSchema>;

			type I9 = InsertableTreeFieldFromImplicitField<typeof A | typeof B>;
			type I10 = InsertableTreeFieldFromImplicitField<FieldSchema>;

			// These types should behave contravariantly
			type _check2 = requireTrue<areSafelyAssignable<I2, never>>;
			type _check3 = requireTrue<areSafelyAssignable<I3, never>>;
			type _check4 = requireTrue<areSafelyAssignable<I4, never>>;
			type _check5 = requireTrue<areSafelyAssignable<I5, never>>;
			type _check6 = requireTrue<areSafelyAssignable<I8, never>>;
			type _check7 = requireTrue<areSafelyAssignable<I9, never>>;
			type _check8 = requireTrue<areSafelyAssignable<I10, never>>;

			// eslint-disable-next-line no-inner-declarations
			function _generic<T extends ImplicitAllowedTypes>() {
				type I14 = InsertableTreeFieldFromImplicitField<T>;
				type IOptional = InsertableTreeFieldFromImplicitField<
					FieldSchema<FieldKind.Optional, T>
				>;
				type _check9 = requireAssignableTo<undefined, IOptional>;
			}
		}

		// InsertableTreeNodeFromImplicitAllowedTypes
		{
			// Input
			type I3 = InsertableTreeNodeFromImplicitAllowedTypes<ImplicitAllowedTypes>;
			type I4 = InsertableTreeNodeFromImplicitAllowedTypes<AllowedTypes>;
			type I5 = InsertableTreeNodeFromImplicitAllowedTypes<
				typeof numberSchema | typeof stringSchema
			>;
			type I8 = InsertableTreeNodeFromImplicitAllowedTypes<TreeNodeSchema>;

			type I6 = InsertableTreeNodeFromImplicitAllowedTypes<
				typeof numberSchema & typeof stringSchema
			>;
			type I7 = InsertableTreeNodeFromImplicitAllowedTypes<AllowedTypes & TreeNodeSchema>;

			type I9 = InsertableTreeNodeFromImplicitAllowedTypes<typeof A | typeof B>;

			// These types should behave contravariantly
			type _check3 = requireTrue<areSafelyAssignable<I3, never>>;
			type _check4 = requireTrue<areSafelyAssignable<I4, never>>;
			type _check5 = requireTrue<areSafelyAssignable<I5, never>>;
			type _check6 = requireTrue<areSafelyAssignable<I8, never>>;

			// Actual schema unions
			type I12 = InsertableTreeNodeFromImplicitAllowedTypes<typeof numberSchema>;
			type _check12 = requireTrue<areSafelyAssignable<I12, number>>;
			type I10 = InsertableTreeNodeFromImplicitAllowedTypes<[typeof numberSchema]>;
			type _check10 = requireTrue<areSafelyAssignable<I10, number>>;

			type I11 = InsertableTreeNodeFromImplicitAllowedTypes<
				[typeof numberSchema, typeof stringSchema]
			>;
			type _check11 = requireTrue<areSafelyAssignable<I11, number | string>>;

			// boolean
			// boolean is sometimes a union of true and false, so it can break in its owns special ways
			type I13 = InsertableTreeNodeFromImplicitAllowedTypes<typeof booleanSchema>;
			type _check13 = requireTrue<areSafelyAssignable<I13, boolean>>;
		}

		// InsertableTreeNodeFromAllowedTypes
		{
			{
				type T = InsertableTreeNodeFromAllowedTypes<AllowedTypes>;
				type _check = requireAssignableTo<T, never>;
			}

			{
				type T = InsertableTreeNodeFromAllowedTypes<
					[typeof numberSchema, typeof stringSchema]
				>;
				type _check = requireTrue<areSafelyAssignable<T, number | string>>;
			}

			{
				type T = InsertableTreeNodeFromAllowedTypes<[typeof A, typeof B]>;
				type _check = requireAssignableTo<A | B, T>;
			}
		}

		// InsertableTypedNode
		{
			// Input
			type I5 = InsertableTypedNode<typeof numberSchema | typeof stringSchema>;
			type I8 = InsertableTypedNode<TreeNodeSchema>;

			type I6 = InsertableTypedNode<typeof numberSchema & typeof stringSchema>;
			type I7 = InsertableTypedNode<AllowedTypes & TreeNodeSchema>;

			type I9 = InsertableTypedNode<typeof A | typeof B>;

			// These types should behave contravariantly
			type _check5 = requireTrue<areSafelyAssignable<I5, never>>;
			type _check6 = requireTrue<areSafelyAssignable<I8, never>>;

			type t = never extends TreeNodeSchema ? true : false;

			// Actual normal use
			type I12 = InsertableTypedNode<typeof numberSchema>;
			type _check12 = requireTrue<areSafelyAssignable<I12, number>>;

			// boolean
			// boolean is sometimes a union of true and false, so it can break in its owns special ways
			type I13 = InsertableTypedNode<typeof booleanSchema>;
			type _check13 = requireTrue<areSafelyAssignable<I13, boolean>>;
		}

		// InsertableField
		{
			{
				type unconstrained = InsertableField<ImplicitFieldSchema>;
				type _check = requireTrue<areSafelyAssignable<unconstrained, never>>;
			}
			type I8 = InsertableField<TreeNodeSchema>;

			type I6 = InsertableField<typeof numberSchema & typeof stringSchema>;
			type I7 = InsertableField<AllowedTypes & TreeNodeSchema>;

			type I9 = InsertableField<typeof A | typeof B>;

			// These types should behave contravariantly
			type _check6 = requireTrue<areSafelyAssignable<I8, never>>;

			type t = never extends TreeNodeSchema ? true : false;

			// Actual normal use
			type I12 = InsertableField<typeof numberSchema>;
			type _check12 = requireTrue<areSafelyAssignable<I12, number>>;

			// boolean
			// boolean is sometimes a union of true and false, so it can break in its owns special ways
			type I13 = InsertableField<typeof booleanSchema>;
			type _check13 = requireTrue<areSafelyAssignable<I13, boolean>>;

			// eslint-disable-next-line no-inner-declarations
			function _generic<T extends ImplicitAllowedTypes>() {
				type I14 = InsertableField<T>;
				type IOptional = InsertableField<FieldSchema<FieldKind.Optional, T>>;

				// Most likely due to the TypeScript conditional type limitation described in https://github.com/microsoft/TypeScript/issues/52144#issuecomment-2686250788
				// This does not compile. Ideally this would compile:
				// @ts-expect-error Compiler limitation.
				type _check9 = requireAssignableTo<undefined, IOptional>;
			}
		}

		// NodeFromSchema
		{
			class Simple extends schema.object("A", { x: [schema.number] }) {}
			class Customized extends schema.object("B", { x: [schema.number] }) {
				public customized = true;
			}

			// Class that implements both TreeNodeSchemaNonClass and TreeNodeSchemaNonClass
			class CustomizedBoth extends objectSchema("B", { x: [schema.number] }, true, false) {
				public customized = true;
			}

			type TA = NodeFromSchema<typeof Simple>;
			type _checkA = requireAssignableTo<TA, Simple>;

			type TB = NodeFromSchema<typeof Customized>;
			type _checkB = requireAssignableTo<TB, Customized>;

			type TC = NodeFromSchema<typeof CustomizedBoth>;
			type _checkC = requireAssignableTo<TC, CustomizedBoth>;
		}
	}

	describe("insertable", () => {
		it("Lists", () => {
			const List = schema.array(schema.number);
			const NestedList = schema.array(List);

			const list: number[] = [5];
			const nestedList: number[][] = [[5]];

			// Not nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof schema.number>;
				type I2 = InsertableTypedNode<typeof schema.number>;
				type I3 = NodeBuilderData<typeof schema.number>;

				type N1 = NodeFromSchema<typeof schema.number>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof schema.number>;
				type N3 = TreeFieldFromImplicitField<typeof schema.number>;

				type _check1 = requireTrue<areSafelyAssignable<I1, number>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, number>>;
				type _check3 = requireTrue<areSafelyAssignable<I3, number>>;
				type _check4 = requireTrue<areSafelyAssignable<N1, number>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, number>>;
				type _check6 = requireTrue<areSafelyAssignable<N3, number>>;
			}

			// Not nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof List>;
				type I2 = InsertableTypedNode<typeof List>;
				type I3 = NodeBuilderData<typeof List>;
				type I4 = NodeBuilderData<UnionToIntersection<typeof List>>;

				type N1 = NodeFromSchema<typeof List>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof List>;
				type N3 = TreeFieldFromImplicitField<typeof List>;

				type _check1 = requireTrue<areSafelyAssignable<I1, I2>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, N1 | Iterable<number>>>;
				type _check3 = requireTrue<areSafelyAssignable<I3, Iterable<number>>>;
				type _check6 = requireTrue<areSafelyAssignable<I4, Iterable<number>>>;
				type _check4 = requireTrue<areSafelyAssignable<N1, N2>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, N3>>;
			}

			// Nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof NestedList>;
				type I2 = InsertableTypedNode<typeof NestedList>;
				type I3 = NodeBuilderData<typeof NestedList>;

				type N1 = NodeFromSchema<typeof NestedList>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof NestedList>;
				type N3 = TreeFieldFromImplicitField<typeof NestedList>;

				type _check1 = requireTrue<areSafelyAssignable<I1, I2>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, N1 | I3>>;
				type _check3 = requireAssignableTo<Iterable<Iterable<number>>, I3>;
				type _check4 = requireTrue<areSafelyAssignable<N1, N2>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, N3>>;
			}

			// Regression test for InsertableTypedNode not distributing over unions correctly.
			{
				type X = InsertableTypedNode<typeof List | typeof schema.number>;
				type _check = requireTrue<areSafelyAssignable<X, never>>;
			}
		});

		it("unsound union properties", () => {
			const schemaFactory = new SchemaFactory("demo");
			class A extends schema.object("A", { value: schemaFactory.number }) {}
			class B extends schema.object("B", { value: schemaFactory.string }) {}

			function setValue(node: A | B, v: number | string): void {
				// TODO: This is not safe: this should not build
				// This limitation is due to an unsoundness in TypeScript's support for union property assignment.
				// See https://github.com/microsoft/TypeScript/issues/33911#issuecomment-2489283581 for details.
				// At the time of writing (TypeScript 5.6), this issue is still present despite the issue being closed as completed.
				node.value = v;
			}

			assert.throws(() => setValue(new A({ value: 5 }), "x"), validateUsageError(/number/));
		});

		it("Objects", () => {
			const A = schema.object("A", {});
			const B = schema.object("B", { a: A });

			type A = NodeFromSchema<typeof A>;

			const a = new A({});
			const b = new B({ a });
			const b2 = new B({ a: {} });

			// @ts-expect-error empty nodes should not allow non objects.
			const a2: A = 0;
			// @ts-expect-error empty nodes should not allow non objects.
			const a3: InsertableTypedNode<typeof A> = 0;

			// @ts-expect-error empty nodes should not allow non-node.
			const a4: NodeFromSchema<typeof A> = {};

			// Insertable nodes allow non-node objects.
			const a5: InsertableTypedNode<typeof A> = {};
		});

		it("Customized Objects", () => {
			class A extends schema.object("A", {}) {
				public extra: number = 0;
			}
			class B extends schema.object("B", { a: A }) {
				public extra: string = "";
			}

			const a = new A({});
			const b = new B({ a });
			const b2 = new B({ a: {} });
		});

		it("Mixed Regression test", () => {
			class Note extends schema.object("Note", {}) {
				public isSelected: boolean = false;
			}

			class NodeMap extends schema.map("NoteMap", Note) {}
			class NodeList extends schema.array("NoteList", Note) {}

			class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

			const y = new NodeList([{}]);

			// There was a bug where unions with maps lost implicit contractibility, causing this to not compile:
			const x = new Canvas({
				stuff: [{}],
			});

			const allowed = [NodeMap, NodeList] as const;
			type X = InsertableTreeNodeFromAllowedTypes<typeof allowed>;
			const test: X = [{}];

			const allowed2 = [NodeMap] as const;
			type X2 = InsertableTreeNodeFromAllowedTypes<typeof allowed2>;

			const allowed3 = [NodeList] as const;
			type X3 = InsertableTreeNodeFromAllowedTypes<typeof allowed3>;
			type _check1 = requireTrue<areSafelyAssignable<X3, X4>>;

			const allowed4 = NodeList;
			type X4 = InsertableTypedNode<typeof allowed4>;

			type X5 = InsertableTreeFieldFromImplicitField<typeof allowed>;
			const test2: X5 = [{}];

			type X6 = InsertableObjectFromSchemaRecord<typeof Canvas.info>;
			type X7 = InsertableTreeFieldFromImplicitField<typeof Canvas.info.stuff>;
		});

		it("Mixed Regression test", () => {
			class Note extends schema.object("Note", {}) {
				public isSelected: boolean = false;
			}

			class Canvas extends schema.object("Canvas", { stuff: [Note] }) {}

			const y = new Note({});

			// There was a bug where unions with maps lost implicit contractibility, causing this to not compile:
			const x = new Canvas({
				stuff: {},
			});

			const allowed = [Note] as const;
			type X = InsertableTreeNodeFromAllowedTypes<typeof allowed>;
			const test: X = {};

			const allowed3 = [Note] as const;
			type X3 = InsertableTreeNodeFromAllowedTypes<typeof allowed3>;
			type _check1 = requireTrue<areSafelyAssignable<X3, X4>>;

			const allowed4 = Note;
			type X4 = InsertableTypedNode<typeof allowed4>;

			type X5 = InsertableTreeFieldFromImplicitField<typeof allowed>;
			const test2: X5 = {};

			type X6 = InsertableObjectFromSchemaRecord<typeof Canvas.info>;
			type X7 = InsertableTreeFieldFromImplicitField<typeof Canvas.info.stuff>;
		});
	});

	it("TreeLeafValue", () => {
		type _check = requireTrue<areSafelyAssignable<TreeLeafValue, TreeValue>>;
	});

	describe("normalizeAllowedTypes", () => {
		it("Normalizes single type", () => {
			const schemaFactory = new SchemaFactory("test");
			const result = normalizeAllowedTypes(schemaFactory.number);
			assert.equal(result.size, 1);
			assert(result.has(schemaFactory.number));
		});

		it("Normalizes multiple types", () => {
			const schemaFactory = new SchemaFactory("test");
			const result = normalizeAllowedTypes([schemaFactory.number, schemaFactory.boolean]);
			assert.equal(result.size, 2);
			assert(result.has(schemaFactory.boolean));
			assert(result.has(schemaFactory.number));
		});

		it("Normalizes recursive schemas", () => {
			const schemaFactory = new SchemaFactory("test");
			class Foo extends schemaFactory.objectRecursive("Foo", {
				x: () => Bar,
			}) {}
			class Bar extends schemaFactory.objectRecursive("Bar", {
				y: () => Foo,
			}) {}
			const result = normalizeAllowedTypes([Foo, Bar]);
			assert.equal(result.size, 2);
			assert(result.has(Foo));
			assert(result.has(Bar));
		});

		it("Normalization fails when a referenced schema has not yet been instantiated", () => {
			const schemaFactory = new SchemaFactory("test");

			let Bar: TreeNodeSchema;
			class Foo extends schemaFactory.objectRecursive("Foo", {
				x: () => Bar,
			}) {}

			assert.throws(
				() => normalizeAllowedTypes([Foo, Bar]),
				(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
			);
		});
	});

	it("areImplicitFieldSchemaEqual", () => {
		const sf = new SchemaFactory("test");
		function check(a: ImplicitFieldSchema, b: ImplicitFieldSchema, expected: boolean) {
			assert.equal(areImplicitFieldSchemaEqual(a, b), expected);
		}

		check(sf.number, sf.number, true); // Same type
		check(sf.number, sf.string, false); // Different types
		check([sf.number], sf.number, true); // Array vs. single
		check([sf.number], [sf.number], true); // Both arrays
		check([sf.number, sf.string], [sf.number, sf.string], true); // Multiple types
		check([sf.number, sf.string], [sf.string, sf.number], true); // Multiple types in different order
		check(sf.required(sf.number), sf.number, true); // Explicit vs. implicit
		check(sf.required(sf.number), [sf.number], true); // Explicit vs. implicit in array
		check(sf.required([sf.number, sf.string]), [sf.string, sf.number], true); // Multiple explicit vs. implicit
		check(sf.required(sf.number), sf.optional(sf.number), false); // Different kinds
		check(sf.required(sf.number), sf.required(sf.number, {}), true); // One with empty props
		check(sf.required(sf.number, { key: "a" }), sf.required(sf.number, { key: "a" }), true); // Props with same key
		check(sf.required(sf.number, { key: "a" }), sf.required(sf.number, { key: "b" }), false); // Props with different key
		check(sf.required(sf.number, {}), sf.required(sf.number, { metadata: {} }), true); // One with empty metadata
		check(
			sf.required(sf.number, { metadata: { description: "a" } }),
			sf.required(sf.number, { metadata: { description: "a" } }),
			true,
		); // Same description
		check(
			sf.required(sf.number, { metadata: { description: "a" } }),
			sf.required(sf.number, { metadata: { description: "b" } }),
			false,
		); // Different description
		check(
			sf.required(sf.number, { metadata: { custom: "a" } }),
			sf.required(sf.number, { metadata: { custom: "a" } }),
			true,
		); // Same custom metadata
		check(
			sf.required(sf.number, { metadata: { custom: "a" } }),
			sf.required(sf.number, { metadata: { custom: "b" } }),
			false,
		); // Different custom metadata
		check(sf.identifier, sf.optional(sf.string), false); // Identifier vs. optional string
	});

	/**
	 * Tests for patterns for making generically parameterized schema.
	 *
	 * Since the schema themselves can not be generic (at least not in a way thats captured in the stored schema),
	 * this is done by making generic functions that return schema.
	 *
	 * Authoring such functions involves passing generic type parameters into the various schema type utilities,
	 * and this causes some issues with many of them.
	 */
	describe("Generic Schema", () => {
		// Many of these cases should compile, but don't.
		// This is likely due to `[FieldSchema<Kind, T>] extends [ImplicitFieldSchema] ? TrueCase : FalseCase` not getting reduced to `TrueCase`.
		// This could be due to the compiler limitation noted in https://github.com/microsoft/TypeScript/issues/52144#issuecomment-2686250788

		/**
		 * Tests where the generic code constructs TreeNodes for the generic its defining.
		 * This scenario seems to be particularly problematic as the {@link Input} types seems to perform especially poorly due
		 * to them using non distributive conditional types, which hits the issue noted above.
		 */
		it("Generic container construction", () => {
			const sf = new SchemaFactory("test");

			/**
			 * Define a generic container which holds the provided `T` directly as an implicit field schema.
			 */
			function makeInstanceImplicit<T extends ImplicitAllowedTypes>(
				schemaTypes: T,
				content: InsertableTreeFieldFromImplicitField<T>,
			) {
				class GenericContainer extends sf.object("GenericContainer", {
					content: schemaTypes,
				}) {}

				// Both create and the constructor type check as desired.
				const _created = TreeAlpha.create(GenericContainer, { content });
				return new GenericContainer({ content });
			}

			/**
			 * Define a generic container which holds the provided `T` in an required field.
			 *
			 * This should function identically to the implicit one, but it doesn't.
			 */
			function makeInstanceRequired<T extends ImplicitAllowedTypes>(
				schemaTypes: T,
				content: InsertableTreeFieldFromImplicitField<T>,
			) {
				class GenericContainer extends sf.object("GenericContainer", {
					content: sf.required(schemaTypes),
				}) {}

				// Users of the class (if it were returned from this test function with a concrete type instead of a generic one) would be fine,
				// but using it in this generic context has issues.
				// Specifically the construction APIs don't type check as desired.

				// @ts-expect-error Compiler limitation, see comment above.
				const _created = TreeAlpha.create(GenericContainer, { content });
				// @ts-expect-error Compiler limitation, see comment above.
				return new GenericContainer({ content });
			}

			/**
			 * Define a generic container which holds the provided `T` in an optional field.
			 */
			function makeInstanceOptional<T extends ImplicitAllowedTypes>(
				schemaTypes: T,
				content: InsertableTreeFieldFromImplicitField<T> | undefined,
			) {
				class GenericContainer extends sf.object("GenericContainer", {
					content: sf.optional(schemaTypes),
				}) {}

				// Like with the above case, TypeScript fails to simplify the input types, and these do not build.

				// @ts-expect-error Compiler limitation, see comment above.
				const _createdEmpty = TreeAlpha.create(GenericContainer, { content: undefined });
				// @ts-expect-error Compiler limitation, see comment above.
				const _created = TreeAlpha.create(GenericContainer, { content });
				// @ts-expect-error Compiler limitation, see comment above.
				const _constructedEmpty = new GenericContainer({ content: undefined });
				// @ts-expect-error Compiler limitation, see comment above.
				return new GenericContainer({ content });
			}

			/**
			 * Define a generic container which holds the provided `T` in an optional field, using objectRecursive.
			 * This case is included to highlight one scenario where the compiler limitation does not occur due to simpler typing.
			 */
			function makeInstanceOptionalRecursive<T extends ImplicitAllowedTypes>(
				schemaTypes: T,
				content: InsertableTreeFieldFromImplicitField<T> | undefined,
			) {
				class GenericContainer extends sf.objectRecursive("GenericContainer", {
					content: sf.optional(schemaTypes),
				}) {}

				// @ts-expect-error Compiler limitation, see comment above.
				const _createdEmpty = TreeAlpha.create(GenericContainer, { content: undefined });
				// @ts-expect-error Compiler limitation, see comment above.
				const _created = TreeAlpha.create(GenericContainer, { content });
				const _constructedEmpty = new GenericContainer({ content: undefined }); // This one works.
				// @ts-expect-error Compiler limitation, see comment above.
				return new GenericContainer({ content });
			}
		});

		it("Generic InsertableTreeFieldFromImplicitField", <T extends ImplicitAllowedTypes>() => {
			type Required = FieldSchema<FieldKind.Required, T>;

			type ArgFieldImplicit2 = InsertableTreeFieldFromImplicitField<T>;
			type ArgFieldRequired2 = InsertableTreeFieldFromImplicitField<Required>;

			// We would expect a required field and an implicitly required field to have the same types.
			// This is normally true, but is failing when the schema is generic due to the compiler limitation noted above.

			// @ts-expect-error Compiler limitation, see comment above.
			type _check5 = requireAssignableTo<ArgFieldRequired2, ArgFieldImplicit2>;
			// @ts-expect-error Compiler limitation, see comment above.
			type _check6 = requireAssignableTo<ArgFieldImplicit2, ArgFieldRequired2>;
		});

		it("Generic TreeFieldFromImplicitField", <T extends ImplicitAllowedTypes>() => {
			type Required = FieldSchema<FieldKind.Required, T>;

			type ArgFieldImplicit2 = TreeFieldFromImplicitField<T>;
			type ArgFieldRequired2 = TreeFieldFromImplicitField<Required>;

			// We would expect a required field and an implicitly required field to have the same types.
			// This is normally true, but is failing when the schema is generic due to the compiler limitation noted above.
			// This case is for the node types not the insertable ones, so it was more likely to work, but still fails.

			// @ts-expect-error Compiler limitation, see comment above.
			type _check5 = requireAssignableTo<ArgFieldRequired2, ArgFieldImplicit2>;
			// @ts-expect-error Compiler limitation, see comment above.
			type _check6 = requireAssignableTo<ArgFieldImplicit2, ArgFieldRequired2>;
		});

		it("Generic optional field", <T extends ImplicitAllowedTypes>() => {
			type Optional = FieldSchema<FieldKind.Optional, T>;

			type ArgFieldImplicit = InsertableTreeFieldFromImplicitField<T>;
			type ArgFieldOptional = InsertableTreeFieldFromImplicitField<Optional>;

			// An optional field should be the same as a required field unioned with undefined. Typescript fails to see this when its generic:

			// @ts-expect-error Compiler limitation, see comment above.
			type _check5 = requireAssignableTo<ArgFieldOptional, ArgFieldImplicit | undefined>;
			// @ts-expect-error Compiler limitation, see comment above.
			type _check6 = requireAssignableTo<ArgFieldImplicit | undefined, ArgFieldOptional>;

			// At least this case allows undefined, like recursive object fields, but unlike non recursive object fields.
			type _check7 = requireAssignableTo<undefined, ArgFieldOptional>;
		});
	});
});
