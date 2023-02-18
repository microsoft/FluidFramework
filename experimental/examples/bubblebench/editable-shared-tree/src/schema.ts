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

export const stringSchema = tree("String", {
	value: ValueSchema.String,
});

export const numberSchema = tree("number", {
	value: ValueSchema.Number,
});

export const bubbleSchema = tree("BubbleBenchAppStateBubble-1.0.0", {
	local: {
		x: field(value, numberSchema),
		y: field(value, numberSchema),
		r: field(value, numberSchema),
		vx: field(value, numberSchema),
		vy: field(value, numberSchema),
	},
});

export const clientSchema = tree("BubbleBenchAppStateClient-1.0.0", {
	local: {
		clientId: field(value, stringSchema),
		color: field(value, stringSchema),
		bubbles: field(sequence, bubbleSchema),
	},
});

// TODO: Generate this from schema automatically instead of hand coding it.
export type BubbleTreeProxy = EditableTree & NormalizedBubble;

export type FlexBubble = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Flexible,
	typeof bubbleSchema
>;

export type NormalizedBubble = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Normalized,
	typeof bubbleSchema
>;

export type FlexClient = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Flexible,
	typeof clientSchema
>;

export type NormalizedClient = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Normalized,
	typeof clientSchema
>;

// TODO: Generate this from schema automatically instead of hand coding it.
export type ClientTreeProxy = EditableTree & {
	clientId: string;
	color: string;
	bubbles: EditableField & BubbleTreeProxy[];
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
