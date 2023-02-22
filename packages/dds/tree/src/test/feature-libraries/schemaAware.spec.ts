/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiMode,
	NodeDataFor,
	TreeTypesToTypedTreeTypes,
	TypedSchemaData,
	typedSchemaData,
	TypedNode,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/schema-aware/schemaAware";

import {
	FieldSchema,
	GlobalFieldKey,
	TreeSchema,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../core";
import { requireAssignableTo } from "../../util";
import {
	valueSymbol,
	FieldKinds,
	defaultSchemaPolicy,
	typeNameSymbol,
	TypedSchema,
	ContextuallyTypedNodeDataObject,
} from "../../feature-libraries";
import {
	FlattenKeys,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/typedSchema/typeUtils";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

// Example Schema:

// Declare a simple type which just holds a number.
const numberSchema = tree("number", {
	value: ValueSchema.Number,
});

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
const schemaData = typedSchemaData(new Map(), numberSchema, ballSchema, boxSchema);

const schemaData2 = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map() as ReadonlyMap<GlobalFieldKey, FieldSchema>,
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

	type Child = TreeTypesToTypedTreeTypes<typeof schemaData, ApiMode.Flexible, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = TreeTypesToTypedTreeTypes<
		typeof schemaData,
		ApiMode.Flexible,
		TypedSchema.NameSet<["number"]>
	>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;
}

interface TypeBuilder<TSchema extends TypedSchema.LabeledTreeSchema<any>> {
	a: NodeDataFor<typeof schemaData, ApiMode.Flexible, TSchema>;
	b: NodeDataFor<typeof schemaData, ApiMode.Normalized, TSchema>;
	c: NodeDataFor<typeof schemaData, ApiMode.Wrapped, TSchema>;
}

// Test terminal cases:
{
	type F = TypeBuilder<typeof numberSchema>;
	type AA = NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof numberSchema>;
	type AB = NodeDataFor<typeof schemaData, ApiMode.Normalized, typeof numberSchema>;
	type AC = NodeDataFor<typeof schemaData, ApiMode.Wrapped, typeof numberSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];
}

// Test non recursive cases:
{
	type F = TypeBuilder<typeof ballSchema>;
	type AA = NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof ballSchema>;
	type AB = NodeDataFor<typeof schemaData, ApiMode.Normalized, typeof ballSchema>;
	type AC = NodeDataFor<typeof schemaData, ApiMode.Wrapped, typeof ballSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];
}

// Test recursive cases:
{
	type F = TypeBuilder<typeof boxSchema>;
	type AA = NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof boxSchema>;
	type AB = NodeDataFor<typeof schemaData, ApiMode.Normalized, typeof boxSchema>;
	type AC = NodeDataFor<typeof schemaData, ApiMode.Wrapped, typeof boxSchema>;
	type XA = F["a"];
	type XB = F["b"];
	type XC = F["c"];

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
		const child: XB = {
			[typeNameSymbol]: boxSchema.name,
			children: [],
		};
		const parent: XB = {
			[typeNameSymbol]: boxSchema.name,
			children: [
				child,
				{
					[typeNameSymbol]: ballSchema.name,
					x: 1,
					y: 2,
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
