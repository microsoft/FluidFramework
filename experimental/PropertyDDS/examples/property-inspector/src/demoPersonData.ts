/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    brand,
    EmptyKey,
    JsonableTree,
    TreeSchemaIdentifier,
    FieldSchema,
    FieldKindIdentifier,
} from "@fluid-internal/tree";

const booleanSchemaName: TreeSchemaIdentifier = brand("Bool");
const int32SchemaName: TreeSchemaIdentifier = brand("Int32");
const stringSchemaName: TreeSchemaIdentifier = brand("String");
const float64SchemaName: TreeSchemaIdentifier = brand("Float64");
const phonesSchemaName: TreeSchemaIdentifier = brand("Test:Phones-1.0.0");
const addressSchemaName: TreeSchemaIdentifier = brand("Test:Address-1.0.0");
const mapStringSchemaName: TreeSchemaIdentifier = brand("map<String>");
export const personSchemaName: TreeSchemaIdentifier = brand("Test:Person-1.0.0");

export function getRootFieldSchema(fieldKind: FieldKindIdentifier): FieldSchema {
    return {
        kind: fieldKind,
        types: new Set([personSchemaName]),
    };
}

export const personData: JsonableTree = {
    type: personSchemaName,
    fields: {
        name: [{ value: "Adam", type: stringSchemaName }],
        age: [{ value: 35, type: int32SchemaName }],
        adult: [{ value: true, type: booleanSchemaName }],
        salary: [{ value: 10420.2, type: float64SchemaName }],
        friends: [
            {
                fields: {
                    Mat: [{ type: stringSchemaName, value: "Mat" }],
                },
                type: mapStringSchemaName,
            },
        ],
        address: [
            {
                fields: {
                    street: [{ value: "treeStreet", type: stringSchemaName }],
                    phones: [
                        {
                            type: phonesSchemaName,
                            fields: {
                                [EmptyKey]: [
                                    { type: stringSchemaName, value: "+49123456778" },
                                    { type: stringSchemaName, value: "+12345678910" },
                                ],
                            },
                        },
                    ],
                },
                type: addressSchemaName,
            },
        ],
    },
};
