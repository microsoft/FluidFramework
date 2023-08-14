/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file replicates a lot of generated types manually for test comparisons.
// Since "type" and "interface" type check slightly different, this file needs to create types when the linter recommends interfaces.
/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { strict as assert } from "assert";
import {
	ApiMode,
	AllowedTypesToTypedTrees,
	TypedNode,
	EditableField,
	TypedField,
	TypeArrayToTypedTreeArray,
	TypedFields,
	UnbrandedName,
	downCast,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-aware/schemaAware";

import { AllowedUpdateType, TreeSchemaIdentifier, ValueSchema } from "../../../core";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../../util";
import {
	valueSymbol,
	FieldKinds,
	typeNameSymbol,
	ContextuallyTypedNodeDataObject,
	UntypedTreeCore,
	SchemaBuilder,
	TreeSchema,
	FieldSchema,
	AllowedTypes,
	InternalTypedSchemaTypes,
	isEditableTree,
} from "../../../feature-libraries";
import { createSharedTreeView } from "../../../shared-tree";
import { SimpleNodeDataFor } from "./schemaAwareSimple";

// Test UnbrandedName
{
	type BrandedName = "X" & TreeSchemaIdentifier;
	type Unbranded = UnbrandedName<BrandedName>;
	type _check = requireTrue<areSafelyAssignable<Unbranded, "X">>;
}

{
	// Aliases for conciseness
	const { optional, value, sequence } = FieldKinds;

	// Example Schema:
	const builder = new SchemaBuilder("Schema Aware tests");

	// Declare a simple type which just holds a number.
	const numberSchema = builder.leaf("number", ValueSchema.Number);

	// Check the various ways to refer to child types produce the same results
	{
		const numberField1 = SchemaBuilder.field(value, numberSchema);
		const numberField2 = SchemaBuilder.fieldValue(numberSchema);
		const numberField3 = SchemaBuilder.fieldRecursive(value, numberSchema);
		type check1_ = requireAssignableTo<typeof numberField1, typeof numberField2>;
		type check2_ = requireAssignableTo<typeof numberField2, typeof numberField3>;
		type check3_ = requireAssignableTo<typeof numberField3, typeof numberField1>;

		const numberFieldLazy = SchemaBuilder.field(value, () => numberSchema);
		type NonLazy = InternalTypedSchemaTypes.FlexListToNonLazyArray<
			typeof numberFieldLazy.allowedTypes
		>;
		type check4_ = requireAssignableTo<NonLazy, typeof numberField1.allowedTypes>;
	}

	// Simple object
	{
		const simpleObject = builder.struct("simple", {
			x: SchemaBuilder.fieldValue(numberSchema),
		});
	}

	const ballSchema = builder.struct("ball", {
		// Test schema objects in as well as lazy functions
		x: SchemaBuilder.fieldValue(numberSchema),
		y: SchemaBuilder.fieldValue(() => numberSchema),
		size: SchemaBuilder.fieldOptional(numberSchema),
	});

	// Recursive case:
	const boxSchema = builder.structRecursive("box", {
		children: SchemaBuilder.fieldRecursive(sequence, ballSchema, () => boxSchema),
	});

	{
		// Recursive objects don't get this type checking automatically, so confirm it
		type _check = requireAssignableTo<typeof boxSchema, TreeSchema>;
	}

	type x = typeof numberSchema.name;
	const schemaData = builder.intoLibrary();

	// Example Use:
	type BallTree = TypedNode<typeof ballSchema, ApiMode.Flexible>;

	{
		type check1_ = requireAssignableTo<BallTree, ContextuallyTypedNodeDataObject>;
	}

	// We can also get the type for the "number" nodes.
	type NumberTree = TypedNode<typeof numberSchema, ApiMode.Flexible>;

	const n1: NumberTree = 5;
	const n2: NumberTree = { [valueSymbol]: 5 };
	const n3: NumberTree = { [typeNameSymbol]: numberSchema.name, [valueSymbol]: 5 };
	const n4: NumberTree = { [typeNameSymbol]: "number", [valueSymbol]: 5 };

	const b1: BallTree = { x: 1, y: 2, size: 10 };
	const b1x: BallTree = { x: 1, y: 2, size: undefined }; // TODO: restore ability to omit optional fields.
	const b2: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: 2, size: undefined };
	const b4: BallTree = { [typeNameSymbol]: "ball", x: 1, y: n3, size: undefined };
	const b6: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: n3, size: undefined };

	// This is type safe, so we can only access fields that are in the schema.
	// @ts-expect-error This is an error since it accesses an invalid field.
	const b5: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, z: n3 };

	// @ts-expect-error Missing required field
	const b7: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1 };

	{
		type XField = typeof ballSchema["structFieldsObject"]["x"];
		type XMultiplicity = XField["kind"]["multiplicity"];
		type XContent = TypedField<XField, ApiMode.Simple>;
		type XChild = XField["allowedTypes"];
		type _check = requireAssignableTo<XContent, number>;
	}

	// @ts-expect-error Wrong type
	const nError1: NumberTree = { [typeNameSymbol]: ballSchema.name, [valueSymbol]: 5 };

	{
		// A concrete example for the "x" field:
		type BallXFieldInfo = typeof ballSchema.structFieldsObject.x;
		type BallXFieldTypes = BallXFieldInfo["allowedTypes"];
		type check_ = requireAssignableTo<BallXFieldTypes, [typeof numberSchema]>;

		type Child = AllowedTypesToTypedTrees<ApiMode.Flexible, BallXFieldTypes>;

		type check3_ = requireAssignableTo<Child, NumberTree>;
		type check4_ = requireAssignableTo<NumberTree, Child>;
		type Child2 = AllowedTypesToTypedTrees<ApiMode.Flexible, [typeof numberSchema]>;

		type check3x_ = requireAssignableTo<Child2, NumberTree>;
		type check4x_ = requireAssignableTo<NumberTree, Child2>;
	}

	type FlexNumber =
		| number
		| {
				[typeNameSymbol]?: "number";
				[valueSymbol]: number;
		  };

	// Test terminal cases:
	{
		type F = TypedNode<typeof numberSchema, ApiMode.Flexible>;
		type E = TypedNode<typeof numberSchema>;
		type Eu = TypedNode<typeof numberSchema, ApiMode.EditableUnwrapped>;
		type S = TypedNode<typeof numberSchema, ApiMode.Simple>;
		type _check1 = requireTrue<areSafelyAssignable<F, FlexNumber>>;
		type _check2 = requireAssignableTo<E, UntypedTreeCore>;
		type _check3 = requireTrue<areSafelyAssignable<Eu, number>>;
		type _check4 = requireTrue<areSafelyAssignable<S, number>>;
	}

	interface FlexBall {
		[typeNameSymbol]?: "ball";
		x: FlexNumber;
		y: FlexNumber;
		size: FlexNumber | undefined;
	}

	interface EditableBall extends UntypedTreeCore {
		[typeNameSymbol]: typeof ballSchema.name;
		x: number;
		y: number;
		size: number | undefined;
	}

	// This type type checks differently if its an interface, which breaks.
	type SimpleBall = {
		[typeNameSymbol]?: "ball";
		x: number;
		y: number;
		size: number | undefined;
	};

	// Test non recursive cases:
	{
		type F = TypedNode<typeof ballSchema, ApiMode.Flexible>;
		type E = TypedNode<typeof ballSchema>;
		type Eu = TypedNode<typeof ballSchema, ApiMode.EditableUnwrapped>;
		type S = TypedNode<typeof ballSchema, ApiMode.Simple>;
		type _check1 = requireTrue<areSafelyAssignable<F, FlexBall>>;
		type _check2 = requireAssignableTo<E, SimpleBall & UntypedTreeCore>;
		type _check3 = requireAssignableTo<Eu, SimpleBall & UntypedTreeCore>;
		type _check4 = requireTrue<areSafelyAssignable<S, SimpleBall>>;
		type _check5 = requireTrue<areSafelyAssignable<Eu, E>>;
	}

	// Test polymorphic cases:
	{
		const builder2 = new SchemaBuilder("Schema Aware polymorphic");
		const bool = builder2.leaf("bool", ValueSchema.Boolean);
		const str = builder2.leaf("str", ValueSchema.String);
		const parentField = SchemaBuilder.fieldValue(str, bool);
		const parent = builder2.struct("parent", { child: parentField });

		type FlexBool =
			| boolean
			| {
					[typeNameSymbol]?: "bool";
					[valueSymbol]: boolean;
			  };

		type FlexStr =
			| string
			| {
					[typeNameSymbol]?: "str";
					[valueSymbol]: string;
			  };
		interface FlexParent {
			[typeNameSymbol]?: "parent";
			child: FlexBool | FlexStr;
		}

		interface SimpleParent {
			[typeNameSymbol]?: "parent";
			child: boolean | string;
		}

		// Check child handling
		{
			type ChildSchema = typeof parentField;
			type ChildSchemaTypes = ChildSchema extends FieldSchema<any, infer Types>
				? Types
				: never;
			type AllowedChildTypes = ChildSchema["allowedTypes"];
			type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
			type BoolChild = ChildSchemaTypes[1];
			type _check3 = requireAssignableTo<ChildSchemaTypes, AllowedTypes>;
			type _check4 = requireAssignableTo<
				ChildSchemaTypes,
				InternalTypedSchemaTypes.FlexList<TreeSchema>
			>;
			type NormalizedChildSchemaTypes =
				InternalTypedSchemaTypes.FlexListToNonLazyArray<ChildSchemaTypes>;
			type ChildTypes = AllowedTypesToTypedTrees<ApiMode.Flexible, ChildSchemaTypes>;
			type _check5 = requireAssignableTo<FlexBool, ChildTypes>;
			type _check6 = requireAssignableTo<FlexStr, ChildTypes>;
			type _check7 = requireAssignableTo<ChildTypes, FlexBool | FlexStr>;
			type Field = TypedField<ChildSchema, ApiMode.Flexible>;
		}

		{
			type F = TypedNode<typeof parent, ApiMode.Flexible>;
			type E = TypedNode<typeof parent>;
			type Eu = TypedNode<typeof parent, ApiMode.EditableUnwrapped>;
			type S = TypedNode<typeof parent, ApiMode.Simple>;
			type _check1 = requireTrue<areSafelyAssignable<F, FlexParent>>;
			type _check2 = requireAssignableTo<E, SimpleParent & UntypedTreeCore>;
			type _check3 = requireAssignableTo<Eu, SimpleParent & UntypedTreeCore>;
			type _check4 = requireTrue<areSafelyAssignable<S, SimpleParent>>;
			type _check5 = requireTrue<areSafelyAssignable<Eu, E>>;
		}
	}

	// Test simple recursive cases:
	{
		const builder2 = new SchemaBuilder("Schema Aware recursive");
		const rec = builder2.structRecursive("rec", {
			x: SchemaBuilder.fieldRecursive(optional, () => rec),
		});

		type RecObjectSchema = typeof rec;
		type RecFieldSchema = typeof rec.structFieldsObject.x;

		{
			// Recursive objects don't get this type checking automatically, so confirm it
			type _check1 = requireAssignableTo<RecObjectSchema, TreeSchema>;
			type _check2 = requireAssignableTo<RecFieldSchema, FieldSchema>;
		}

		// Confirm schema's recursive type is correct.
		{
			type Allowed = RecFieldSchema["allowedTypes"];
			type AllowedNonLazy = InternalTypedSchemaTypes.FlexListToNonLazyArray<Allowed>[0];
			type _check1 = requireTrue<areSafelyAssignable<AllowedNonLazy, RecObjectSchema>>;
		}

		// Check generated schema aware types
		{
			type ExpectedFlexible = {
				[typeNameSymbol]?: "rec";
				x: ExpectedFlexible | undefined;
			};

			type ExpectedSimple = {
				[typeNameSymbol]?: "rec";
				x: ExpectedSimple | undefined;
			};

			type ExpectedSimple2 = {
				x: ExpectedSimple2 | undefined;
			};

			type Flexible = TypedNode<typeof rec, ApiMode.Flexible>;
			type Edit = TypedNode<typeof rec>;
			type Simple = TypedNode<typeof rec, ApiMode.Simple>;
			type Simple2 = SimpleNodeDataFor<typeof rec>;

			// Check Simple's field type unit tests
			{
				type ChildTree = AllowedTypesToTypedTrees<
					ApiMode.Simple,
					RecFieldSchema["allowedTypes"]
				>;
				type SimpleField = TypedField<RecFieldSchema, ApiMode.Simple>;
			}

			// Overall integration tests
			type _check1a = requireAssignableTo<Flexible, ExpectedFlexible>;
			const _check1c: ExpectedFlexible = 0 as unknown as Flexible;
			type _check1b = requireAssignableTo<ExpectedFlexible, Flexible>;
			type _check1 = requireTrue<areSafelyAssignable<Flexible, ExpectedFlexible>>;
			// type _check2 = requireTrue<areSafelyAssignable<XB, EditableParent>>;
			type _check3 = requireTrue<areSafelyAssignable<Simple, ExpectedSimple>>;
			type _check4 = requireTrue<areSafelyAssignable<Simple2, ExpectedSimple2>>;
		}
	}

	// Test recursive cases:
	{
		type F = TypedNode<typeof boxSchema, ApiMode.Flexible>;
		type E = TypedNode<typeof boxSchema>;
		type Eu = TypedNode<typeof boxSchema, ApiMode.EditableUnwrapped>;
		type S = TypedNode<typeof boxSchema, ApiMode.Simple>;

		interface FlexBox {
			[typeNameSymbol]?: "box";
			children: (FlexBall | FlexBox)[];
		}

		// Check child handling
		{
			type ChildSchema = typeof boxSchema.structFieldsObject.children;
			type ChildSchemaTypes = ChildSchema extends FieldSchema<any, infer Types>
				? Types
				: never;
			type AllowedChildTypes = ChildSchema["allowedTypes"];
			type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
			type BoxChild = ChildSchemaTypes[1];
			type _check3 = requireAssignableTo<ChildSchemaTypes, AllowedTypes>;
			type _check4 = requireAssignableTo<
				ChildSchemaTypes,
				InternalTypedSchemaTypes.FlexList<TreeSchema>
			>;
			type NormalizedChildSchemaTypes =
				InternalTypedSchemaTypes.FlexListToNonLazyArray<ChildSchemaTypes>;
			type ChildTypeArray = TypeArrayToTypedTreeArray<
				ApiMode.Flexible,
				InternalTypedSchemaTypes.FlexListToNonLazyArray<ChildSchemaTypes>
			>;
			{
				type _check5 = requireAssignableTo<FlexBox, ChildTypeArray[1]>;
				type _check6 = requireAssignableTo<FlexBall, ChildTypeArray[0]>;
				type _check7 = requireAssignableTo<ChildTypeArray[1], FlexBox>;
				{
					// Should be the same as FlexBox
					type BoxChildType = ChildTypeArray[1];
					type BoxChildType2 = TypeArrayToTypedTreeArray<
						ApiMode.Flexible,
						[typeof boxSchema]
					>[0];
					type BoxChildType3 = TypedNode<typeof boxSchema, ApiMode.Flexible>;

					type BoxChildTypeFields = TypedFields<
						ApiMode.Flexible,
						typeof boxSchema.structFieldsObject
					>;

					type BoxChildTypeField = TypedField<
						typeof boxSchema.structFieldsObject.children,
						ApiMode.Flexible
					>;
				}
				type _check8 = requireAssignableTo<ChildTypeArray[0], FlexBall>;
			}
			type ChildTypes = AllowedTypesToTypedTrees<ApiMode.Flexible, ChildSchemaTypes>;
			{
				type _check5 = requireAssignableTo<FlexBox, ChildTypes>;
				type _check6 = requireAssignableTo<FlexBall, ChildTypes>;
				type _check7 = requireAssignableTo<ChildTypes, FlexBall | FlexBox>;
			}
			type Field = TypedField<ChildSchema, ApiMode.Flexible>;
		}

		type _check1 = requireTrue<areSafelyAssignable<F, FlexBox>>;
		interface NormalizedBox extends UntypedTreeCore {
			[typeNameSymbol]: typeof boxSchema.name;
			children: EditableField<EditableBall | NormalizedBox>;
		}
		type _check2 = requireAssignableTo<E, NormalizedBox>;

		{
			const child: F = {
				children: [],
			};
			const parent: F = {
				children: [
					child,
					{
						// TODO: this should be required to disambiguate but currently its not.
						[typeNameSymbol]: ballSchema.name,
						x: 1,
						y: { [typeNameSymbol]: numberSchema.name, [valueSymbol]: 2 },
						size: undefined,
					},
				],
			};
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

describe("SchemaAware Editing", () => {
	it("Use a sequence field", () => {
		const builder = new SchemaBuilder("SchemaAware");
		const stringSchema = builder.leaf("string", ValueSchema.String);
		const rootNodeSchema = builder.struct("Test", {
			children: SchemaBuilder.fieldSequence(stringSchema),
		});
		const schema = builder.intoDocumentSchema(
			SchemaBuilder.field(FieldKinds.value, rootNodeSchema),
		);
		const view = createSharedTreeView().schematize({
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: { children: [] },
		});
		const root = view.root;
		assert(isEditableTree(root));
		assert(downCast(rootNodeSchema, root));
		const field = root.children;
		assert.deepEqual([...field], []);

		field.insertNodes(0, ["foo", "bar"]);
		assert.deepEqual([...field], ["foo", "bar"]);
		field.moveNodes(0, 1, 1);
		assert.deepEqual([...field], ["bar", "foo"]);
		field.remove();
		assert.deepEqual([...field], []);
	});
});
