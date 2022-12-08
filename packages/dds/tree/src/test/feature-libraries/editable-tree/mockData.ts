/* eslint-disable @typescript-eslint/no-unsafe-return */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    emptyField,
    FieldKinds,
    EditableTree,
    EditableTreeContext,
    ContextuallyTypedNodeDataObject,
    EditableField,
    ContextuallyTypedNodeData,
    typeNameSymbol,
    valueSymbol,
} from "../../../feature-libraries";
import {
    namedTreeSchema,
    ValueSchema,
    fieldSchema,
    NamedTreeSchema,
    TreeSchemaIdentifier,
    SchemaData,
    GlobalFieldKey,
    LocalFieldKey,
} from "../../../schema-stored";
import {
    EmptyKey,
    rootFieldKey,
    JsonableTree,
    symbolFromKey,
    GlobalFieldKeySymbol,
} from "../../../tree";
import { brand, Brand, Opaque } from "../../../util";

// TODO: Use typed schema (ex: typedTreeSchema), here, and derive the types below from them programmatically.

export const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

export const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const float64Schema = namedTreeSchema({
    name: brand("Float64"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const boolSchema = namedTreeSchema({
    name: brand("Bool"),
    extraLocalFields: emptyField,
    value: ValueSchema.Boolean,
});

export const simplePhonesSchema = namedTreeSchema({
    name: brand("Test:SimplePhones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const complexPhoneSchema = namedTreeSchema({
    name: brand("Test:Phone-1.0.0"),
    localFields: {
        number: fieldSchema(FieldKinds.value, [stringSchema.name]),
        prefix: fieldSchema(FieldKinds.value, [stringSchema.name]),
        extraPhones: fieldSchema(FieldKinds.optional, [simplePhonesSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const phonesSchema = namedTreeSchema({
    name: brand("Test:Phones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [
            stringSchema.name,
            int32Schema.name,
            complexPhoneSchema.name,
            // array of arrays
            simplePhonesSchema.name,
        ]),
    },
    extraLocalFields: emptyField,
});

export const globalFieldKeySequencePhones: GlobalFieldKey = brand("sequencePhones");
export const globalFieldSymbolSequencePhones: GlobalFieldKeySymbol = symbolFromKey(
    globalFieldKeySequencePhones,
);
export const globalFieldSchemaSequencePhones = fieldSchema(FieldKinds.sequence, [
    stringSchema.name,
]);

export const addressSchema = namedTreeSchema({
    name: brand("Test:Address-1.0.0"),
    localFields: {
        zip: fieldSchema(FieldKinds.value, [stringSchema.name, int32Schema.name]),
        street: fieldSchema(FieldKinds.optional, [stringSchema.name]),
        city: fieldSchema(FieldKinds.optional, [stringSchema.name]),
        country: fieldSchema(FieldKinds.optional, [stringSchema.name]),
        phones: fieldSchema(FieldKinds.optional, [phonesSchema.name]),
        sequencePhones: fieldSchema(FieldKinds.sequence, [stringSchema.name]),
    },
    globalFields: [globalFieldKeySequencePhones],
    extraLocalFields: emptyField,
});

export const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.optional, [stringSchema.name]),
    // currently it has no effect since EditableTree does not support (de-)serialization of `object`s
    value: ValueSchema.Serializable,
});

export const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.optional, [int32Schema.name]),
        adult: fieldSchema(FieldKinds.optional, [boolSchema.name]),
        salary: fieldSchema(FieldKinds.optional, [float64Schema.name, int32Schema.name]),
        friends: fieldSchema(FieldKinds.optional, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.optional, [addressSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const optionalChildSchema = namedTreeSchema({
    name: brand("Test:OptionalChild-1.0.0"),
    localFields: {
        child: fieldSchema(FieldKinds.optional),
    },
    value: ValueSchema.Serializable,
    extraLocalFields: emptyField,
});

export const arraySchema = namedTreeSchema({
    name: brand("Test:Array-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name]),
    },
    extraLocalFields: emptyField,
});

export const emptyNode: JsonableTree = { type: optionalChildSchema.name };

export const schemaTypes: Set<NamedTreeSchema> = new Set([
    arraySchema,
    optionalChildSchema,
    stringSchema,
    float64Schema,
    int32Schema,
    boolSchema,
    complexPhoneSchema,
    phonesSchema,
    simplePhonesSchema,
    addressSchema,
    mapStringSchema,
    personSchema,
]);

export const schemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
for (const named of schemaTypes) {
    schemaMap.set(named.name, named);
}

export const rootPersonSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

export const fullSchemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([
        [rootFieldKey, rootPersonSchema],
        [globalFieldKeySequencePhones, globalFieldSchemaSequencePhones],
    ]),
};

// TODO: derive types like these from those schema, which subset EditableTree

export type Float64 = Brand<number, "editable-tree.Float64"> & EditableTree;
export type Int32 = Brand<number, "editable-tree.Int32"> & EditableTree;
export type Bool = Brand<boolean, "editable-tree.Bool"> & EditableTree;

export type ComplexPhone = EditableTree &
    Brand<
        {
            number: string;
            prefix: string;
            extraPhones?: SimplePhones;
        },
        "editable-tree.Test:Phone-1.0.0"
    >;

export type SimplePhones = EditableField & Brand<string[], "editable-tree.Test:SimplePhones-1.0.0">;

export type Phones = EditableField &
    Brand<(Int32 | string | ComplexPhone | SimplePhones)[], "editable-tree.Test:Phones-1.0.0">;

export type Address = EditableTree &
    Brand<
        {
            zip: string | Int32;
            street?: string;
            city?: string;
            country?: string;
            phones?: Phones;
            sequencePhones?: SimplePhones;
        },
        "editable-tree.Test:Address-1.0.0"
    >;
export type Friends = EditableTree &
    Brand<Record<LocalFieldKey, string>, "editable-tree.Map<String>">;

export type Person = EditableTree &
    Brand<
        {
            name: string;
            age?: Int32;
            adult?: Bool;
            salary?: Float64 | Int32;
            friends?: Friends;
            address?: Address;
        },
        "editable-tree.Test:Person-1.0.0"
    >;

export interface IAddress extends Opaque<Address> {
    get phones(): Phones | undefined;
    set phones(data: ContextuallyTypedNodeData[] | undefined);
}

export interface IPerson extends Opaque<Person & ContextuallyTypedNodeDataObject> {
    get name(): string;
    set name(data: string);
}

export const personData: JsonableTree = {
    type: personSchema.name,
    fields: {
        name: [{ value: "Adam", type: stringSchema.name }],
        age: [{ value: 35, type: int32Schema.name }],
        adult: [{ value: true, type: boolSchema.name }],
        salary: [{ value: 10420.2, type: float64Schema.name }],
        friends: [
            {
                fields: {
                    Mat: [{ type: stringSchema.name, value: "Mat" }],
                },
                type: mapStringSchema.name,
            },
        ],
        address: [
            {
                fields: {
                    zip: [{ value: "99999", type: stringSchema.name }],
                    street: [{ value: "treeStreet", type: stringSchema.name }],
                    phones: [
                        {
                            type: phonesSchema.name,
                            fields: {
                                [EmptyKey]: [
                                    { type: stringSchema.name, value: "+49123456778" },
                                    { type: int32Schema.name, value: 123456879 },
                                    {
                                        type: complexPhoneSchema.name,
                                        fields: {
                                            number: [{ value: "012345", type: stringSchema.name }],
                                            prefix: [{ value: "0123", type: stringSchema.name }],
                                            extraPhones: [
                                                {
                                                    type: simplePhonesSchema.name,
                                                    fields: {
                                                        [EmptyKey]: [
                                                            {
                                                                type: stringSchema.name,
                                                                value: "91919191",
                                                            },
                                                        ],
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                    {
                                        type: simplePhonesSchema.name,
                                        fields: {
                                            [EmptyKey]: [
                                                { type: stringSchema.name, value: "112" },
                                                { type: stringSchema.name, value: "113" },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    sequencePhones: [
                        { type: stringSchema.name, value: "113" },
                        { type: stringSchema.name, value: "114" },
                    ],
                },
                globalFields: {
                    [globalFieldKeySequencePhones]: [
                        { type: stringSchema.name, value: "115" },
                        { type: stringSchema.name, value: "116" },
                    ],
                },
                type: addressSchema.name,
            },
        ],
    },
};

export function getTypeHandles(context: EditableTreeContext): {
    Person: (value: ContextuallyTypedNodeDataObject) => Person;
    // Float64: (value: number) => Float64;
    // Int32: (value: number) => Int32;
    // ComplexPhone: (value: ContextuallyTypedNodeDataObject) => ComplexPhone;
    // SimplePhones: (value: string[]) => SimplePhones;
    // String: (value: string) => string;
} {
    return {
        Person: (value: ContextuallyTypedNodeDataObject) => value as Person,
        // Float64: (value: number) => {
        //     const float64: Float64 = {
        //         [typeNameSymbol]: float64Schema.name,
        //         [valueSymbol]: value
        //     };
        //     return float64;
        // },
        // Int32: (value: number) => context.applyType(int32Schema.name, value) as Int32,
        // ComplexPhone: (value: ContextuallyTypedNodeDataObject) =>
        //     context.applyType(complexPhoneSchema.name, value) as ComplexPhone,
        // SimplePhones: (value: string[]) =>
        //     brand(value.map((v) => context.applyType(stringSchema.name, v) as string)),

        // String: (value: string) => context.applyType(stringSchema.name, value) as string,
    };
}

export function getPerson(context: EditableTreeContext): Person {
    const age: Int32 = brand(35);
    const { Person } = getTypeHandles(context);
    const person = {
        [typeNameSymbol]: personSchema.name,
        // typed with built-in primitive type
        name: "Adam",
        // explicitly typed
        age,
        // inline typed
        adult: brand<Bool>(true),
        // Float64 | Int32
        salary: {
            [valueSymbol]: 10420.2,
            [typeNameSymbol]: float64Schema.name,
        },
        friends: {
            Mat: "Mat",
        },
        address: {
            // string | Int32
            zip: "99999",
            street: "treeStreet",
            // (Int32 | string | ComplexPhone | SimplePhones)[]
            phones: [
                "+49123456778",
                123456879,
                {
                    [typeNameSymbol]: complexPhoneSchema.name,
                    prefix: "0123",
                    number: "012345",
                    extraPhones: ["91919191"],
                },
                ["112", "113"],
            ],
            sequencePhones: ["113", "114"],
            [globalFieldSymbolSequencePhones]: ["115", "116"],
        },
    };
    return Person(person);
}
