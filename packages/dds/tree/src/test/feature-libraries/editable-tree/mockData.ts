/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { emptyField, FieldKinds, EditableTree } from "../../../feature-libraries";
import {
    namedTreeSchema,
    ValueSchema,
    fieldSchema,
    NamedTreeSchema,
    TreeSchemaIdentifier,
    SchemaData,
    GlobalFieldKey,
} from "../../../schema-stored";
import { EmptyKey, rootFieldKey, JsonableTree } from "../../../tree";
import { brand, Brand } from "../../../util";

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

export const float32Schema = namedTreeSchema({
    name: brand("Float32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const complexPhoneSchema = namedTreeSchema({
    name: brand("Test:Phone-1.0.0"),
    localFields: {
        number: fieldSchema(FieldKinds.value, [stringSchema.name]),
        prefix: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

// This schema is really unnecessary: it could just use a sequence field instead.
// Array nodes are only needed when you want polymorphism over array vs not-array.
// Using this tests handling of array nodes (though it makes this example not cover other use of sequence fields).
export const phonesSchema = namedTreeSchema({
    name: brand("Test:Phones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [
            stringSchema.name,
            int32Schema.name,
            complexPhoneSchema.name,
        ]),
    },
    extraLocalFields: emptyField,
});

export const simplePhonesSchema = namedTreeSchema({
    name: brand("Test:SimplePhones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

const globalFieldKeySequencePhones: GlobalFieldKey = brand("sequencePhones");
const globalFieldSchemaSequencePhones = fieldSchema(FieldKinds.sequence, [stringSchema.name]);

export const addressSchema = namedTreeSchema({
    name: brand("Test:Address-1.0.0"),
    localFields: {
        street: fieldSchema(FieldKinds.value, [stringSchema.name]),
        zip: fieldSchema(FieldKinds.optional, [stringSchema.name, int32Schema.name]),
        phones: fieldSchema(FieldKinds.optional, [phonesSchema.name]),
        simplePhones: fieldSchema(FieldKinds.optional, [simplePhonesSchema.name]),
        sequencePhones: fieldSchema(FieldKinds.sequence, [stringSchema.name]),
    },
    globalFields: [globalFieldKeySequencePhones],
    extraLocalFields: emptyField,
});

export const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
    value: ValueSchema.Serializable,
});

export const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.value, [int32Schema.name]),
        salary: fieldSchema(FieldKinds.value, [float32Schema.name]),
        friends: fieldSchema(FieldKinds.value, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.value, [addressSchema.name]),
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
    float32Schema,
    int32Schema,
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

export type Int32 = Brand<number, "Int32">;

export type ComplexPhoneType = EditableTree & {
    number: string;
    prefix: string;
};

export type PhonesType = (number | string | ComplexPhoneType)[];

export type SimplePhonesType = string[];

export type AddressType = EditableTree & {
    street: string;
    zip?: string;
    phones?: PhonesType;
    simplePhones?: SimplePhonesType;
    sequencePhones?: SimplePhonesType;
};

export type PersonType = EditableTree & {
    name: string;
    age: Int32;
    salary: number;
    friends: Record<string, string>;
    address: AddressType;
};

export const personData: JsonableTree = {
    type: personSchema.name,
    fields: {
        name: [{ value: "Adam", type: stringSchema.name }],
        age: [{ value: 35, type: int32Schema.name }],
        salary: [{ value: 10420.2, type: float32Schema.name }],
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
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    simplePhones: [
                        {
                            type: simplePhonesSchema.name,
                            fields: {
                                [EmptyKey]: [{ type: stringSchema.name, value: "112" }],
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
                        { type: stringSchema.name, value: "113" },
                        { type: stringSchema.name, value: "114" },
                    ],
                },
                type: addressSchema.name,
            },
        ],
    },
};
