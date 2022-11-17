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
export const phonesSchemaName: TreeSchemaIdentifier = brand("Test:Phones-1.0.0");
export const addressSchemaName: TreeSchemaIdentifier = brand("Test:Address-1.0.0");
export const mapStringSchemaName: TreeSchemaIdentifier = brand("map<String>");
export const personSchemaName: TreeSchemaIdentifier = brand("Test:Person-1.0.0");

export function getRootFieldSchema(fieldKind: FieldKindIdentifier): FieldSchema {
    return {
        kind: fieldKind,
        types: new Set([personSchemaName]),
    };
}

export type Float64 = Brand<number, "property-inspector-demo.Float64"> & EditableTree;
export type Int32 = Brand<number, "property-inspector-demo.Int32"> & EditableTree;
export type StRing = Brand<string, "property-inspector-demo.String"> & EditableTree;
export type Bool = Brand<boolean, "property-inspector-demo.Bool"> & EditableTree;

export type ComplexPhone = EditableTree &
    Brand<
        {
            number: StRing;
            prefix: StRing;
        },
        "property-inspector-demo.Test:Phone-1.0.0"
    >;

export type SimplePhones = EditableField &
    Brand<StRing[], "property-inspector-demo.Test:SimplePhones-1.0.0">;

export type Phones = EditableField &
    Brand<
        (Int32 | StRing | ComplexPhone | SimplePhones)[],
        "property-inspector-demo.Test:Phones-1.0.0"
    >;

export type Address = EditableTree &
    Brand<
        {
            zip: StRing | Int32;
            street?: StRing;
            city?: StRing;
            country?: StRing;
            phones?: Phones;
        },
        "property-inspector-demo.Test:Address-1.0.0"
    >;

export type Friends = EditableTree &
    Brand<Record<LocalFieldKey, string>, "property-inspector-demo.Map<String>">;

export type Person = EditableTree &
    Brand<
        {
            name: StRing;
            age?: Int32;
            adult?: Bool;
            salary?: Float64 | Int32;
            friends?: Friends;
            address?: Address;
        },
        "property-inspector-demo.Test:Person-1.0.0"
    >;

export function getPerson(context: EditableTreeContext): Person {
    const newNode = context.newDetachedNode.bind(context);
    const person: Person = brand({
        name: brand("Adam"),
        age: brand(33),
        adult: brand(false),
        salary: newNode(brand<Float64>(123456.789), float64SchemaName),
        address: brand({
            zip: newNode(brand(69000), int32SchemaName),
            phones: brand([
                newNode(brand("+49123456778"), stringSchemaName),
                newNode(brand(12345678910), int32SchemaName),
            ]),
        }),
    });
    return person;
}
