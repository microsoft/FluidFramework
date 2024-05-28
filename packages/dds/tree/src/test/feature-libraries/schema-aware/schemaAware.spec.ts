/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file replicates a lot of generated types manually for test comparisons.
// Since "type" and "interface" type check slightly different, this file needs to create types when the linter recommends interfaces.
/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { TreeNodeSchemaIdentifier } from "../../../core/index.js";
import { SchemaBuilder, leaf } from "../../../domains/index.js";
import {
	ContextuallyTypedNodeDataObject,
	FieldKinds,
	FlexAllowedTypes,
	FlexFieldSchema,
	FlexTreeNodeSchema,
	typeNameSymbol,
	valueSymbol,
	type FlexFieldKind,
} from "../../../feature-libraries/index.js";
import {
	AllowedTypesToFlexInsertableTree,
	InsertableFlexField,
	InsertableFlexNode,
	TypedFields,
	UnbrandedName,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-aware/schemaAware.js";
import {
	FlexList,
	FlexListToNonLazyArray,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/flexList.js";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../../util/index.js";

// Test UnbrandedName
{
	type BrandedName = TreeNodeSchemaIdentifier<"X">;
	type Unbranded = UnbrandedName<BrandedName>;
	type _check = requireTrue<areSafelyAssignable<Unbranded, "X">>;
}

{
	// Aliases for conciseness
	const { optional, required, sequence } = FieldKinds;

	// Example Schema:
	const builder = new SchemaBuilder({ scope: "SchemaAwareTests" });

	// Declare a simple type which just holds a number.
	const numberSchema = leaf.number;

	// Check the various ways to refer to child types produce the same results
	{
		const numberField1 = FlexFieldSchema.create(required, [numberSchema]);
		const numberField2 = SchemaBuilder.required(numberSchema);
		const numberField3 = FlexFieldSchema.createUnsafe(required, [numberSchema]);
		type check1_ = requireAssignableTo<typeof numberField1, typeof numberField2>;
		type check2_ = requireAssignableTo<typeof numberField2, typeof numberField3>;
		type check3_ = requireAssignableTo<typeof numberField3, typeof numberField1>;

		const numberFieldLazy = FlexFieldSchema.create(required, [() => numberSchema]);
		type NonLazy = FlexListToNonLazyArray<typeof numberFieldLazy.allowedTypes>;
		type check4_ = requireAssignableTo<NonLazy, typeof numberField1.allowedTypes>;
	}

	// Simple object
	{
		const simpleObject = builder.object("simple", {
			x: builder.required(numberSchema),
		});
	}

	const ballSchema = builder.object("ball", {
		// Test schema objects in as well as lazy functions
		x: numberSchema,
		y: [() => numberSchema],
		size: builder.optional(numberSchema),
	});

	// Recursive case:
	const boxSchema = builder.objectRecursive("box", {
		children: FlexFieldSchema.createUnsafe(sequence, [ballSchema, () => boxSchema]),
	});

	{
		// Recursive objects don't get this type checking automatically, so confirm it
		type _check = requireAssignableTo<typeof boxSchema, FlexTreeNodeSchema>;
	}

	type x = typeof numberSchema.name;
	const schemaData = builder.intoLibrary();

	// Example Use:
	type BallTree = InsertableFlexNode<typeof ballSchema>;

	{
		type check1_ = requireAssignableTo<BallTree, ContextuallyTypedNodeDataObject>;
	}

	// We can also get the type for the "number" nodes.
	type NumberTree = InsertableFlexNode<typeof numberSchema>;

	const n1: NumberTree = 5;

	const b1: BallTree = { x: 1, y: 2, size: 10 };
	const b1x: BallTree = { x: 1, y: 2, size: undefined }; // TODO: restore ability to omit optional fields.
	const b2: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: 2, size: undefined };
	const b4: BallTree = {
		[typeNameSymbol]: "SchemaAwareTests.ball",
		x: 1,
		y: 5,
		size: undefined,
	};
	const b6: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: 5, size: undefined };

	// This is type safe, so we can only access fields that are in the schema.
	// @ts-expect-error This is an error since it accesses an invalid field.
	const b5: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, z: 5 };

	// @ts-expect-error Missing required field
	const b7: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1 };

	{
		type XField = (typeof ballSchema)["objectNodeFieldsObject"]["x"];
		type XMultiplicity = XField["kind"]["multiplicity"];
		type XContent = InsertableFlexField<XField>;
		type XChild = XField["allowedTypes"];
		type _check = requireAssignableTo<XContent, number>;
	}

	// @ts-expect-error Wrong type
	const nError1: NumberTree = { [typeNameSymbol]: ballSchema.name, [valueSymbol]: 5 };

	{
		// A concrete example for the "x" field:
		type BallXFieldInfo = typeof ballSchema.objectNodeFieldsObject.x;
		type BallXFieldTypes = BallXFieldInfo["allowedTypes"];
		type check_ = requireAssignableTo<BallXFieldTypes, readonly [typeof numberSchema]>;

		type Child = AllowedTypesToFlexInsertableTree<BallXFieldTypes>;

		type check3_ = requireAssignableTo<Child, NumberTree>;
		type check4_ = requireAssignableTo<NumberTree, Child>;
		type Child2 = AllowedTypesToFlexInsertableTree<[typeof numberSchema]>;

		type check3x_ = requireAssignableTo<Child2, NumberTree>;
		type check4x_ = requireAssignableTo<NumberTree, Child2>;
	}

	type FlexNumber =
		| number
		| {
				[typeNameSymbol]?: "com.fluidframework.leaf.number";
				[valueSymbol]: number;
		  };

	// Test terminal cases:
	{
		type S = InsertableFlexNode<typeof numberSchema>;
		type _check4 = requireTrue<areSafelyAssignable<S, number>>;
	}

	interface FlexBall {
		[typeNameSymbol]?: "SchemaAwareTests.ball";
		x: FlexNumber;
		y: FlexNumber;
		size: FlexNumber | undefined;
	}

	interface EditableBall {
		[typeNameSymbol]: typeof ballSchema.name;
		x: number;
		y: number;
		size: number | undefined;
	}

	// This type type checks differently if its an interface, which breaks.
	type SimpleBall = {
		[typeNameSymbol]?: "SchemaAwareTests.ball";
		x: number;
		y: number;
		size: number | undefined;
	};

	// Test non recursive cases:
	{
		type S = InsertableFlexNode<typeof ballSchema>;
		type _check4 = requireTrue<areSafelyAssignable<S, SimpleBall>>;
	}

	// Test polymorphic cases:
	{
		const builder2 = new SchemaBuilder({ scope: "SchemaAwarePolymorphicTest" });
		const bool = leaf.boolean;
		const str = leaf.string;
		const parentField = SchemaBuilder.required([str, bool]);
		const parent = builder2.object("parent", { child: parentField });

		interface SimpleParent {
			[typeNameSymbol]?: "SchemaAwarePolymorphicTest.parent";
			child: boolean | string;
		}

		// Check child handling
		{
			type ChildSchema = typeof parentField;
			type ChildSchemaTypes = ChildSchema extends FlexFieldSchema<FlexFieldKind, infer Types>
				? Types
				: never;
			type AllowedChildTypes = ChildSchema["allowedTypes"];
			type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
			type BoolChild = ChildSchemaTypes[1];
			type _check3 = requireAssignableTo<ChildSchemaTypes, FlexAllowedTypes>;
			type _check4 = requireAssignableTo<ChildSchemaTypes, FlexList<FlexTreeNodeSchema>>;
			type NormalizedChildSchemaTypes = FlexListToNonLazyArray<ChildSchemaTypes>;
			type ChildTypes = AllowedTypesToFlexInsertableTree<ChildSchemaTypes>;
		}

		{
			type S = InsertableFlexNode<typeof parent>;
			type _check4 = requireTrue<areSafelyAssignable<S, SimpleParent>>;
		}
	}

	// Test simple recursive cases:
	{
		const builder2 = new SchemaBuilder({ scope: "SchemaAwareRecursiveTest" });
		const rec = builder2.objectRecursive("rec", {
			x: FlexFieldSchema.createUnsafe(optional, [() => rec]),
		});

		type RecObjectSchema = typeof rec;
		type RecFieldSchema = typeof rec.objectNodeFieldsObject.x;

		{
			// Recursive objects don't get this type checking automatically, so confirm it
			type _check1 = requireAssignableTo<RecObjectSchema, FlexTreeNodeSchema>;
			type _check2 = requireAssignableTo<RecFieldSchema, FlexFieldSchema>;
		}

		// Confirm schema's recursive type is correct.
		{
			type Allowed = RecFieldSchema["allowedTypes"];
			type AllowedNonLazy = FlexListToNonLazyArray<Allowed>[0];
			type _check1 = requireTrue<areSafelyAssignable<AllowedNonLazy, RecObjectSchema>>;
		}

		// Check generated schema aware types
		{
			type ExpectedFlexible = {
				[typeNameSymbol]?: "SchemaAwareRecursiveTest.rec";
				x: ExpectedFlexible | undefined;
			};

			type ExpectedSimple = {
				[typeNameSymbol]?: "SchemaAwareRecursiveTest.rec";
				x: ExpectedSimple | undefined;
			};

			type ExpectedSimple2 = {
				x: ExpectedSimple2 | undefined;
			};

			type Simple = InsertableFlexNode<typeof rec>;

			// Check Simple's field type unit tests
			{
				type ChildTree = AllowedTypesToFlexInsertableTree<RecFieldSchema["allowedTypes"]>;
				type SimpleField = InsertableFlexField<RecFieldSchema>;
			}

			// Overall integration tests
			// type _check2 = requireTrue<areSafelyAssignable<XB, EditableParent>>;
			type _check3 = requireTrue<areSafelyAssignable<Simple, ExpectedSimple>>;
		}
	}

	// Test recursive cases:
	{
		type S = InsertableFlexNode<typeof boxSchema>;

		interface FlexBox {
			[typeNameSymbol]?: "SchemaAwareTests.box";
			children: (FlexBall | FlexBox)[];
		}

		// Check child handling
		{
			type ChildSchema = typeof boxSchema.objectNodeFieldsObject.children;
			type ChildSchemaTypes = ChildSchema extends FlexFieldSchema<FlexFieldKind, infer Types>
				? Types
				: never;
			type AllowedChildTypes = ChildSchema["allowedTypes"];
			type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
			type BoxChild = ChildSchemaTypes[1];
			type _check3 = requireAssignableTo<ChildSchemaTypes, FlexAllowedTypes>;
			type _check4 = requireAssignableTo<ChildSchemaTypes, FlexList<FlexTreeNodeSchema>>;
			type NormalizedChildSchemaTypes = FlexListToNonLazyArray<ChildSchemaTypes>;
			{
				{
					// Should be the same as FlexBox
					type BoxChildType3 = InsertableFlexNode<typeof boxSchema>;

					type BoxChildTypeFields = TypedFields<typeof boxSchema.objectNodeFieldsObject>;

					type BoxChildTypeField = InsertableFlexField<
						typeof boxSchema.objectNodeFieldsObject.children
					>;
				}
			}
			type ChildTypes = AllowedTypesToFlexInsertableTree<ChildSchemaTypes>;
			type Field = InsertableFlexField<ChildSchema>;
		}

		{
			const child: S = {
				[typeNameSymbol]: boxSchema.name,
				children: [],
			};
			const parent: S = {
				[typeNameSymbol]: boxSchema.name,
				children: [
					child,
					{
						[typeNameSymbol]: ballSchema.name,
						x: 1,
						y: 2,
						size: undefined,
					},
				],
			};
		}
	}
}
