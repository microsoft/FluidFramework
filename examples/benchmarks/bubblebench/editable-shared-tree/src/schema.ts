/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */

import {
	FieldKinds,
	FlexFieldSchema,
	FlexTreeTypedField,
	FlexTreeTypedNode,
	InsertableFlexNode,
	SchemaBuilderBase,
	leaf,
} from "@fluidframework/tree";

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
	bubbles: FlexFieldSchema.create(FieldKinds.sequence, [bubbleSchema]),
});

export const rootAppStateSchema = FlexFieldSchema.create(FieldKinds.sequence, [clientSchema]);

export const appSchemaData = builder.intoSchema(rootAppStateSchema);

export type Bubble = FlexTreeTypedNode<typeof bubbleSchema>;
export type Client = FlexTreeTypedNode<typeof clientSchema>;

export type FlexBubble = InsertableFlexNode<typeof bubbleSchema>;
export type FlexClient = InsertableFlexNode<typeof clientSchema>;

// TODO: experiment with this interface pattern. Maybe it makes better intellisense and errors?
// TODO: Intellisense is pretty bad here if not using interface.
export interface ClientsField extends FlexTreeTypedField<typeof rootAppStateSchema> {}
