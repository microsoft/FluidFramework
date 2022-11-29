/* eslint-disable @typescript-eslint/ban-types */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    brand,
    TreeSchemaIdentifier,
    FieldSchema,
    FieldKindIdentifier,
    Brand,
    EditableField,
    EditableTree,
    LocalFieldKey,
    EditableTreeContext,
} from "@fluid-internal/tree";

export const booleanSchemaName: TreeSchemaIdentifier = brand("Bool");
export const int32SchemaName: TreeSchemaIdentifier = brand("Int32");
export const stringSchemaName: TreeSchemaIdentifier = brand("String");
export const float64SchemaName: TreeSchemaIdentifier = brand("Float64");
export const phonesSchemaName: TreeSchemaIdentifier =
    brand("Test:Phones-1.0.0");
export const addressSchemaName: TreeSchemaIdentifier =
    brand("Test:Address-1.0.0");
export const mapStringSchemaName: TreeSchemaIdentifier = brand("map<String>");
export const personSchemaName: TreeSchemaIdentifier =
    brand("Test:Person-1.0.0");

export function getRootFieldSchema(
    fieldKind: FieldKindIdentifier
): FieldSchema {
    return {
        kind: fieldKind,
        types: new Set([personSchemaName]),
    };
}

export type Float64 = Brand<number, "property-inspector-demo.Float64"> &
    EditableTree;
export type Int32 = Brand<number, "property-inspector-demo.Int32"> &
    EditableTree;
export type String = Brand<string, "property-inspector-demo.String"> &
    EditableTree;
export type Bool = Brand<boolean, "property-inspector-demo.Bool"> &
    EditableTree;

export type ComplexPhone = EditableTree &
    Brand<
        {
            number: String;
            prefix: String;
        },
        "property-inspector-demo.Test:Phone-1.0.0"
    >;

export type SimplePhones = EditableField &
    Brand<String[], "property-inspector-demo.Test:SimplePhones-1.0.0">;

export type Phone = EditableTree &
    Brand<
        Int32 | String | ComplexPhone | SimplePhones,
        "property-inspector-demo.Test:Phone-1.0.0"
    >;

export type Phones = Brand<
    Phone[],
    "property-inspector-demo.Test:Phones-1.0.0"
>;

export type Address = EditableTree &
    Brand<
        {
            zip: String | Int32;
            street?: String;
            city?: String;
            country?: String;
            phones?: Phones;
        },
        "property-inspector-demo.Test:Address-1.0.0"
    >;

export type Friends = EditableTree &
    Brand<Record<LocalFieldKey, string>, "property-inspector-demo.Map<String>">;

export type Person = EditableTree &
    Brand<
        {
            name: String;
            age?: Int32;
            adult?: Bool;
            salary?: Float64 | Int32;
            friends?: Friends;
            address?: Address;
        },
        "property-inspector-demo.Test:Person-1.0.0"
    >;

export function getPerson(context: EditableTreeContext): Person {
    const age: Int32 = brand(33.33);
    const person: Person = context.newDetachedNode(personSchemaName, {
        // typed with built-in primitive type
        name: "Adam",
        // explicitly typed
        age,
        // inline typed
        adult: brand<Bool>(true),
        // Float64 | Int32
        salary: context.newDetachedNode(float64SchemaName, 123123.4555),
        address: {
            // String | Int32
            zip: context.newDetachedNode(int32SchemaName, 69000),
            // (Int32 | String | ComplexPhone | SimplePhones)[]
            phones: [
                context.newDetachedNode(stringSchemaName, "+49123456778"),
                context.newDetachedNode(int32SchemaName, 12345678910),
            ],
        },
    });
    return person;
}
