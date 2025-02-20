/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
TypeScript generates d.ts files when compiling code with exports for use by another compilation unit (such as a package or project).

Importing types from these d.ts files type checks differently than importing the original source files directly.
There are a few different causes for this:

-   Tools post processing the d.ts files incorrectly, for example [this bug in API-Extractor](https://github.com/microsoft/rushstack/issues/4507) which tents to impact code using our schema system.
-   TypeScript itself intentionally choosing to have differences like how it handles [private properties interacting with generics](https://github.com/microsoft/TypeScript/issues/20979).
-   TypeScript bugs where the d.ts file is incorrect, for example [this one](https://github.com/microsoft/TypeScript/issues/55832) which makes most ways to do recursive schema emit `any` instead of a recursive type reference.
-   TypeScript bugs where the emitted type does not even type check, like [this one](https://github.com/microsoft/TypeScript/issues/58688) and [this one](https://github.com/microsoft/FluidFramework/pull/21299) found using our schema system. There is also a similar such bug breaking recursive Array and Map node d.ts files which has not been root caused yet.

With so many of these issues impacting schema generated with our schema system, explicitly testing for them makes sense.
Testing for these however requires producing and validating d.ts files, both of which are things tests normally don't do.

Additionally errors like `error TS2742: The inferred type of 'Inventory' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.` can occur when reexporting types imported from another package, but not when exporting references to types from the current compilation unit.

These also can't be tested for in regular tests.

To provide coverage for these cases, extra configuration is required.

This could be done via extra packages.
A package could be created which declares and exports some schema.
A second additional package could then be added to attempt to consume that schema.

Instead of all the boilerplate needed to do this, this package was reused to contain the code which generates the d.ts files,
and its tests are used to test importing them.
See ./test/importer.spec.ts for for the imports.

This could be part of the tree package and its tests,
however that is less representative of actual use, and thus fails to detect some issues which impact real users (like `error TS2742` see note  below).
*/

// This file is full of test exports to ensure the types using tree types can be exported.
// Requiring these to have docs seems unnecessary.
/* eslint-disable jsdoc/require-jsdoc */

import {
	SchemaFactory,
	TreeViewConfiguration,
	type NodeFromSchema,
	type ValidateRecursiveSchema,
	// To diagnose `error TS2742: The inferred type of ...` errors,
	// enable this import then look for use of it in the generated d.ts file fo find what needs to be moved out of InternalTypes
	// // eslint-disable-next-line unused-imports/no-unused-imports
	// InternalTypes,
} from "@fluidframework/tree";
import type { FixRecursiveArraySchema } from "@fluidframework/tree/alpha";

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

/**
 * Workaround to avoid
 * `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.` in the d.ts file.
 */
export declare const _RecursiveArrayWorkaround: FixRecursiveArraySchema<typeof RecursiveArray>;
export class RecursiveArray extends schema.arrayRecursive("RA", [() => RecursiveArray]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
}
