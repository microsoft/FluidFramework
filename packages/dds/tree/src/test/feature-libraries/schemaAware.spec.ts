/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	typedTreeSchema as tree,
	typedFieldSchema as field,
	LabeledTreeSchema,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/modular-schema/typedSchema";

import {
	ApiMode,
	NodeDataFor,
	TreeTypesToTypedTreeTypes,
	ValidContextuallyTypedNodeData,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/schemaAware";

import { TreeSchemaIdentifier, ValueSchema } from "../../core";
import { requireAssignableTo } from "../../util";
import {
	valueSymbol,
	FieldKinds,
	defaultSchemaPolicy,
	typeNameSymbol,
} from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { NameSet } from "../../feature-libraries/modular-schema/typedSchema/outputTypes";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;

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
	},
});

const schemaData = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map(),
	treeSchema: new Map<TreeSchemaIdentifier, LabeledTreeSchema<any>>([
		[numberSchema.name, numberSchema],
		[ballSchema.name, ballSchema],
	]),
	treeSchemaObject: {
		number: numberSchema,
		ball: ballSchema,
	} as unknown as SchemaMap,
	allTypes: ["number", "ball"] as const,
} as const;

interface SchemaMap {
	number: typeof numberSchema;
	ball: typeof ballSchema;
}

/**
 * Return a type thats equivalent to the input, but with different intellisense.
 * Inlines some top level type meta-functions.
 */
export type InlineOnce<T> = {
	[Property in keyof T]: T[Property];
};

type InlineDeep<T> = {
	[Property in keyof T]: InlineOnce<T[Property]>;
};

// Example Use:
type BallTreeX = InlineOnce<
	ValidContextuallyTypedNodeData<typeof schemaData, ApiMode.Flexible, readonly ["ball"]>
>;
type BallTree = NodeDataFor<typeof schemaData, ApiMode.Flexible, typeof ballSchema>;

// We can also get the type for the "number" nodes.
type NumberTree = ValidContextuallyTypedNodeData<
	typeof schemaData,
	ApiMode.Flexible,
	readonly ["number"]
>;

const n1: NumberTree = 5;
const n2: NumberTree = { [valueSymbol]: 5 };
const n3: NumberTree = { [typeNameSymbol]: "number", [valueSymbol]: 5 };

const b1: BallTree = { x: 1, y: 2 };
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
	type check_ = requireAssignableTo<BallXFieldTypes, NameSet<["number"]>>;

	type Child = TreeTypesToTypedTreeTypes<typeof schemaData, ApiMode.Flexible, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = TreeTypesToTypedTreeTypes<
		typeof schemaData,
		ApiMode.Flexible,
		NameSet<["number"]>
	>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;
}
