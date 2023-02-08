/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    brand,
    emptyField,
    FieldKinds,
    fieldSchema,
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
    value: ValueSchema.Number,
});

export const bubbleSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateBubble-1.0.0"),
    localFields: {
        x: fieldSchema(FieldKinds.value, [numberSchema.name]),
        y: fieldSchema(FieldKinds.value, [numberSchema.name]),
        r: fieldSchema(FieldKinds.value, [numberSchema.name]),
        vx: fieldSchema(FieldKinds.value, [numberSchema.name]),
        vy: fieldSchema(FieldKinds.value, [numberSchema.name]),
    },
});

export const clientSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateClient-1.0.0"),
    localFields: {
        clientId: fieldSchema(FieldKinds.value, [stringSchema.name]),
        color: fieldSchema(FieldKinds.value, [stringSchema.name]),
        bubbles: fieldSchema(FieldKinds.sequence, [bubbleSchema.name]),
    },
});


export const appStateSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppState-1.0.0"),
    localFields: {
        clients: fieldSchema(FieldKinds.sequence, [clientSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const rootAppStateSchema = fieldSchema(FieldKinds.value, [
    appStateSchema.name,
]);

export const appStateSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [numberSchema.name, numberSchema],
        [bubbleSchema.name, bubbleSchema],
        [clientSchema.name, clientSchema],
        [appStateSchema.name, appStateSchema],
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootAppStateSchema],
    ]),
};
