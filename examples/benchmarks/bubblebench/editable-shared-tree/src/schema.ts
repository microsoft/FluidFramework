/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-empty-interface */

import { SchemaAware, SchemaBuilder, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "bubble-bench", libraries: [leaf.library] });

export const bubbleSchema = builder.struct("BubbleBenchAppStateBubble-1.0.0", {
	x: SchemaBuilder.fieldRequired(leaf.number),
	y: SchemaBuilder.fieldRequired(leaf.number),
	r: SchemaBuilder.fieldRequired(leaf.number),
	vx: SchemaBuilder.fieldRequired(leaf.number),
	vy: SchemaBuilder.fieldRequired(leaf.number),
});

export const clientSchema = builder.struct("BubbleBenchAppStateClient-1.0.0", {
	clientId: SchemaBuilder.fieldRequired(leaf.string),
	color: SchemaBuilder.fieldRequired(leaf.string),
	bubbles: SchemaBuilder.fieldSequence(bubbleSchema),
});

export const rootAppStateSchema = SchemaBuilder.fieldSequence(clientSchema);

export const appSchemaData = builder.toDocumentSchema(rootAppStateSchema);

export type Bubble = SchemaAware.TypedNode<typeof bubbleSchema>;
export type Client = SchemaAware.TypedNode<typeof clientSchema>;

export type FlexBubble = SchemaAware.TypedNode<typeof bubbleSchema, SchemaAware.ApiMode.Simple>;
export type FlexClient = SchemaAware.TypedNode<typeof clientSchema, SchemaAware.ApiMode.Simple>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField extends SchemaAware.TypedField<typeof rootAppStateSchema> {}
