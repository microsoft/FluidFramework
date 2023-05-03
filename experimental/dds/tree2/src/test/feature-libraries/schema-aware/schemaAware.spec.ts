/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiMode,
	NodeDataFor,
	TypeSetToTypedTrees,
	TypedNode,
	EditableField,
	TypedField,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/schema-aware/schemaAware";

import { TreeSchemaIdentifier, ValueSchema } from "../../../core";
import { areSafelyAssignable, brand, requireAssignableTo, requireTrue } from "../../../util";
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
import {
	FlattenKeys,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/typedSchema/typeUtils";
import { FlexList } from "../../../feature-libraries/modular-schema";
import { FlexListToNonLazyArray } from "../../../feature-libraries/modular-schema/typedSchema";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;

// Example Schema:
const builder = new SchemaBuilder("Schema Aware tests");

// Declare a simple type which just holds a number.
const numberSchema = builder.primitive("number", ValueSchema.Number);

// Check the various ways to refer to child types produce the same results
{
	const numberField1 = SchemaBuilder.field(value, numberSchema);
	const numberField2 = SchemaBuilder.field(value, () => numberSchema);
	const numberField3 = SchemaBuilder.valueField(numberSchema);
	const numberField4 = SchemaBuilder.fieldRecursive(value, [numberSchema] as const);
	type check1_ = requireAssignableTo<typeof numberField1, typeof numberField2>;
	type check2_ = requireAssignableTo<typeof numberField2, typeof numberField3>;
	// type check3_ = requireAssignableTo<typeof numberField3, typeof numberField4>;
	// type check4_ = requireAssignableTo<typeof numberField4, typeof numberField1>;
}

const ballSchema = builder.object("ball", {
	local: {
		// Test schema objects in as well as strings.
		x: numberSchema,
		y: () => numberSchema,
		size: SchemaBuilder.optional(numberSchema),
	},
});

// Recursive case:
const boxSchema = builder.objectRecursive("box", {
	local: {
		children: SchemaBuilder.fieldRecursive(sequence, [ballSchema, () => boxSchema] as const),
	},
});

type x = typeof numberSchema.name;
const schemaData = builder.intoLibrary();

// Example Use:
type BallTreeX = FlattenKeys<TypedNode<typeof ballSchema, ApiMode.Flexible>>;
type BallTree = NodeDataFor<ApiMode.Flexible, typeof ballSchema>;

{
	type check1_ = requireAssignableTo<BallTree, ContextuallyTypedNodeDataObject>;
}

// We can also get the type for the "number" nodes.
type NumberTree = TypedNode<typeof numberSchema, ApiMode.Flexible>;

const n1: NumberTree = 5;
const n2: NumberTree = { [valueSymbol]: 5 };
const n3: NumberTree = { [typeNameSymbol]: numberSchema.name, [valueSymbol]: 5 };
const n4: NumberTree = { [typeNameSymbol]: brand("number"), [valueSymbol]: 5 };

const b1: BallTree = { x: 1, y: 2, size: 10 };
const b1x: BallTree = { x: 1, y: 2 };
const b2: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: 2 };
const b4: BallTree = { [typeNameSymbol]: brand("ball"), x: 1, y: n3 };
const b6: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: n3 };

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
	type check_ = requireAssignableTo<BallXFieldTypes, typeof numberSchema>;

	type Child = TypeSetToTypedTrees<ApiMode.Flexible, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = TypeSetToTypedTrees<ApiMode.Flexible, typeof numberSchema>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;
}

interface TypeBuilder<TSchema extends TreeSchema> {
	a: NodeDataFor<ApiMode.Flexible, TSchema>;
	b: NodeDataFor<ApiMode.Editable, TSchema>;
	c: NodeDataFor<ApiMode.Wrapped, TSchema>;
}

type FlexNumber =
	| number
	| {
			[typeNameSymbol]?: ("number" & TreeSchemaIdentifier) | undefined;
			[valueSymbol]: number;
	  };

// This type type checks differently if its an interface, which breaks.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WrappedNumber = {
	[typeNameSymbol]: "number" & TreeSchemaIdentifier;
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
	type _check3 = requireTrue<areSafelyAssignable<XC, WrappedNumber>>;
}

interface FlexBall {
	[typeNameSymbol]?: ("ball" & TreeSchemaIdentifier) | undefined;
	x: FlexNumber;
	y: FlexNumber;
	size?: FlexNumber | undefined;
}

interface EditableBall extends UntypedTreeCore {
	[typeNameSymbol]: typeof ballSchema.name;
	x: number;
	y: number;
	size?: number;
}

// This type type checks differently if its an interface, which breaks.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WrappedBall = {
	[typeNameSymbol]: "ball" & TreeSchemaIdentifier;
	[valueSymbol]: undefined;
	x: WrappedNumber;
	y: WrappedNumber;
	size: WrappedNumber | undefined;
};

// Test non recursive cases:
{
	type F = TypeBuilder<typeof ballSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];
	type _check1 = requireTrue<areSafelyAssignable<XA, FlexBall>>;
	type _check2 = requireTrue<areSafelyAssignable<XB, EditableBall>>;
	type _check3 = requireTrue<areSafelyAssignable<XC, WrappedBall>>;
}

// Test recursive cases:
{
	type F = TypeBuilder<typeof boxSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];

	interface FlexBox {
		[typeNameSymbol]?: typeof boxSchema.name;
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
		type NormalizedChildSchemaTypes = FlexListToNonLazyArray<TreeSchema, ChildSchemaTypes>;
		type ChildTypes = TypeSetToTypedTrees<ApiMode.Wrapped, ChildSchemaTypes>;
		type Field = TypedField<ApiMode.Wrapped, ChildSchema>;
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
				},
			],
		};
	}

	{
		const child: XC = {
			[typeNameSymbol]: boxSchema.name,
			children: [],
			[valueSymbol]: undefined,
		};
		const parent: XC = {
			[typeNameSymbol]: boxSchema.name,
			children: [
				child,
				{
					[typeNameSymbol]: ballSchema.name,
					[valueSymbol]: undefined,
					x: { [typeNameSymbol]: numberSchema.name, [valueSymbol]: 1 },
					y: { [typeNameSymbol]: numberSchema.name, [valueSymbol]: 2 },
					size: undefined,
				},
			],
			[valueSymbol]: undefined,
		};
	}
}
