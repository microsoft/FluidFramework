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

export const stringSchema = tree("string", { value: ValueSchema.String });
export const numberSchema = tree("number", { value: ValueSchema.Number });

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

export const rootAppStateSchema = field(sequence, clientSchema);

export const appSchemaData = SchemaAware.typedSchemaData(
	new Map([[rootFieldKey, rootAppStateSchema]]),
	stringSchema,
	numberSchema,
	bubbleSchema,
	clientSchema,
);

type Typed<
	TSchema extends TypedSchema.LabeledTreeSchema,
	TMode extends SchemaAware.ApiMode = SchemaAware.ApiMode.Normalized,
> = SchemaAware.NodeDataFor<typeof appSchemaData, TMode, TSchema>;

// TODO: Generate this from schema automatically instead of hand coding it.
export type Bubble = EditableTree & NormalizedBubble;

export type NormalizedBubble = Typed<typeof bubbleSchema>;
export type NormalizedClient = Typed<typeof clientSchema>;

export type FlexBubble = Typed<typeof bubbleSchema, SchemaAware.ApiMode.Flexible>;
export type FlexClient = Typed<typeof clientSchema, SchemaAware.ApiMode.Flexible>;

// TODO: Generate this from schema automatically instead of hand coding it.
export type Client = EditableTree & {
	clientId: string;
	color: string;
	bubbles: EditableField & Bubble[];
};

// TODO: Generate this from schema automatically instead of hand coding it.
export type ClientsField = EditableField & Client[];
