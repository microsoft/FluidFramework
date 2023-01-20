/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    brand,
    EditableTree,
    FieldKinds,
    fieldSchema,
    namedTreeSchema,
    rootFieldKey,
    SchemaData,
    ValueSchema,
} from "@fluid-internal/tree";

export const stringSchema = namedTreeSchema({
    name: brand("String"),
    value: ValueSchema.String,
});

export const numberSchema = namedTreeSchema({
    name: brand("number"),
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
});

export const iClientSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiClient-1.0.0"),
    localFields: {
        clientId: fieldSchema(FieldKinds.value, [stringSchema.name]),
        color: fieldSchema(FieldKinds.value, [stringSchema.name]),
        bubbles: fieldSchema(FieldKinds.sequence, [iBubbleSchema.name]),
    },
});

export const AppStateSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppState-1.0.0"),
    localFields: {
        clients: fieldSchema(FieldKinds.sequence, [iClientSchema.name]),
    },
});

// TODO: Generate this from schema automatically instead of hand coding it.
export type BubbleTreeProxy = EditableTree & {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
};

// TODO: Generate this from schema automatically instead of hand coding it.
export type ClientTreeProxy = EditableTree & {
    clientId: string;
    color: string;
    bubbles: BubbleTreeProxy[];
};

// TODO: Generate this from schema automatically instead of hand coding it.
export type AppStateTreeProxy = EditableTree & {
    clients: ClientTreeProxy[];
};

export const rootAppStateSchema = fieldSchema(FieldKinds.value, [AppStateSchema.name]);

export const AppStateSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [numberSchema.name, numberSchema],
        [iBubbleSchema.name, iBubbleSchema],
        [iClientSchema.name, iClientSchema],
        [AppStateSchema.name, AppStateSchema],
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootAppStateSchema],
    ]),
};


