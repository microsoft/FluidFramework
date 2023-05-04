/* eslint-disable @typescript-eslint/consistent-type-definitions */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import {
	ApiMode,
	NodeDataFor,
	AllowedTypesToTypedTrees,
	TypedNode,
	EditableField,
	TypedField,
	TypeArrayToTypedTreeArray,
	TypedFields,
	UnbrandedName,
} from "../../../feature-libraries/schema-aware/schemaAware";

import { TreeSchemaIdentifier, ValueSchema } from "../../../core";
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
} from "../../../feature-libraries";
import { FlexList, TypedSchema } from "../../../feature-libraries/modular-schema";
import { FlexListToNonLazyArray } from "../../../feature-libraries/modular-schema/typedSchema";
import { SimpleNodeDataFor } from "./schemaAwareSimple";

// Test UnbrandedName
{
	type BrandedName = "X" & TreeSchemaIdentifier;
	type Unbranded = UnbrandedName<BrandedName>;
	type _check = requireTrue<areSafelyAssignable<Unbranded, "X">>;
}

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;

// Example Schema:
const builder = new SchemaBuilder("Schema Aware tests");

// Declare a simple type which just holds a number.
const numberSchema = builder.primitive("number", ValueSchema.Number);

// Check the various ways to refer to child types produce the same results
{
	const numberField1 = SchemaBuilder.field(value, numberSchema);
	const numberField2 = SchemaBuilder.fieldValue(numberSchema);
	const numberField3 = SchemaBuilder.fieldRecursive(value, numberSchema);
	type check1_ = requireAssignableTo<typeof numberField1, typeof numberField2>;
	type check2_ = requireAssignableTo<typeof numberField2, typeof numberField3>;
	type check3_ = requireAssignableTo<typeof numberField3, typeof numberField1>;

	const numberFieldLazy = SchemaBuilder.field(value, () => numberSchema);
	type NonLazy = FlexListToNonLazyArray<typeof numberFieldLazy.allowedTypes>;
	type check4_ = requireAssignableTo<NonLazy, typeof numberField1.allowedTypes>;
}

// Simple object
{
	const simpleObject = builder.object("simple", {
		local: {
			x: SchemaBuilder.fieldValue(numberSchema),
		},
	});
}

const ballSchema = builder.object("ball", {
	local: {
		// Test schema objects in as well as lazy functions
		x: SchemaBuilder.fieldValue(numberSchema),
		y: SchemaBuilder.fieldValue(() => numberSchema),
		size: SchemaBuilder.fieldOptional(numberSchema),
	},
});

// Recursive case:
const boxSchema = builder.objectRecursive("box", {
	local: {
		children: SchemaBuilder.fieldRecursive(sequence, ballSchema, () => boxSchema),
	},
});

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof boxSchema, TreeSchema>;
}

type x = typeof numberSchema.name;
const schemaData = builder.intoLibrary();

// Example Use:
type BallTreeX = TypedNode<typeof ballSchema, ApiMode.Flexible>;
type BallTree = NodeDataFor<ApiMode.Flexible, typeof ballSchema>;

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
	type XField = typeof ballSchema["localFieldsObject"]["x"];
	type XMultiplicity = XField["kind"]["multiplicity"];
	type XContent = TypedField<ApiMode.Simple, XField>;
	type XChild = XField["allowedTypes"];
	type _check = requireAssignableTo<XContent, number>;
}

// @ts-expect-error Wrong type
const nError1: NumberTree = { [typeNameSymbol]: ballSchema.name, [valueSymbol]: 5 };

{
	// A concrete example for the "x" field:
	type BallXFieldInfo = typeof ballSchema.localFieldsObject.x;
	type BallXFieldTypes = BallXFieldInfo["allowedTypes"];
	type check_ = requireAssignableTo<BallXFieldTypes, [typeof numberSchema]>;

	type Child = AllowedTypesToTypedTrees<ApiMode.Flexible, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = AllowedTypesToTypedTrees<ApiMode.Flexible, [typeof numberSchema]>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;
}

interface TypeBuilder<TSchema extends TreeSchema> {
	a: NodeDataFor<ApiMode.Flexible, TSchema>;
	b: NodeDataFor<ApiMode.Editable, TSchema>;
	c: NodeDataFor<ApiMode.Simple, TSchema>;
}

type FlexNumber =
	| number
	| {
			[typeNameSymbol]?: "number";
			[valueSymbol]: number;
	  };

// Test terminal cases:
{
	type F = TypeBuilder<typeof numberSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];
	type _check1 = requireTrue<areSafelyAssignable<XA, FlexNumber>>;
	type _check2 = requireTrue<areSafelyAssignable<XB, number>>;
	type _check3 = requireTrue<areSafelyAssignable<XC, number>>;
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
	type F = TypeBuilder<typeof ballSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];
	type _check1 = requireTrue<areSafelyAssignable<XA, FlexBall>>;
	// type _check2 = requireTrue<areSafelyAssignable<XB, EditableBall>>;
	type _check3 = requireTrue<areSafelyAssignable<XC, SimpleBall>>;
}

