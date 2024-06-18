/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is full of test exports to ensure the types can be exported, not actually thing anyone will import.
/* eslint-disable jsdoc/require-jsdoc */

import {
	SchemaFactory,
	TreeViewConfiguration,
	type NodeFromSchema,
	type ValidateRecursiveSchema,
	// To diagnose `error TS2742: The inferred type of ...` errors,
	// enable this import then look for use of it in the generated d.ts file fo find what needs to be moved out of InternalTypes
	// eslint-disable-next-line unused-imports/no-unused-imports
	// InternalTypes,
} from "@fluidframework/tree";

// Due to limitation of the TypeScript compiler, errors like the following can be produced when exporting types from another package:
// error TS2742: The inferred type of 'Inventory' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.
// Tree needs tests to make sure it does not trigger such errors, but they can't easily be done from within the tree package.
// Thus tests for this case are included here, in a package which uses tree.

export const schema = new SchemaFactory("com.example");

export const leafAlias = schema.number;

export class Point extends schema.object("Point", {
	x: schema.number,
}) {}

export class Note extends schema.object("Note", {
	text: schema.string,
	location: schema.optional(Point),
}) {}

export class NodeMap extends schema.map("NoteMap", Note) {}
export class NodeList extends schema.array("NoteList", Note) {}

export class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

export const POJO = schema.object("POJO", { stuff: [NodeMap, NodeList] });
export type POJO = NodeFromSchema<typeof POJO>;

export const config = new TreeViewConfiguration({ schema: Canvas });

// Recursive cases
// This lint rule doesn't work well with our schema when using the lazy format
/* eslint-disable @typescript-eslint/explicit-function-return-type */

export class RecursiveObject extends schema.objectRecursive("RO", {
	x: [() => RecursiveObject, schema.number],
}) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveObject>;
}

export const recursiveField = schema.optionalRecursive([() => RecursiveObject, schema.number]);

export class RecursiveMap extends schema.mapRecursive("RM", [() => RecursiveMap]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveMap>;
}

export class RecursiveArray extends schema.arrayRecursive("RA", [() => RecursiveArray]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
}

/* eslint-enable @typescript-eslint/explicit-function-return-type */
