/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-empty-interface */

import {
	FieldKinds,
	rootFieldKey,
	ValueSchema,
	TypedSchema,
	SchemaAware,
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
	[[rootFieldKey, rootAppStateSchema]],
	stringSchema,
	numberSchema,
	bubbleSchema,
	clientSchema,
);

type Typed<
	TSchema extends TypedSchema.LabeledTreeSchema,
	TMode extends SchemaAware.ApiMode = SchemaAware.ApiMode.Editable,
> = SchemaAware.NodeDataFor<typeof appSchemaData, TMode, TSchema>;

export type Bubble = Typed<typeof bubbleSchema>;
export type Client = Typed<typeof clientSchema>;

export type FlexBubble = Typed<typeof bubbleSchema, SchemaAware.ApiMode.Simple>;
export type FlexClient = Typed<typeof clientSchema, SchemaAware.ApiMode.Simple>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField
	extends SchemaAware.TypedField<
		typeof appSchemaData,
		SchemaAware.ApiMode.Editable,
		typeof rootAppStateSchema
	> {}
