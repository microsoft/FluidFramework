/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EditableTree,
	FieldKinds,
	rootFieldKey,
	ValueSchema,
	TypedSchema,
	SchemaAware,
	EditableField,
} from "@fluid-internal/tree";

// Aliases for conciseness
const { value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

export const stringSchema = tree({
	name: "String",
	value: ValueSchema.String,
});

export const numberSchema = tree({
	name: "number",
	value: ValueSchema.Number,
});

export const bubbleSchema = tree({
	name: "Test:BubbleBenchAppStateBubble-1.0.0",
	localFields: {
		x: field(value, numberSchema),
		y: field(value, numberSchema),
		r: field(value, numberSchema),
		vx: field(value, numberSchema),
		vy: field(value, numberSchema),
	},
});

export const clientSchema = tree({
	name: "Test:BubbleBenchAppStateClient-1.0.0",
	localFields: {
		clientId: field(value, stringSchema),
		color: field(value, stringSchema),
		bubbles: field(sequence, bubbleSchema),
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

export type FlexBubble = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Flexible,
	typeof bubbleSchema
>;
export type FlexClient = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Flexible,
	typeof clientSchema
>;

// TODO: Generate this from schema automatically instead of hand coding it.
export type ClientTreeProxy = EditableTree & {
	clientId: string;
	color: string;
	bubbles: BubbleTreeProxy[];
};

// TODO: Generate this from schema automatically instead of hand coding it.
export type ClientsField = EditableField & ClientTreeProxy[];

export const rootAppStateSchema = field(sequence, clientSchema);

export const appSchemaData = SchemaAware.typedSchemaData(
	new Map([[rootFieldKey, rootAppStateSchema]]),
	stringSchema,
	numberSchema,
	bubbleSchema,
	clientSchema,
);
