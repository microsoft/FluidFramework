/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AllowedUpdateType,
	TypedNode,
	SchemaBuilder,
	buildTreeConfiguration,
} from "@fluid-experimental/tree2";

const schemaBuilder = new SchemaBuilder({ scope: "fc1db2e8-0a00-11ee-be56-0242ac120002" });

export const position = schemaBuilder.object("position", {
	x: schemaBuilder.number,
	y: schemaBuilder.number,
});

export const letter = schemaBuilder.object("letter", {
	position,
	character: schemaBuilder.string,
	id: schemaBuilder.string,
});

export const app = schemaBuilder.object("app", {
	letters: schemaBuilder.list(letter),
	word: schemaBuilder.list(letter),
});

export type App = TypedNode<typeof app>;
export type Letter = TypedNode<typeof letter>;
export type Position = TypedNode<typeof position>;

export const appSchema = schemaBuilder.intoSchema(app);

export const appSchemaConfig = buildTreeConfiguration({
	schema: appSchema,
	initialTree: {
		letters: { "": [] },
		word: { "": [] },
	},
	allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
});
