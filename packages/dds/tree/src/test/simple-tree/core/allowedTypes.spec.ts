/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	SchemaFactory,
	type booleanSchema,
	type InsertableObjectFromSchemaRecord,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type LazyItem,
	type numberSchema,
	type stringSchema,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";
import type {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";

import {
	normalizeAllowedTypes,
	normalizeAnnotatedAllowedTypes,
	normalizeToAnnotatedAllowedType,
	unannotateImplicitAllowedTypes,
	type AllowedTypes,
	type AllowedTypesMetadata,
	type AnnotatedAllowedType,
	type AnnotatedAllowedTypes,
	type ImplicitAllowedTypes,
	type ImplicitAnnotatedAllowedTypes,
	type InsertableTreeNodeFromAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	type UnannotateAllowedTypeOrLazyItem,
	type UnannotateAllowedTypes,
	type UnannotateAllowedTypesList,
	type UnannotateImplicitAllowedTypes,
	// eslint-disable-next-line import/no-internal-modules
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
}

// Type tests for unannotate utilities
{
	// UnannotateImplicitAllowedTypes
	{
		{
			type _check = requireAssignableTo<
				UnannotateImplicitAllowedTypes<ImplicitAnnotatedAllowedTypes>,
				ImplicitAllowedTypes
			>;
		}

		{
			type T = TreeNodeSchema;
			type _check = requireAssignableTo<
				T,
				UnannotateImplicitAllowedTypes<ImplicitAnnotatedAllowedTypes>
			>;
		}

		{
			type T = AllowedTypes;
			type _check = requireAssignableTo<
				T,
				UnannotateImplicitAllowedTypes<ImplicitAnnotatedAllowedTypes>
			>;
		}
	}

	// UnannotateAllowedTypeOrLazyItem
	{
		type A = LazyItem<TreeNodeSchema>;
		type B = AnnotatedAllowedType;

		type _check1 = requireAssignableTo<A, UnannotateAllowedTypeOrLazyItem<A>>;

		type _check2 = requireAssignableTo<UnannotateAllowedTypeOrLazyItem<A>, A>;

		type _check3 = requireAssignableTo<UnannotateAllowedTypeOrLazyItem<B>, A>;
	}

	// UnannotateAllowedTypesList
	{
		type A1 = AnnotatedAllowedType;
		type A2 = LazyItem<TreeNodeSchema>;
		type Mixed = readonly [A1, A2];

		type Empty = readonly [];
		type _check1 = requireAssignableTo<Empty, UnannotateAllowedTypesList<Empty>>;

		type _check2 = requireAssignableTo<UnannotateAllowedTypesList<Mixed>, readonly A2[]>;
	}

	// UnannotateAllowedTypes
	{
		type AnnotatedList = readonly [AnnotatedAllowedType, LazyItem<TreeNodeSchema>];

		type _check = requireAssignableTo<
			UnannotateAllowedTypes<{
				metadata: AllowedTypesMetadata;
				types: AnnotatedList;
			}>,
			readonly [LazyItem<TreeNodeSchema>, LazyItem<TreeNodeSchema>]
		>;
	}
}

describe("allowedTypes", () => {
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
				x: [() => Bar],
			}) {}
			class Bar extends schemaFactory.objectRecursive("Bar", {
				y: [() => Foo],
			}) {}
			const result = normalizeAllowedTypes([Foo, Bar]);
			assert.equal(result.size, 2);
			assert(result.has(Foo));
			assert(result.has(Bar));
		});

		it("Normalization fails when a referenced schema has not yet been instantiated", () => {
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

			assert.throws(
				() => normalizeAllowedTypes([Foo, Bar]),
				(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
			);
		});
	});

	describe("unannotateImplicitAllowedTypes", () => {
		const fakeSchema = schema.string;
		const lazy = () => fakeSchema;

		it("handles a raw TreeNodeSchema", () => {
			assert.equal(unannotateImplicitAllowedTypes(fakeSchema), fakeSchema);
		});

		it("handles AnnotatedAllowedType", () => {
			const input: AnnotatedAllowedType = { metadata: {}, type: lazy };
			assert.equal(unannotateImplicitAllowedTypes(input), lazy);
		});

		it("handles array of mixed annotated/unannotated", () => {
			const input: readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[] = [
				{ metadata: {}, type: lazy },
				lazy,
			];
			assert.deepEqual(unannotateImplicitAllowedTypes(input), [lazy, lazy]);
		});

		it("handles AnnotatedAllowedTypes object", () => {
			const input: AnnotatedAllowedTypes = {
				metadata: { custom: { something: true } },
				types: [{ metadata: {}, type: lazy }],
			};
			assert.deepEqual(unannotateImplicitAllowedTypes(input), [lazy]);
		});

		it("handles single AnnotatedAllowedType nested directly", () => {
			const input: AnnotatedAllowedType = {
				metadata: { custom: { something: true } },
				type: lazy,
			};
			assert.deepEqual(unannotateImplicitAllowedTypes(input), lazy);
		});

		it("handles empty array of allowed types", () => {
			const input: readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[] = [];
			assert.deepEqual(unannotateImplicitAllowedTypes(input), []);
		});

		it("handles empty array of allowed types in AnnotatedAllowedTypes", () => {
			const input: AnnotatedAllowedTypes = {
				metadata: { custom: { something: true } },
				types: [],
			};
			assert.deepEqual(unannotateImplicitAllowedTypes(input), []);
		});

		it("handles array of mixed annotated/unannotated in AnnotatedAllowedTypes", () => {
			const input: AnnotatedAllowedTypes = {
				metadata: { custom: { something: true } },
				types: [{ metadata: {}, type: lazy }, lazy],
			};
			assert.deepEqual(unannotateImplicitAllowedTypes(input), [lazy, lazy]);
		});
	});

	describe("normalizeToAnnotatedAllowedType", () => {
		const fakeSchema = SchemaFactory.string;
		const lazy = () => fakeSchema;

		it("wraps TreeNodeSchema in an annotation", () => {
			const result = normalizeToAnnotatedAllowedType(fakeSchema);
			assert.deepStrictEqual(result, { metadata: {}, type: fakeSchema });
		});

		it("returns input unchanged if already AnnotatedAllowedType", () => {
			const input: AnnotatedAllowedType = {
				metadata: { custom: { something: true } },
				type: fakeSchema,
			};
			const result = normalizeToAnnotatedAllowedType(input);
			assert.deepStrictEqual(result, input);
		});

		it("evaluates any lazy schemas", () => {
			const input: AnnotatedAllowedType = {
				metadata: { custom: { something: true } },
				type: lazy,
			};
			const result = normalizeToAnnotatedAllowedType(input);
			assert.deepStrictEqual(result, {
				metadata: { custom: { something: true } },
				type: fakeSchema,
			});
		});
	});

	describe("normalizeAnnotatedAllowedTypes", () => {
		const stringSchema = schema.string;
		const numberSchema = schema.number;
		const lazyString = () => stringSchema;
		const lazyNumber = () => numberSchema;

		it("adds metadata when it doesn't already exist", () => {
			const result = normalizeAnnotatedAllowedTypes(stringSchema);
			assert.deepStrictEqual(result, {
				metadata: {},
				types: [{ metadata: {}, type: stringSchema }],
			});
		});

		it("evaluates any lazy allowed types", () => {
			const input = [lazyString, { metadata: { custom: true }, type: lazyNumber }];
			const result = normalizeAnnotatedAllowedTypes(input);
			assert.deepStrictEqual(result, {
				metadata: {},
				types: [
					{ metadata: {}, type: stringSchema },
					{ metadata: { custom: true }, type: numberSchema },
				],
			});
		});

		it("handles single AnnotatedAllowedType", () => {
			const input: AnnotatedAllowedType = { metadata: { custom: 1 }, type: lazyString };
			const result = normalizeAnnotatedAllowedTypes(input);
			assert.deepStrictEqual(result, {
				metadata: {},
				types: [{ metadata: { custom: 1 }, type: stringSchema }],
			});
		});

		it("retains top level metadata from AnnotatedAllowedTypes object", () => {
			const input: AnnotatedAllowedTypes = {
				metadata: {
					custom: "test",
				},
				types: [{ metadata: { custom: 1 }, type: lazyString }],
			};
			const result = normalizeAnnotatedAllowedTypes(input);
			assert.deepStrictEqual(result, {
				metadata: { custom: "test" },
				types: [{ metadata: { custom: 1 }, type: stringSchema }],
			});
		});
	});

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
	});
});
