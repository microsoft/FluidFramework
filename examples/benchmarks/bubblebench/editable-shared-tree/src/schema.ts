/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-empty-interface */

import {
	SchemaAware,
	SchemaBuilderBase,
	FlexTreeTyped,
	leaf,
	FieldKinds,
	TreeFieldSchema,
} from "@fluid-experimental/tree2";

const builder = new SchemaBuilderBase(FieldKinds.required, { scope: "bubble-bench" });

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
	bubbles: TreeFieldSchema.create(FieldKinds.sequence, [bubbleSchema]),
});

export const rootAppStateSchema = TreeFieldSchema.create(FieldKinds.sequence, [clientSchema]);

export const appSchemaData = builder.intoSchema(rootAppStateSchema);

export type Bubble = FlexTreeTyped<typeof bubbleSchema>;
export type Client = FlexTreeTyped<typeof clientSchema>;

export type FlexBubble = SchemaAware.TypedNode<typeof bubbleSchema>;
export type FlexClient = SchemaAware.TypedNode<typeof clientSchema>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField extends FlexTreeTyped<typeof rootAppStateSchema> {}
