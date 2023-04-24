/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiMode,
	NodeDataFor,
	TypeSetToTypedTrees,
	TypedSchemaData,
	typedSchemaData,
	TypedNode,
	EditableField,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/schema-aware/schemaAware";

import { GlobalFieldKey, TreeSchema, TreeSchemaIdentifier, ValueSchema } from "../../../core";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../../util";
import {
	valueSymbol,
	FieldKinds,
	defaultSchemaPolicy,
	typeNameSymbol,
	TypedSchema,
	ContextuallyTypedNodeDataObject,
	FieldViewSchema,
	UntypedTreeCore,
} from "../../../feature-libraries";
import {
	FlattenKeys,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/typedSchema/typeUtils";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

// Example Schema:

// Declare a simple type which just holds a number.
const numberSchema = tree("number", {
	value: ValueSchema.Number,
});

// Check the various ways to refer to child types produce the same results
{
	const numberField1 = field(value, numberSchema);
	const numberField2 = field(value, numberSchema.name);
	const numberField3 = field(value, numberSchema.typeInfo.name);
	const numberField4 = field(value, "number");
	type check1_ = requireAssignableTo<typeof numberField1, typeof numberField2>;
	type check2_ = requireAssignableTo<typeof numberField2, typeof numberField3>;
	type check3_ = requireAssignableTo<typeof numberField3, typeof numberField4>;
	type check4_ = requireAssignableTo<typeof numberField4, typeof numberField1>;
}

const ballSchema = tree("ball", {
	local: {
		// Test schema objects in as well as strings.
		x: field(value, numberSchema),
		y: field(value, "number"),
		size: field(optional, "number"),
	},
});

const boxSchema = tree("box", {
	local: {
		// Use name for recursive case:
		children: field(sequence, ballSchema, "box"),
	},
});

type x = typeof numberSchema.typeInfo.name;
const schemaData = typedSchemaData([], numberSchema, ballSchema, boxSchema);

const schemaData2 = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map() as ReadonlyMap<GlobalFieldKey, FieldViewSchema>,
	treeSchema: new Map<TreeSchemaIdentifier, TreeSchema>([
		[numberSchema.name, numberSchema],
		[ballSchema.name, ballSchema],
		[boxSchema.name, boxSchema],
	]) as ReadonlyMap<TreeSchemaIdentifier, TreeSchema>,
	treeSchemaObject: {
		number: numberSchema,
		ball: ballSchema,
		box: boxSchema,
	} as unknown as SchemaMap,
	allTypes: constArray("number", "ball", "box"),
} as const;

{
	type check1_ = requireAssignableTo<typeof schemaData, TypedSchemaData>;
	type check2_ = requireAssignableTo<typeof schemaData2, TypedSchemaData>;
	type check3_ = requireAssignableTo<typeof schemaData, typeof schemaData2>;
	type check4_ = requireAssignableTo<typeof schemaData2, typeof schemaData>;
}

// Infers more specific type for the items than an array literal would, but doesn't add "readonly".
// Useful since "readonly" is mostly just noise for arrays with have statically known content.
function constArray<T extends string[]>(...a: T): T {
	return a;
}

interface SchemaMap {
	number: typeof numberSchema;
	ball: typeof ballSchema;
	box: typeof boxSchema;
}

const extractedNumber = schemaData.treeSchemaObject.number;
const extractedNumber2 = schemaData2.treeSchemaObject.number;

const extractedTypes = schemaData.allTypes;
const extractedTypes2 = schemaData2.allTypes;

// Example Use:
type BallTreeX = FlattenKeys<TypedNode<readonly ["ball"], ApiMode.Flexible, typeof schemaData>>;
type BallTree = NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof ballSchema>;

{
	type check1_ = requireAssignableTo<BallTree, ContextuallyTypedNodeDataObject>;
}

// We can also get the type for the "number" nodes.
type NumberTree = TypedNode<readonly ["number"], ApiMode.Flexible, typeof schemaData>;

const n1: NumberTree = 5;
const n2: NumberTree = { [valueSymbol]: 5 };
const n3: NumberTree = { [typeNameSymbol]: "number", [valueSymbol]: 5 };

const b1: BallTree = { x: 1, y: 2, size: 10 };
const b1x: BallTree = { x: 1, y: 2 };
const b2: BallTree = { [typeNameSymbol]: "ball", x: 1, y: 2 };
const b4: BallTree = { [typeNameSymbol]: "ball", x: 1, y: n3 };
const b6: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, y: n3 };

// This is type safe, so we can only access fields that are in the schema.
// @ts-expect-error This is an error since it accesses an invalid field.
const b5: BallTree = { [typeNameSymbol]: ballSchema.name, x: 1, z: n3 };

// @ts-expect-error Wrong type
const nError1: NumberTree = { [typeNameSymbol]: ballSchema.name, [valueSymbol]: 5 };

{
	// A concrete example for the "x" field:
	type BallXFieldInfo = typeof ballSchema.typeInfo.local.x;
	type BallXFieldTypes = BallXFieldInfo["types"];
	type check_ = requireAssignableTo<BallXFieldTypes, TypedSchema.NameSet<["number"]>>;

	type Child = TypeSetToTypedTrees<typeof schemaData, ApiMode.Flexible, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = TypeSetToTypedTrees<
		typeof schemaData,
		ApiMode.Flexible,
		TypedSchema.NameSet<["number"]>
	>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;
}

interface TypeBuilder<TSchema extends TypedSchema.LabeledTreeSchema> {
	a: NodeDataFor<typeof schemaData, ApiMode.Flexible, TSchema>;
	b: NodeDataFor<typeof schemaData, ApiMode.Editable, TSchema>;
	c: NodeDataFor<typeof schemaData, ApiMode.Wrapped, TSchema>;
}

type FlexNumber =
	| number
	| {
			[typeNameSymbol]?: "number" | undefined;
			[valueSymbol]: number;
	  };

// This type type checks differently if its an interface, which breaks.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WrappedNumber = {
	[typeNameSymbol]: "number";
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
	[typeNameSymbol]?: "ball" | undefined;
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
	[typeNameSymbol]: "ball";
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
		[typeNameSymbol]?: "box";
		children: (FlexBall | FlexBox)[];
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
					[typeNameSymbol]: "ball",
					x: 1,
					y: { [typeNameSymbol]: "number", [valueSymbol]: 2 },
				},
			],
		};
	}

	{
		const child: XC = {
			[typeNameSymbol]: "box",
			children: [],
			[valueSymbol]: undefined,
		};
		const parent: XC = {
			[typeNameSymbol]: "box",
			children: [
				child,
				{
					[typeNameSymbol]: "ball",
					[valueSymbol]: undefined,
					x: { [typeNameSymbol]: "number", [valueSymbol]: 1 },
					y: { [typeNameSymbol]: "number", [valueSymbol]: 2 },
					size: undefined,
				},
			],
			[valueSymbol]: undefined,
		};
	}
}
