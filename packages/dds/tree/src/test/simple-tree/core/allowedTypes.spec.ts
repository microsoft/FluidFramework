/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	allowUnused,
	numberSchema,
	SchemaFactory,
	stringSchema,
	type booleanSchema,
	type InsertableObjectFromSchemaRecord,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type LazyItem,
	type NodeKind,
	type ObjectFromSchemaRecord,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaCore,
	type TreeNodeSchemaNonClass,
} from "../../../simple-tree/index.js";
import type {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
	UnionToIntersection,
} from "../../../util/index.js";

import {
	AnnotatedAllowedTypesInternal,
	isAnnotatedAllowedType,
	normalizeAllowedTypes,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	normalizeToAnnotatedAllowedType,
	type AllowedTypes,
	type AllowedTypesFull,
	type AllowedTypesFullEvaluated,
	type AllowedTypesFullFromMixed,
	type AnnotateAllowedTypesList,
	type AnnotatedAllowedType,
	type AnnotatedAllowedTypes,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NumberKeys,
	type TreeNodeFromImplicitAllowedTypes,
	type UnannotateAllowedTypesList,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/core/allowedTypes.js";
import { validateUsageError } from "../../utils.js";

const schema = new SchemaFactory("com.example");

// Unconstrained
{
	// Output
	type N2 = TreeNodeFromImplicitAllowedTypes;
	type _check5 = requireTrue<areSafelyAssignable<N2, TreeNode | TreeLeafValue>>;
}

// InsertableTreeNodeFromImplicitAllowedTypes
{
	class A extends schema.object("A", { x: [schema.number, schema.string] }) {}
	class B extends schema.object("B", { x: [schema.number, schema.null] }) {}

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
	class A extends schema.object("A", { x: [schema.number, schema.string] }) {}
	class B extends schema.object("B", { x: [schema.number, schema.null] }) {}

	{
		type T = InsertableTreeNodeFromAllowedTypes<AllowedTypes>;
		type _check = requireAssignableTo<T, never>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[typeof numberSchema, typeof stringSchema]>;
		type _check = requireTrue<areSafelyAssignable<T, number | string>>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[]>;
		type _check = requireAssignableTo<T, never>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[typeof A, typeof B]>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[typeof A, typeof B] | [typeof A]>;
		type _check = requireAssignableTo<T, never>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[typeof B, typeof A] | [typeof A]>;
		type _check = requireAssignableTo<T, never>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<[typeof A, typeof B | typeof A]>;
		type _check = requireAssignableTo<A, T>;
		type _check2 = requireFalse<isAssignableTo<B, T>>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<
			UnannotateAllowedTypesList<AnnotateAllowedTypesList<[typeof A, typeof B]>>
		>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<
			AllowedTypesFull<AnnotateAllowedTypesList<[typeof A, typeof B]>>
		>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<
			AllowedTypesFullFromMixed<[typeof A, typeof B]>
		>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		type Annotated = AnnotateAllowedTypesList<[typeof A, typeof B]>;
		type T = InsertableTreeNodeFromAllowedTypes<
			AnnotatedAllowedTypes<Annotated> & [typeof A, typeof B]
		>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		type T = InsertableTreeNodeFromAllowedTypes<AnnotatedAllowedTypes & [typeof A, typeof B]>;
		type _check = requireAssignableTo<A | B, T>;
	}

	{
		// Must ignore irrelevant fields
		type T = InsertableTreeNodeFromAllowedTypes<{ x: 5 } & [typeof A, typeof B]>;
		type _check = requireAssignableTo<A | B, T>;
	}
}

// NumberKeys
{
	type F = { x: 4 } & [5, 6];
	type Keys = NumberKeys<F>;

	allowUnused<requireAssignableTo<Keys, "0" | "1">>();
	allowUnused<requireAssignableTo<"0" | "1", Keys>>();
}

// AllowedTypesFullEvaluated
{
	allowUnused<requireAssignableTo<AllowedTypesFullEvaluated, readonly TreeNodeSchema[]>>();
}

// Type tests for unannotate utilities
{
	// UnannotateAllowedTypesList
	{
		type A1 = AnnotatedAllowedType;
		type A2 = LazyItem<TreeNodeSchema>;
		type Mixed = readonly [A1, A2];

		type Empty = readonly [];
		{
			type _check1 = requireAssignableTo<Empty, UnannotateAllowedTypesList<Empty>>;
			type _check2 = requireAssignableTo<UnannotateAllowedTypesList<Mixed>, readonly A2[]>;
		}

		// Generic cases
		{
			type A = LazyItem<TreeNodeSchema>;
			type B = AnnotatedAllowedType;

			type _check1 = requireAssignableTo<[A], UnannotateAllowedTypesList<[A]>>;
			type _check2 = requireAssignableTo<UnannotateAllowedTypesList<[A]>, [A]>;
			type _check3 = requireAssignableTo<UnannotateAllowedTypesList<[B]>, [A]>;
			type _check4 = requireAssignableTo<
				UnannotateAllowedTypesList<[AnnotatedAllowedType<TreeNodeSchema>]>,
				[TreeNodeSchema]
			>;
		}
		// Concrete cases
		{
			type A = typeof SchemaFactory.number;

			type _check1 = requireTrue<areSafelyAssignable<UnannotateAllowedTypesList<[A]>, [A]>>;
			type _check2 = requireTrue<
				areSafelyAssignable<
					UnannotateAllowedTypesList<[{ type: A; metadata: { custom: "x" } }]>,
					[A]
				>
			>;

			type _check4 = requireAssignableTo<UnannotateAllowedTypesList<[A]>, [A]>;
		}
	}
}

describe("allowedTypes", () => {
	describe("isAnnotatedAllowedType", () => {
		it("returns true for AnnotatedAllowedType", () => {
			assert(isAnnotatedAllowedType({ metadata: {}, type: schema.string }));
			assert(isAnnotatedAllowedType({ metadata: {}, type: () => schema.string }));
		});

		it("returns false for LazyItem", () => {
			assert(!isAnnotatedAllowedType(() => schema.string));
		});

		it("does not evaluate LazyItem", () => {
			assert(!isAnnotatedAllowedType(() => assert.fail()));
		});

		it("returns false for schema", () => {
			assert(!isAnnotatedAllowedType(schema.string));
			class Test extends schema.object("Test", {}) {}
			assert(!isAnnotatedAllowedType(Test));
			class Test2 extends schema.object("Test", {}) {
				public static override metadata = {};
			}
			assert(!isAnnotatedAllowedType(Test2));
		});
	});

	describe("AnnotatedAllowedTypesInternal", () => {
		it("create", () => {
			const types = AnnotatedAllowedTypesInternal.create(
				[{ metadata: {}, type: schema.string }],
				{ custom: "customValue" },
			);
			assert.deepEqual(types.metadata, { custom: "customValue" });
			assert.deepEqual(types.types, [{ metadata: {}, type: schema.string }]);
			assert.deepEqual(types.length, 1);
			assert.deepEqual(types[0], schema.string);
			assert.deepEqual([...types], [schema.string]);
		});

		it("object apis", () => {
			const types = AnnotatedAllowedTypesInternal.create(
				[{ metadata: {}, type: schema.string }],
				{ custom: "customValue" },
			);

			const keys = new Set(Object.keys(types));
			assert(keys.has("0"));
			assert(!keys.has("1"));

			// Not enumerable:
			assert(!keys.has("length"));
			assert(!keys.has("types"));
			assert(!keys.has("metadata"));
			assert("length" in types);
			assert("types" in types);
			assert("metadata" in types);
		});

		it("deepEquals", () => {
			const types = AnnotatedAllowedTypesInternal.create(
				[{ metadata: {}, type: schema.string }],
				{ custom: "customValue" },
			);
			const types2 = AnnotatedAllowedTypesInternal.create(
				[{ metadata: {}, type: schema.string }],
				{ custom: "customValue" },
			);

			// deepEqual tests a lot of generic object API which can violate proxy invariants and crash.
			assert.deepEqual(types, types2);
		});

		it("narrowing", () => {
			const types = AnnotatedAllowedTypesInternal.create(
				[{ metadata: {}, type: schema.string }],
				{ custom: "customValue" },
			);
			// While this implements readonly array, it is not actually an array.
			// The proxy could be changed to make it appear as an array.
			assert.equal(Array.isArray(types), false);
			assert(types instanceof AnnotatedAllowedTypesInternal);
		});
	});

	describe("normalizeAllowedTypes", () => {
		it("Normalizes single type", () => {
			const schemaFactory = new SchemaFactory("test");
			const result = normalizeAllowedTypes(schemaFactory.number);
			assert(result instanceof AnnotatedAllowedTypesInternal);
			assert.deepEqual([...result], [schemaFactory.number]);
		});

		it("Normalizes multiple types", () => {
			const schemaFactory = new SchemaFactory("test");
			const result = normalizeAllowedTypes([schemaFactory.number, schemaFactory.boolean]);
			assert(result instanceof AnnotatedAllowedTypesInternal);
			assert.deepEqual([...result], [schemaFactory.number, schemaFactory.boolean]);
		});

		it("Normalizes recursive schemas", () => {
			const schemaFactory = new SchemaFactory("test");
			class Foo extends schemaFactory.objectRecursive("Foo", {
				x: [() => Bar],
			}) {}
			class Bar extends schemaFactory.objectRecursive("Bar", {
				y: [() => Foo],
			}) {}
			const result = normalizeAllowedTypes([Foo, Bar]);
			assert(result instanceof AnnotatedAllowedTypesInternal);
			assert.deepEqual([...result], [Foo, Bar]);
		});
	});

	describe("evaluation fails when a referenced schema has not yet been instantiated", () => {
		const schemaFactory = new SchemaFactory("test");

		let Bar: TreeNodeSchema;

		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Make the compiler think that Bar might be initialized.
			Bar = assert.fail();
		}

		class Foo extends schemaFactory.objectRecursive("Foo", {
			x: [() => Bar],
		}) {}

		it("in an array", () => {
			assert.throws(
				() => normalizeAllowedTypes([Foo, Bar]),
				(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
			);
		});

		it("directly", () => {
			assert.throws(
				() => normalizeAllowedTypes(Bar),
				(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
			);
		});

		it("in a lazy reference", () => {
			const normalized = normalizeAllowedTypes([() => Bar]);
			assert.throws(
				() => normalized.evaluate(),
				(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
			);
		});
	});

	describe("normalizeToAnnotatedAllowedType", () => {
		const fakeSchema = SchemaFactory.string;
		const lazy = () => fakeSchema;

		it("wraps TreeNodeSchema in an annotation", () => {
			const result = normalizeToAnnotatedAllowedType(fakeSchema);
			assert.deepEqual(result, { metadata: {}, type: fakeSchema });
		});

		it("returns input unchanged if already AnnotatedAllowedType", () => {
			const input: AnnotatedAllowedType = {
				metadata: { custom: { something: true } },
				type: fakeSchema,
			};
			const result = normalizeToAnnotatedAllowedType(input);
			assert.deepEqual(result, input);
		});

		it("does not evaluate any lazy schema", () => {
			const noEval: () => typeof SchemaFactory.string = () =>
				assert.fail("Should not evaluate lazy schema");

			const input: AnnotatedAllowedType = {
				metadata: { custom: { something: true } },
				type: noEval,
			};
			const result = normalizeToAnnotatedAllowedType(input);
			assert.deepEqual(result, {
				metadata: { custom: { something: true } },
				type: noEval,
			});

			const result2 = normalizeToAnnotatedAllowedType(noEval);
			assert.deepEqual(result2, {
				metadata: {},
				type: noEval,
			});
		});
	});

	describe("normalizeAnnotatedAllowedTypes", () => {
		const lazyString = () => stringSchema;
		const lazyNumber = () => numberSchema;

		it("adds metadata when it doesn't already exist", () => {
			const result = normalizeAndEvaluateAnnotatedAllowedTypes(stringSchema);
			assert.deepEqual(
				result,
				AnnotatedAllowedTypesInternal.create([{ metadata: {}, type: stringSchema }]),
			);
		});

		it("evaluates any lazy allowed types", () => {
			const input = AnnotatedAllowedTypesInternal.createMixed([
				lazyString,
				{ metadata: { custom: true }, type: lazyNumber },
			]);
			const result = normalizeAndEvaluateAnnotatedAllowedTypes(input);
			assert.deepEqual(
				result,
				AnnotatedAllowedTypesInternal.create([
					{ metadata: {}, type: stringSchema },
					{ metadata: { custom: true }, type: numberSchema },
				]),
			);
		});

		it("retains top level metadata from AnnotatedAllowedTypes object", () => {
			const input = AnnotatedAllowedTypesInternal.create(
				[{ metadata: { custom: 1 }, type: lazyString }],
				{
					custom: "test",
				},
			);

			const result = normalizeAndEvaluateAnnotatedAllowedTypes(input);
			assert.deepEqual(
				result,
				AnnotatedAllowedTypesInternal.create(
					[{ metadata: { custom: 1 }, type: stringSchema }],
					{ custom: "test" },
				),
			);
		});
	});

	/**
	 * Insertable types behave contravariantly to their schema, requiring special handling of unions.
	 * See {@link Input} for documentation and details.
	 */
	describe("insertable", () => {
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

		it("Mixed Regression test 2", () => {
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

		it("InsertableTreeNodeFromAllowedTypes with arrays of Unions", () => {
			const sf = new SchemaFactory("test");

			class Text1 extends sf.object("TextItem", { text: sf.string }) {}
			class Text2 extends sf.object("TextItem2", { text: sf.string }) {}

			type Text1Or2 = InsertableTreeNodeFromAllowedTypes<(typeof Text1 | typeof Text2)[]>;
			// If the exact schema is not known, we cannot guarantee that the input matches either schema,
			// and only allow input valid in both, which is `never`:
			allowUnused<requireAssignableTo<Text1Or2, never>>();

			const itemFields = { data: sf.number };
			type Item = TreeNode & ObjectFromSchemaRecord<typeof itemFields>;
			type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item>;

			// ItemSchema is rather under-specified, so it's unclear if it should allow insertion at all (it's logically a union of many possible schema, though not expressed as a union directly).
			// Currently it allows insertion of `Item`:
			type ItemInsertable = InsertableTreeNodeFromAllowedTypes<[ItemSchema]>;
			allowUnused<requireTrue<areSafelyAssignable<ItemInsertable, Item>>>();

			// Item or Text1 is even more under-specified, and this time as an explicit union.
			// This case is expected to resolve to never, but currently does not!
			type ItemOrText = InsertableTreeNodeFromAllowedTypes<(ItemSchema | typeof Text1)[]>;
			// TODO: Current unexpected behavior: Item is allowed. See SchemaUnionToIntersection test below for more details.
			allowUnused<requireTrue<areSafelyAssignable<ItemOrText, Item>>>();
			// @ts-expect-error Expected, but not working:
			allowUnused<requireAssignableTo<ItemOrText, never>>();
		});

		it("InsertableTypedNode with Unions", () => {
			const sf = new SchemaFactory("test");

			class Text1 extends sf.object("TextItem", { text: sf.string }) {}
			class Text2 extends sf.object("TextItem2", { text: sf.string }) {}

			type Text1Or2 = InsertableTypedNode<typeof Text1 | typeof Text2>;
			// If the exact schema is not known, we cannot guarantee that the input matches either schema,
			// and only allow input valid in both, which is `never`:
			allowUnused<requireAssignableTo<Text1Or2, never>>();

			const itemFields = { data: sf.number };
			type Item = TreeNode & ObjectFromSchemaRecord<typeof itemFields>;
			type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item>;

			// ItemSchema is rather under-specified, so it's unclear if it should allow insertion at all (it's logically a union of many possible schema, though not expressed as a union directly).
			// Currently it allows insertion of `Item`:
			type ItemInsertable = InsertableTypedNode<ItemSchema>;
			allowUnused<requireTrue<areSafelyAssignable<ItemInsertable, Item>>>();

			type ItemOrText = InsertableTypedNode<ItemSchema | typeof Text1>;
			// TODO: Current unexpected behavior: Item is allowed. See SchemaUnionToIntersection test below for more details.
			allowUnused<requireTrue<areSafelyAssignable<ItemOrText, Item>>>();
			// @ts-expect-error Expected, but not working:
			allowUnused<requireAssignableTo<ItemOrText, never>>();

			type TextSchemaIntersection = UnionToIntersection<typeof Text1 | typeof Text2>;
			allowUnused<requireAssignableTo<TextSchemaIntersection, never>>();

			type ItemAndTextSchema = UnionToIntersection<ItemSchema | typeof Text1>;
			// @ts-expect-error Expected, but not working:
			allowUnused<requireAssignableTo<ItemAndTextSchema, never>>();

			// ItemSchema is logically a union of many possible schema, though not expressed as a union directly,
			// and thus currently this resolves to `ItemSchema` itself:
			type ItemSchemaIntersection = UnionToIntersection<ItemSchema>;
			allowUnused<requireAssignableTo<ItemSchemaIntersection, ItemSchema>>();
		});

		// TODO: UnionToIntersection doesn't behave great with schema for the purpose of producing insertable types.
		// Consider replacing its use in such contexts with something like SchemaUnionToIntersection defined here.
		// Doing this change could break some code, so it might be best to do it after adding custom schema derived types so that impacted users have a supported migration path.
		// See https://github.com/microsoft/FluidFramework/pull/23084 for custom schema derived types.
		it("SchemaUnionToIntersection", () => {
			/**
			 * A version of UnionToIntersection that works better for generating {@link Input} types from schema.
			 * @remarks
			 * This still has a lot of unsolved issues and open questions, but generally seems like an improvement
			 * (or at least stricter and more consistent).
			 */
			type SchemaUnionToIntersection<T> = UnionToIntersection<SchemaToPair<T>> extends [
				infer s,
				infer X,
			]
				? s
				: never;

			type SchemaToPair<T> = T extends TreeNodeSchema<string, NodeKind, infer Node>
				? [T, Node]
				: [never, never];

			const sf = new SchemaFactory("test");

			class Text1 extends sf.object("TextItem", { text: sf.string }) {}
			class Text2 extends sf.object("TextItem2", { text: sf.string }) {}

			type Text1Or2 = SchemaUnionToIntersection<typeof Text1 | typeof Text2>;
			// If the exact schema is not known, we cannot guarantee that the input matches either schema,
			// and only allow input valid in both, which is `never`:
			allowUnused<requireAssignableTo<Text1Or2, never>>();

			const itemFields = { data: sf.number };
			type Item = TreeNode & ObjectFromSchemaRecord<typeof itemFields>;
			type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item>;
			type ItemSchemaClass = TreeNodeSchemaClass<string, NodeKind.Object, Item>;
			type ItemSchemaNonClass = TreeNodeSchemaNonClass<string, NodeKind.Object, Item>;

			// UnionToIntersection
			{
				type Text1Case = UnionToIntersection<typeof Text1>;
				type TextUnionCase = UnionToIntersection<typeof Text1 | typeof Text2>;

				type ItemSchemaClassCase = UnionToIntersection<ItemSchemaClass>;
				type ItemSchemaNonClassCase = UnionToIntersection<ItemSchemaNonClass>;
				type ItemSchemaCase = UnionToIntersection<ItemSchema>;
				type ItemSchemaOrTextCase = UnionToIntersection<ItemSchema | typeof Text1>;
				type ItemSchemaClassOrTextCase = UnionToIntersection<ItemSchemaClass | typeof Text1>;
				type ItemSchemaNonClassOrTextCase = UnionToIntersection<
					ItemSchemaNonClass | typeof Text1
				>;

				type TreeNodeSchemaCase = UnionToIntersection<TreeNodeSchema>;
				type TreeNodeSchemaNonClassCase = UnionToIntersection<TreeNodeSchemaNonClass>;
				type TreeNodeSchemaCoreCase = UnionToIntersection<
					TreeNodeSchemaCore<string, NodeKind, boolean>
				>;

				// These work as desired
				allowUnused<requireTrue<areSafelyAssignable<Text1Case, typeof Text1>>>();
				allowUnused<requireAssignableTo<TextUnionCase, never>>();

				// These are under-specified schema which pass through UnionToIntersection unchanged: likely undesired behavior but hard to fix cleanly.
				allowUnused<requireTrue<areSafelyAssignable<ItemSchemaClassCase, ItemSchemaClass>>>();
				allowUnused<
					requireTrue<areSafelyAssignable<ItemSchemaNonClassCase, ItemSchemaNonClass>>
				>();

				// @ts-expect-error This case is a messy type: that's not the input or never: clearly undesired behavior.
				allowUnused<requireTrue<areSafelyAssignable<ItemSchemaCase, ItemSchema>>>();
				// @ts-expect-error This case is a messy type: should be never: clearly undesired behavior.
				allowUnused<requireTrue<areSafelyAssignable<ItemSchemaOrTextCase, never>>>();
				// @ts-expect-error This case is a messy type: should be never: clearly undesired behavior.
				allowUnused<requireTrue<areSafelyAssignable<ItemSchemaClassOrTextCase, never>>>();
				// @ts-expect-error This case is a messy type: should be never: clearly undesired behavior.
				allowUnused<requireAssignableTo<ItemSchemaNonClassOrTextCase, never>>();

				// Generic cases: likely all of these should give never when used for input type generation as they are under-specified, but none do:
				allowUnused<
					requireAssignableTo<TreeNodeSchemaCase, TreeNodeSchemaNonClass & TreeNodeSchemaClass>
				>();
				allowUnused<
					requireTrue<areSafelyAssignable<TreeNodeSchemaNonClassCase, TreeNodeSchemaNonClass>>
				>();
				allowUnused<
					requireTrue<
						areSafelyAssignable<
							TreeNodeSchemaCoreCase,
							TreeNodeSchemaCore<string, NodeKind, boolean>
						>
					>
				>();
			}

			// SchemaUnionToIntersection
			{
				type Text1Case = SchemaUnionToIntersection<typeof Text1>;
				type TextUnionCase = SchemaUnionToIntersection<typeof Text1 | typeof Text2>;

				type ItemSchemaClassCase = SchemaUnionToIntersection<ItemSchemaClass>;
				type ItemSchemaNonClassCase = SchemaUnionToIntersection<ItemSchemaNonClass>;
				type ItemSchemaCase = SchemaUnionToIntersection<ItemSchema>;
				type ItemSchemaOrTextCase = SchemaUnionToIntersection<ItemSchema | typeof Text1>;
				type ItemSchemaClassOrTextCase = SchemaUnionToIntersection<
					ItemSchemaClass | typeof Text1
				>;
				type ItemSchemaNonClassOrTextCase = SchemaUnionToIntersection<
					ItemSchemaNonClass | typeof Text1
				>;

				type TreeNodeSchemaCase = SchemaUnionToIntersection<TreeNodeSchema>;
				type TreeNodeSchemaNonClassCase = SchemaUnionToIntersection<TreeNodeSchemaNonClass>;
				type TreeNodeSchemaCoreCase = SchemaUnionToIntersection<
					TreeNodeSchemaCore<string, NodeKind, boolean>
				>;

				allowUnused<requireTrue<areSafelyAssignable<Text1Case, typeof Text1>>>();
				allowUnused<requireAssignableTo<TextUnionCase, never>>();

				// It is unclear if these should be the desired behavior or not. Might be too permissive.
				allowUnused<requireTrue<areSafelyAssignable<ItemSchemaClassCase, ItemSchemaClass>>>();
				allowUnused<requireAssignableTo<ItemSchemaNonClassCase, ItemSchemaNonClassCase>>();

				// It is unclear if this should be the desired behavior or not. Might be too restrictive? It likely should be the same as the above two.
				allowUnused<requireAssignableTo<ItemSchemaCase, never>>();

				// These being never is good.
				allowUnused<requireAssignableTo<ItemSchemaOrTextCase, never>>();
				allowUnused<requireAssignableTo<ItemSchemaClassOrTextCase, never>>();
				allowUnused<requireAssignableTo<ItemSchemaNonClassOrTextCase, never>>();

				// These three should likely all behave the same: they currently do not.
				allowUnused<requireAssignableTo<TreeNodeSchemaCase, never>>();
				allowUnused<
					requireTrue<areSafelyAssignable<TreeNodeSchemaNonClassCase, TreeNodeSchemaNonClass>>
				>();
				allowUnused<requireAssignableTo<TreeNodeSchemaCoreCase, never>>();
			}

			// Use of SchemaToPair included to ease debugging.
			{
				type Text1Case = SchemaToPair<typeof Text1>;
				type TextUnionCase = SchemaToPair<typeof Text1 | typeof Text2>;

				type ItemSchemaClassCase = SchemaToPair<ItemSchemaClass>;
				type ItemSchemaNonClassCase = SchemaToPair<ItemSchemaNonClass>;
				type ItemSchemaCase = SchemaToPair<ItemSchema>;
				type ItemSchemaOrTextCase = SchemaToPair<ItemSchema | typeof Text1>;
				type ItemSchemaClassOrTextCase = SchemaToPair<ItemSchemaClass | typeof Text1>;
				type ItemSchemaNonClassOrTextCase = SchemaToPair<ItemSchemaNonClass | typeof Text1>;

				type TreeNodeSchemaCase = SchemaToPair<TreeNodeSchema>;
				type TreeNodeSchemaNonClassCase = SchemaToPair<TreeNodeSchemaNonClass>;
				type TreeNodeSchemaCoreCase = SchemaToPair<
					TreeNodeSchemaCore<string, NodeKind, boolean>
				>;
			}
		});
	});

	// If derived data is computed based on an allowed type array, then modifications to that array would cause the derived data to become invalid.
	// As there is no invalidation mechanism, this would lead to incorrect behavior, and is prevented by freezing the arrays when the derived data is computed.
	// These are glass box tests: they are testing that the cases where the code currently derives data from the arrays results in the arrays being frozen.
	// Future changes could be made to delay both the freezing and the computation of the derived data:
	// if such changes are made these tests will need to be updated.
	// If done, these tests may need updates to instead test that modifying the arrays does not expose incorrect derived data.
	describe("freezes inputs producing derived data", () => {
		it("AnnotatedAllowedTypesInternal.create", () => {
			const input = [{ type: stringSchema, metadata: {} }];
			const result = AnnotatedAllowedTypesInternal.create(input);
			assert(Object.isFrozen(input));
			assert.throws(() => {
				// @ts-expect-error Array should be readonly, so this error is good.
				result.push(stringSchema);
			}, "TypeError: result.push is not a function");
		});

		it("normalizeAllowedTypes", () => {
			const input = [stringSchema];
			const _ = normalizeAllowedTypes(input);
			assert(Object.isFrozen(input));
		});

		it("AnnotatedAllowedTypesInternal.createUnannotated", () => {
			const input = [stringSchema];
			const _ = AnnotatedAllowedTypesInternal.createUnannotated(input);
			assert(Object.isFrozen(input));
		});

		it("AnnotatedAllowedTypesInternal.createMixed", () => {
			const input = [stringSchema];
			const _ = AnnotatedAllowedTypesInternal.createMixed(input);
			assert(Object.isFrozen(input));
		});
	});
});
