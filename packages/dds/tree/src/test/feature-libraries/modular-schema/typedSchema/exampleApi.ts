/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../../../../core";
import { FieldKinds, TypedSchema } from "../../../../feature-libraries";
import { requireAssignableTo } from "../../../../util";
// eslint-disable-next-line import/no-internal-modules
import { NameSet } from "../../../../feature-libraries/modular-schema/typedSchema/outputTypes";
// eslint-disable-next-line import/no-internal-modules
import { ArrayToUnion } from "../../../../feature-libraries/modular-schema/typedSchema/typeUtils";
// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

/**
 * Example strong type for an API derived from schema.
 *
 * A type similar to this could be used with EditableTree to provide a schema aware API.
 *
 * For now this just supports local fields:
 */
export type TypedTree<TMap, TSchema extends TypedSchema.LabeledTreeSchema> = TypedFields<
	TMap,
	TSchema["typeInfo"]["local"]
>;

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 */
export type TypedFields<
	TMap,
	TFields extends { [key: string]: TypedSchema.FieldSchemaTypeInfo },
> = {
	readonly [key in keyof TFields]: TreeTypesToTypedTreeTypes<TMap, TFields[key]["types"]>;
};

/**
 * Takes in `types?: ReadonlySet<brandedTypeNameUnion>`
 * and returns a TypedTree union.
 */
export type TreeTypesToTypedTreeTypes<TMap, T extends unknown | NameSet> = T extends NameSet<
	infer Names
>
	? ValuesOf<{
			[ChildTypeName in keyof TMap]: ChildTypeName extends ArrayToUnion<Names> & string
				? NameToTreeType<TMap, ChildTypeName>
				: never;
	  }>
	: AnyTree;

interface AnyTree {}

/**
 * Takes in type name and returns TypedTree for it.
 * and returns a TypedTree union.
 */
export type NameToTreeType<TMap, T extends string> = TMap extends {
	[key in T]: TypedSchema.LabeledTreeSchema;
}
	? TypedTree<TMap, TMap[T]>
	: never;

type ValuesOf<T> = T[keyof T];

// Example Schema:

// Declare a simple type which just holds a number.
const numberSchema = tree("number", {
	value: ValueSchema.Number,
});

const ballSchema = tree("ball", {
	local: {
		// TODO: test and fix passing schema objects in type array instead of strings.
		x: field(value, "number"),
		y: field(value, "number"),
	},
});

interface SchemaMap {
	number: typeof numberSchema;
	ball: typeof ballSchema;
}

// Example Use:
type BallTree = TypedTree<SchemaMap, typeof ballSchema>;

// We can also get the type for the "number" nodes.
// A real API would to provide access to value here: this one is not useful in this case.
type NumberTree = TypedTree<SchemaMap, typeof numberSchema>;

function useBall(b: BallTree): NumberTree {
	// This is type safe, so we can only access fields that are in the schema.
	// @ts-expect-error THis is an error since it accesses an invalid field.
	const bad = b.q;
	// This is not an error, since it is in schema.
	const good: NumberTree = b.x;
	return good;
}

// This works by transforming the type info from the schema.

{
	// A concrete example for a numeric field:
	const numericField = field(value, "Number");
	type NumericFieldInfo = typeof numericField;
	type NumericFieldTypes = NumericFieldInfo["types"];
	type check1_ = requireAssignableTo<NumericFieldTypes, NameSet<["Number"]>>;
	type check2_ = requireAssignableTo<NameSet<["Number"]>, NumericFieldTypes>;
	// @ts-expect-error Different sets should not be equal
	type check3_ = requireAssignableTo<NumericFieldTypes, NameSet<["X"]>>;
}

{
	// A concrete example for the "x" field:
	type BallXFieldInfo = typeof ballSchema.typeInfo.local.x;
	type BallXFieldTypes = BallXFieldInfo["types"];
	type check_ = requireAssignableTo<BallXFieldTypes, NameSet<["number"]>>;

	type Child = TreeTypesToTypedTreeTypes<SchemaMap, BallXFieldTypes>;

	type check3_ = requireAssignableTo<Child, NumberTree>;
	type check4_ = requireAssignableTo<NumberTree, Child>;
	type Child2 = TreeTypesToTypedTreeTypes<SchemaMap, NameSet<["number"]>>;

	type check3x_ = requireAssignableTo<Child2, NumberTree>;
	type check4x_ = requireAssignableTo<NumberTree, Child2>;

	type ChildLookup = NameToTreeType<SchemaMap, "number">;
}
