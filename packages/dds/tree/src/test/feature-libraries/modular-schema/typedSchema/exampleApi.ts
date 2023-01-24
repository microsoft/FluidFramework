/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    typedTreeSchema as tree,
    typedFieldSchema as field,
    // Allow importing from this specific file which is being tested:
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema";

import {
    FieldSchemaTypeInfo,
    LabeledFieldSchema,
    LabeledTreeSchema,
    MapToken,
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/outputTypes";
import {
    TypeInfo,
    FieldInfo,
    FieldInfoGeneric,
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typedSchema";

import { ValueSchema } from "../../../../core";
import { FieldKinds } from "../../../../feature-libraries";
import { requireAssignableTo } from "../../../../util";
// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;

/**
 * Example strong type for an API derived from schema.
 *
 * A type similar to this could be used with EditableTree to provide a schema aware API.
 *
 * For now this just supports local fields:
 */
export type TypedTree<TMap, TSchema extends LabeledTreeSchema<any>> = TypedFields<
    TMap,
    FieldsInfo<TypeInfo<TSchema>["local"]>
>;

/**
 * Takes in a `{ readonly [key: string]: LabeledFieldSchema<any> }` and returns
 * `{ [key: string]: FieldSchemaTypeInfo }`
 */
export type FieldsInfo<
    TFields extends { readonly [key: string]: LabeledFieldSchema<FieldSchemaTypeInfo> },
> = {
    [key in keyof TFields]: FieldInfoGeneric<TFields[key]>;
};

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 */
export type TypedFields<TMap, TFields extends { [key: string]: FieldSchemaTypeInfo }> = {
    readonly [key in keyof TFields]: TreeTypesToTypedTreeTypes<TMap, TFields[key]["types"]>;
};

/**
 * Takes in `types?: { readonly [key: string]: MapToken }`
 * and returns a TypedTree union.
 */
export type TreeTypesToTypedTreeTypes<
    TMap,
    T extends unknown | { readonly [key: string]: MapToken },
> = unknown extends T
    ? AnyTree
    : ValuesOf<{
          [ChildTypeName in keyof T]: ChildTypeName extends string
              ? NameToTreeType<TMap, ChildTypeName>
              : unknown;
      }>;

interface AnyTree {}

/**
 * Takes in type name and returns TypedTree for it.
 * and returns a TypedTree union.
 */
export type NameToTreeType<TMap, T extends string> = TMap extends {
    [key in T]: LabeledTreeSchema<any>;
}
    ? TypedTree<TMap, TMap[T]>
    : never;

type ValuesOf<T> = T[keyof T];

// Example Schema:

// Declare a simple type which just holds a number.
const numberSchema = tree({
    name: "number",
    value: ValueSchema.Number,
});

const ballSchema = tree({
    name: "ball",
    local: {
        // TODO: test and fix passing schema objects in type array instead of strings.
        x: field(value, ["number"] as const),
        y: field(value, ["number"] as const),
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
    // This is type safe, so we can only access fields that are in the schema/
    // @ts-expect-error THis is an error since it accesses an invalid field.
    const bad = b.q;
    // This is not an error, since it is in schema.
    const good: NumberTree = b.x;
    return good;
}

// This works by transforming the type info from the schema.

{
    // A concrete example for a numeric field:
    const numericField = field(value, ["Number"] as const);
    type NumericFieldInfo = FieldInfo<typeof numericField>;
    type NumericFieldTypes = NumericFieldInfo["types"];
    type check1_ = requireAssignableTo<NumericFieldTypes, { Number: MapToken }>;
    type check2_ = requireAssignableTo<{ Number: MapToken }, NumericFieldTypes>;
    type ChildName = keyof NumericFieldTypes;
    type check3_ = requireAssignableTo<ChildName, "Number">;
}

{
    // A concrete example for the "x" field:
    type BallXFieldInfo = FieldInfo<TypeInfo<typeof ballSchema>["local"]["x"]>;
    type BallXFieldTypes = BallXFieldInfo["types"];
    type check_ = requireAssignableTo<keyof BallXFieldTypes, "number">;

    type Child = TreeTypesToTypedTreeTypes<SchemaMap, BallXFieldTypes>;

    type check3_ = requireAssignableTo<Child, NumberTree>;
    type check4_ = requireAssignableTo<NumberTree, Child>;
    type Child2 = TreeTypesToTypedTreeTypes<SchemaMap, { number: MapToken }>;

    type check3x_ = requireAssignableTo<Child2, NumberTree>;
    type check4x_ = requireAssignableTo<NumberTree, Child2>;

    type ChildLookup = NameToTreeType<SchemaMap, "number">;
}
