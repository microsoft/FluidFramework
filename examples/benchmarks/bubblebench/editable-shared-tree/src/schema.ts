/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-empty-interface */

import { ValueSchema, SchemaAware, SchemaBuilder } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder("bubble-bench");

export const stringSchema = builder.primitive("string", ValueSchema.String);
export const numberSchema = builder.primitive("number", ValueSchema.Number);

export const bubbleSchema = builder.object("BubbleBenchAppStateBubble-1.0.0", {
	local: {
		x: SchemaBuilder.fieldValue(numberSchema),
		y: SchemaBuilder.fieldValue(numberSchema),
		r: SchemaBuilder.fieldValue(numberSchema),
		vx: SchemaBuilder.fieldValue(numberSchema),
		vy: SchemaBuilder.fieldValue(numberSchema),
	},
});

export const clientSchema = builder.object("BubbleBenchAppStateClient-1.0.0", {
	local: {
		clientId: SchemaBuilder.fieldValue(stringSchema),
		color: SchemaBuilder.fieldValue(stringSchema),
		bubbles: SchemaBuilder.fieldSequence(bubbleSchema),
	},
});

export const rootAppStateSchema = SchemaBuilder.fieldSequence(clientSchema);

export const appSchemaData = builder.intoDocumentSchema(rootAppStateSchema);

export type Bubble = SchemaAware.TypedNode<typeof bubbleSchema>;
export type Client = SchemaAware.TypedNode<typeof clientSchema>;

export type FlexBubble = SchemaAware.TypedNode<typeof bubbleSchema, SchemaAware.ApiMode.Simple>;
export type FlexClient = SchemaAware.TypedNode<typeof clientSchema, SchemaAware.ApiMode.Simple>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField
	extends SchemaAware.TypedField<SchemaAware.ApiMode.Editable, typeof rootAppStateSchema> {}
