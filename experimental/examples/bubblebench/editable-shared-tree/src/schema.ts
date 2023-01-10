/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    brand,
    EditableTree,
    emptyField,
    EmptyKey,
    FieldKinds,
    fieldSchema,
    JsonableTree,
    namedTreeSchema,
    rootFieldKey,
    SchemaData,
    ValueSchema,
} from "@fluid-internal/tree";

export const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

export const numberSchema = namedTreeSchema({
    name: brand("number"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const iBubbleSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiBubble-1.0.0"),
    localFields: {
        x: fieldSchema(FieldKinds.value, [numberSchema.name]),
        y: fieldSchema(FieldKinds.value, [numberSchema.name]),
        r: fieldSchema(FieldKinds.value, [numberSchema.name]),
        vx: fieldSchema(FieldKinds.value, [numberSchema.name]),
        vy: fieldSchema(FieldKinds.value, [numberSchema.name]),
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

export type BubbleTreeProxy = EditableTree & {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
};

export type ClientTreeProxy = EditableTree & {
    clientId: string;
    color: string;
    bubbles: BubbleTreeProxy[];
};

export type AppStateTreeProxy = EditableTree & {
    clients: ClientTreeProxy[];
};

export const rootAppStateSchema = fieldSchema(FieldKinds.value, [AppStateSchema.name]);

export const AppStateSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [numberSchema.name, numberSchema],
        [iBubbleSchema.name, iBubbleSchema],
        [iBubbleSequenceSchema.name, iBubbleSequenceSchema],
        [iClientSchema.name, iClientSchema],
        [iClientSequenceSchema.name, iClientSequenceSchema],
        [AppStateSchema.name, AppStateSchema],
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootAppStateSchema],
    ]),
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
                                x: [{ type: numberSchema.name, value: 10 }],
                                y: [{ type: numberSchema.name, value: 11 }],
                                r: [{ type: numberSchema.name, value: 12 }],
                                vx: [{ type: numberSchema.name, value: 13 }],
                                vy: [{ type: numberSchema.name, value: 14 }],
                            },
                        },
                        {
                            type: iBubbleSchema.name,
                            fields: {
                                x: [{ type: numberSchema.name, value: 20 }],
                                y: [{ type: numberSchema.name, value: 20 }],
                                r: [{ type: numberSchema.name, value: 20 }],
                                vx: [{ type: numberSchema.name, value: 20 }],
                                vy: [{ type: numberSchema.name, value: 20 }],
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
                                clientId: [{ type: stringSchema.name, value: "2" }],
                                color: [{ type: stringSchema.name, value: "blue" }],
                                bubbles: [
                                    {
                                        type: iBubbleSchema.name,
                                        fields: {
                                            x: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 10,
                                                },
                                            ],
                                            y: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 10,
                                                },
                                            ],
                                            r: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 10,
                                                },
                                            ],
                                            vx: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 10,
                                                },
                                            ],
                                            vy: [
                                                {
                                                    type: numberSchema.name,
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
                                                    type: numberSchema.name,
                                                    value: 20,
                                                },
                                            ],
                                            y: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 20,
                                                },
                                            ],
                                            r: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 20,
                                                },
                                            ],
                                            vx: [
                                                {
                                                    type: numberSchema.name,
                                                    value: 20,
                                                },
                                            ],
                                            vy: [
                                                {
                                                    type: numberSchema.name,
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