// Test polymorphic cases:
{
	const builder2 = new SchemaBuilder("Schema Aware polymorphic");
	const bool = builder2.primitive("bool", ValueSchema.Boolean);
	const str = builder2.primitive("str", ValueSchema.String);
	const parentField = SchemaBuilder.fieldValue(str, bool);
	const parent = builder2.object("parent", { local: { child: parentField } });

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

	// Check child handling
	{
		type ChildSchema = typeof parentField;
		type ChildSchemaTypes = ChildSchema extends FieldSchema<any, infer Types> ? Types : never;
		type AllowedChildTypes = ChildSchema["allowedTypes"];
		type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
		type BoolChild = ChildSchemaTypes[1];
		type _check3 = requireAssignableTo<ChildSchemaTypes, AllowedTypes>;
		type _check4 = requireAssignableTo<ChildSchemaTypes, FlexList<TreeSchema>>;
		type NormalizedChildSchemaTypes = FlexListToNonLazyArray<ChildSchemaTypes>;
		type ChildTypes = AllowedTypesToTypedTrees<ApiMode.Flexible, ChildSchemaTypes>;
		type _check5 = requireAssignableTo<FlexBool, ChildTypes>;
		type _check6 = requireAssignableTo<FlexStr, ChildTypes>;
		type _check7 = requireAssignableTo<ChildTypes, FlexBool | FlexStr>;
		type Field = TypedField<ApiMode.Flexible, ChildSchema>;
	}

	{
		type F = TypeBuilder<typeof parent>;
		type XA = F["a"];
		type XB = F["b"];
		type XC = F["c"];
		type _check1 = requireTrue<areSafelyAssignable<XA, FlexParent>>;
		// type _check2 = requireTrue<areSafelyAssignable<XB, EditableParent>>;
		// type _check3 = requireTrue<areSafelyAssignable<XC, SimpleParent>>;
	}
}

// Test simple recursive cases:
{
	const builder2 = new SchemaBuilder("Schema Aware recursive");
	const rec = builder2.objectRecursive("rec", {
		local: { x: SchemaBuilder.fieldRecursive(optional, () => rec) },
	});

	type RecObjectSchema = typeof rec;
	type RecFieldSchema = typeof rec.localFieldsObject.x;

	{
		// Recursive objects don't get this type checking automatically, so confirm it
		type _check1 = requireAssignableTo<RecObjectSchema, TreeSchema>;
		type _check2 = requireAssignableTo<RecFieldSchema, FieldSchema>;
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

		type F = TypeBuilder<typeof rec>;
		type Flexible = NodeDataFor<ApiMode.Flexible, typeof rec>;
		type Edit = NodeDataFor<ApiMode.Editable, typeof rec>;
		type Simple = NodeDataFor<ApiMode.Simple, typeof rec>;
		type Simple2 = SimpleNodeDataFor<typeof rec>;

		// Check Simple's field type unit tests
		{
			type ChildTree = AllowedTypesToTypedTrees<
				ApiMode.Simple,
				RecFieldSchema["allowedTypes"]
			>;
			type SimpleField = TypedField<ApiMode.Simple, RecFieldSchema>;
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
	type F = TypeBuilder<typeof boxSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];

	interface FlexBox {
		[typeNameSymbol]?: "box";
		children: (FlexBall | FlexBox)[];
	}

	// Check child handling
	{
		type ChildSchema = typeof boxSchema.localFieldsObject.children;
		type ChildSchemaTypes = ChildSchema extends FieldSchema<any, infer Types> ? Types : never;
		type AllowedChildTypes = ChildSchema["allowedTypes"];
		type _check = requireAssignableTo<ChildSchemaTypes, AllowedChildTypes>;
		type BoxChild = ChildSchemaTypes[1];
		type _check3 = requireAssignableTo<ChildSchemaTypes, AllowedTypes>;
		type _check4 = requireAssignableTo<ChildSchemaTypes, FlexList<TreeSchema>>;
		type NormalizedChildSchemaTypes = FlexListToNonLazyArray<ChildSchemaTypes>;
		type ChildTypeArray = TypeArrayToTypedTreeArray<
			ApiMode.Flexible,
			TypedSchema.FlexListToNonLazyArray<ChildSchemaTypes>
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
					typeof boxSchema.localFieldsObject
				>;

				type BoxChildTypeField = TypedField<
					ApiMode.Flexible,
					typeof boxSchema.localFieldsObject.children
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
		type Field = TypedField<ApiMode.Flexible, ChildSchema>;
	}

	type _check1 = requireTrue<areSafelyAssignable<XA, FlexBox>>;
	interface NormalizedBox extends UntypedTreeCore {
		[typeNameSymbol]: typeof boxSchema.name;
		children: EditableField<EditableBall | NormalizedBox>;
	}
	type _check2 = requireAssignableTo<XB, NormalizedBox>;

	{
		const child: XA = {
			children: [],
		};
		const parent: XA = {
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
		const child: XC = {
			[typeNameSymbol]: boxSchema.name,
			children: [],
		};
		const parent: XC = {
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
