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
	ValidContextuallyTypedNodeData,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/schema-aware/schemaAware";

import { TreeSchemaIdentifier, ValueSchema } from "../../core";
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
	InlineOnce,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/typedSchema/typeUtils";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

// Example Schema:

// Declare a simple type which just holds a number.
const numberSchema = tree({
	name: "number" as const,
	value: ValueSchema.Number,
});

const ballSchema = tree({
	name: "ball" as const,
	local: {
		// TODO: test and fix passing schema objects in type array instead of strings.
		x: field(value, "number"),
		y: field(value, "number"),
		size: field(optional, "number"),
	},
});

type x = typeof numberSchema.typeInfo.name;
const schemaData = typedSchemaData(new Map(), numberSchema, ballSchema);

const schemaData2 = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map(),
	treeSchema: new Map<TreeSchemaIdentifier, TypedSchema.LabeledTreeSchema<any>>([
		[numberSchema.name, numberSchema],
		[ballSchema.name, ballSchema],
	]),
	treeSchemaObject: {
		number: numberSchema,
		ball: ballSchema,
	} as unknown as SchemaMap,
	allTypes: ["number", "ball"] as const,
} as const;

{
	type check1_ = requireAssignableTo<typeof schemaData, TypedSchemaData>;
	type check2_ = requireAssignableTo<typeof schemaData2, TypedSchemaData>;
}

interface SchemaMap {
	number: typeof numberSchema;
	ball: typeof ballSchema;
}

const extractedNumber = schemaData.treeSchemaObject.number;
const extractedNumber2 = schemaData2.treeSchemaObject.number;

const extractedTypes = schemaData.allTypes;
const extractedTypes2 = schemaData2.allTypes;

// Example Use:
type BallTreeX = InlineOnce<
	ValidContextuallyTypedNodeData<typeof schemaData, ApiMode.Flexible, readonly ["ball"]>
>;
type BallTree = InlineOnce<NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof ballSchema>>;

{
	type check1_ = requireAssignableTo<BallTree, ContextuallyTypedNodeDataObject>;
}

// We can also get the type for the "number" nodes.
type NumberTree = ValidContextuallyTypedNodeData<
	typeof schemaData,
	ApiMode.Flexible,
	readonly ["number"]
>;

const n1: NumberTree = 5;
const n2: NumberTree = { [valueSymbol]: 5 };
const n3: NumberTree = { [typeNameSymbol]: "number", [valueSymbol]: 5 };

const b1: BallTree = { x: 1, y: 2, size: 10 };
const b1x: BallTree = { x: 1, y: 2 };
const b2: BallTree = { [typeNameSymbol]: "ball", x: 1, y: 2 };
const b4: BallTree = { [typeNameSymbol]: "ball", x: 1, y: n3 };

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
