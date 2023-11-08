/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-empty-interface */

import { SchemaAware, SchemaBuilder, Typed, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "bubble-bench" });

export const bubbleSchema = builder.object("BubbleBenchAppStateBubble-1.0.0", {
	x: leaf.number,
	y: leaf.number,
	r: leaf.number,
	vx: leaf.number,
	vy: leaf.number,
});

export const clientSchema = builder.object("BubbleBenchAppStateClient-1.0.0", {
	clientId: leaf.string,
	color: leaf.string,
	bubbles: builder.sequence(bubbleSchema),
});

export const rootAppStateSchema = SchemaBuilder.sequence(clientSchema);

export const appSchemaData = builder.intoSchema(rootAppStateSchema);

export type Bubble = Typed<typeof bubbleSchema>;
export type Client = Typed<typeof clientSchema>;

export type FlexBubble = SchemaAware.TypedNode<typeof bubbleSchema, SchemaAware.ApiMode.Simple>;
export type FlexClient = SchemaAware.TypedNode<typeof clientSchema, SchemaAware.ApiMode.Simple>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField extends Typed<typeof rootAppStateSchema> {}
