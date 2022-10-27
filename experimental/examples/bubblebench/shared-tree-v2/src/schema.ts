/* eslint-disable import/no-internal-modules */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    brand,
    emptyField,
    EmptyKey,
    FieldKinds,
    JsonableTree,
    rootFieldKey,
} from "@fluid-internal/tree";
import {
    fieldSchema,
    namedTreeSchema,
    SchemaData,
    ValueSchema,
} from "@fluid-internal/tree/dist/schema-stored";

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

export const iBubbleSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiBubble-1.0.0"),
    localFields: {
        x: fieldSchema(FieldKinds.value, [int32Schema.name]),
        y: fieldSchema(FieldKinds.value, [int32Schema.name]),
        r: fieldSchema(FieldKinds.value, [int32Schema.name]),
        vx: fieldSchema(FieldKinds.value, [int32Schema.name]),
        vy: fieldSchema(FieldKinds.value, [int32Schema.name]),
    },
    extraLocalFields: emptyField,
});

export const iBubbleSequenceSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiBubbleSequence-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [iBubbleSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const iClientSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiClient-1.0.0"),
    localFields: {
        clientId: fieldSchema(FieldKinds.value, [stringSchema.name]),
        color: fieldSchema(FieldKinds.value, [stringSchema.name]),
        bubbles: fieldSchema(FieldKinds.sequence, [iBubbleSequenceSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const iClientSequenceSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiClientSequence-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [iClientSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const AppStateSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppState-1.0.0"),
    localFields: {
        clients: fieldSchema(FieldKinds.sequence, [iClientSequenceSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const rootAppStateSchema = fieldSchema(FieldKinds.value, [
    AppStateSchema.name,
]);

export const AppStateSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [int32Schema.name, int32Schema],
        [iBubbleSchema.name, iBubbleSchema],
        [iBubbleSequenceSchema.name, iBubbleSequenceSchema],
        [iClientSchema.name, iClientSchema],
        [iClientSequenceSchema.name, iClientSequenceSchema],
        [AppStateSchema.name, AppStateSchema],
    ]),
    globalFieldSchema: new Map([[rootFieldKey, rootAppStateSchema]]),
};

export const mockAppStateJsonTree: JsonableTree = {
    type: AppStateSchema.name,
    fields: {
        clients: [
            {
                type: iClientSchema.name,
                fields: {
                    clientId: [{ type: stringSchema.name, value: "1" }],
                    color: [{ type: stringSchema.name, value: "red" }],
                    bubbles: [
                        {
                            type: iBubbleSchema.name,
                            fields: {
                                x: [{ type: int32Schema.name, value: 10 }],
                                y: [{ type: int32Schema.name, value: 11 }],
                                r: [{ type: int32Schema.name, value: 12 }],
                                vx: [{ type: int32Schema.name, value: 13 }],
                                vy: [{ type: int32Schema.name, value: 14 }],
                            },
                        },
                        {
                            type: iBubbleSchema.name,
                            fields: {
                                x: [{ type: int32Schema.name, value: 20 }],
                                y: [{ type: int32Schema.name, value: 20 }],
                                r: [{ type: int32Schema.name, value: 20 }],
                                vx: [{ type: int32Schema.name, value: 20 }],
                                vy: [{ type: int32Schema.name, value: 20 }],
                            },
                        },
                    ],
                },
            },
            {
                type: iClientSequenceSchema.name,
                fields: {
                    [EmptyKey]: [
                        {
                            type: iClientSchema.name,
                            fields: {
                                clientId: [
                                    { type: stringSchema.name, value: "2" },
                                ],
                                color: [
                                    { type: stringSchema.name, value: "blue" },
                                ],
                                bubbles: [
                                    {
                                        type: iBubbleSchema.name,
                                        fields: {
                                            x: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 10,
                                                },
                                            ],
                                            y: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 10,
                                                },
                                            ],
                                            r: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 10,
                                                },
                                            ],
                                            vx: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 10,
                                                },
                                            ],
                                            vy: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 10,
                                                },
                                            ],
                                        },
                                    },
                                    {
                                        type: iBubbleSchema.name,
                                        fields: {
                                            x: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 20,
                                                },
                                            ],
                                            y: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 20,
                                                },
                                            ],
                                            r: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 20,
                                                },
                                            ],
                                            vx: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 20,
                                                },
                                            ],
                                            vy: [
                                                {
                                                    type: int32Schema.name,
                                                    value: 20,
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ],
    },
};
