/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	SchemaFactoryAlpha,
	type AllowedTypes,
	type booleanSchema,
	type ImplicitAllowedTypes,
	type numberSchema,
	type stringSchema,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
} from "../../simple-tree/index.js";

import {
	type FieldKind,
	type FieldSchema,
	type ImplicitAnnotatedFieldSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type TreeFieldFromImplicitField,
	type UnannotateImplicitFieldSchema,
	areImplicitFieldSchemaEqual,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/fieldSchema.js";

import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../util/index.js";
import { TreeAlpha } from "../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");

describe("fieldSchema", () => {
	{
		class A extends schema.object("A", { x: [schema.number, schema.string] }) {}
		class B extends schema.object("B", { x: [schema.number, schema.null] }) {}
		// Unconstrained
		{
			// Input
			type I1 = InsertableTreeFieldFromImplicitField<ImplicitFieldSchema>;
			type _check1 = requireTrue<areSafelyAssignable<I1, never>>;

			// Output
			type N3 = TreeFieldFromImplicitField;
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
	}

	it("areImplicitFieldSchemaEqual", () => {
		const sf = new SchemaFactoryAlpha("test");
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
		// Same persisted metadata
		check(
			sf.required(sf.number, { persistedMetadata: { foo: "a" } }),
			sf.required(sf.number, { persistedMetadata: { foo: "a" } }),
			true,
		);
		// Different persisted metadata
		check(
			sf.required(sf.number, { persistedMetadata: { foo: "a" } }),
			sf.required(sf.number, { persistedMetadata: { foo: "b" } }),
			true,
		);
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
		 * Tests where the generic code constructs TreeNodes for the generic it's defining.
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
			 * Define a generic container which holds the provided `T` in a required field.
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
				// @ts-expect-error Compiler limitation, see comment above.
				const _constructedEmpty = new GenericContainer({ content: undefined });
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

	// Type tests for unannotate utilities
	{
		// UnannotateImplicitFieldSchema
		{
			type T = ImplicitAnnotatedFieldSchema;
			type _check = requireAssignableTo<UnannotateImplicitFieldSchema<T>, ImplicitFieldSchema>;
		}
	}
});
