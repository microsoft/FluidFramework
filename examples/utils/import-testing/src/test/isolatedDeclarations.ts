/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Users of Fluid may want to enable the TypeScript compiler flag `isolatedDeclarations`:
 * https://www.typescriptlang.org/tsconfig/#isolatedDeclarations.
 * This flag is added in TypeScript 5.5 (which is newer that what we compile with by default)
 * and thus requires special setup to validate.
 * See ./build.spec.ts for the test which validates this.
 *
 * Note that as demonstrated in this file, while it is possible to use tree schema with `isolatedDeclarations`, its is not particularly nice to do so.
 * Consider using the `eraseSchemaDetails` pattern to encapsulate much of the schema as possible to reduce the amount of impacted code.
 *
 * Another options is avoiding using `isolatedDeclarations` for schema.
 * This can be done by putting the schema in a separate TypeScript project with a ts-config file that disables `isolatedDeclarations`.
 * This can be done within the same package, and roughly amounts to using TypeScripts ability to generate d.ts files
 * to generate the extra boilerplate automatically.
 */

// This file is full of test exports to ensure the types using tree types can be exported.
// Requiring these to have docs seems unnecessary.
/* eslint-disable jsdoc/require-jsdoc */

// This lint is a poor fit for code using isolatedDeclarations since it recommends a pattern isolatedDeclarations bans.
/* eslint-disable @typescript-eslint/consistent-generic-constructors */

import {
	SchemaFactory,
	type NodeFromSchema,
	FieldKind,
	FieldSchema,
} from "@fluidframework/tree";
import {
	allowUnused,
	eraseSchemaDetails,
	eraseSchemaDetailsSubclassable,
	SchemaFactoryAlpha,
	TreeBeta,
} from "@fluidframework/tree/alpha";
import type {
	ErasedSchema,
	ErasedNode,
	ErasedSchemaSubclassable,
	TreeNodeSchema,
	ObjectNodeSchema,
	ObjectNodeSchemaWorkaround,
} from "@fluidframework/tree/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import type { requireAssignableTo } from "@fluidframework/tree/internal";

// -------------------------------------- //
// Show schema factories can be exported
export const schema: SchemaFactory<"com.example"> = new SchemaFactory("com.example");
export const schemaAlpha: SchemaFactoryAlpha<"com.example"> = new SchemaFactoryAlpha(
	"com.example",
);

// -------------------------------------- //
// A Basic Object schema:

// Field types must be stated explicitly — isolatedDeclarations prevents inferring output types from runtime values.
// Tree schema was designed to avoid this duplication, so it's a minor limitation, but manageable in practice.
// Note: LeafSchema and SchemaStatics are a @system types, so we avoid using them here.
const basicObject_fields: { x: SchemaFactory["number"] } = {
	x: SchemaFactory.number,
} as const;

// isolatedDeclarations bans inline base class definitions, so the base must be a separate variable.
// Unlike with API-extractor, it doesn't need to be exported.
// The type and runtime versions of `fields` can be inlined here if desired, but doing so may produce less clear error messages for mistakes in them.
const BasicObject_Base: ObjectNodeSchemaWorkaround<
	"com.example.Base",
	typeof basicObject_fields,
	true
> = schemaAlpha.objectAlpha("Base", basicObject_fields);
export class BasicObject extends BasicObject_Base {}

export const basic: BasicObject = new BasicObject({ x: 0 });

// There is a known issue where this can fail, see https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693.
// Because of that known issue, we are doing a sanity check here to make sure ObjectNodeSchemaWorkaround's workaround is working.
allowUnused<requireAssignableTo<typeof BasicObject_Base, ObjectNodeSchema>>();

// -------------------------------------- //
// An optional field:

const optionalDemo_fields: {
	x: FieldSchema<FieldKind.Optional, SchemaFactory["number"]>;
} = {
	x: SchemaFactory.optional(SchemaFactory.number),
} as const;

const OptionalDemo_Base: ObjectNodeSchemaWorkaround<
	"com.example.OptionalDemo",
	typeof optionalDemo_fields,
	true
> = schemaAlpha.objectAlpha("OptionalDemo", optionalDemo_fields);
export class OptionalDemo extends OptionalDemo_Base {}

export const optionalDemo: OptionalDemo = new OptionalDemo({});

// -------------------------------------- //
// Schema Type erasure demo
class PrivateSchema extends schema.object("Private", {}) {}
class SquareInternal
	extends schema.object("Demo", { hidden: schema.number, extra: PrivateSchema })
	implements SquareNode
{
	public get area(): number {
		return this.hidden * this.hidden;
	}

	public static create(sideLength: number): SquareInternal {
		return new SquareInternal({ hidden: sideLength, extra: new PrivateSchema({}) });
	}
}

export interface SquareNode {
	readonly area: number;
}

export interface SquareSchema {
	create(sideLength: number): Square;
}

// Does not leak SquareInternal or PrivateSchema types into API.
export const Square: SquareSchema & ErasedSchema<Square> = eraseSchemaDetails<
	Square,
	SquareSchema
>()(SquareInternal);
export type Square = ErasedNode<SquareNode, "com.example.Demo">;

class SquareInternal2
	extends schema.object("Demo", { hidden: schema.number })
	implements SquareNode
{
	public get area(): number {
		return this.hidden * this.hidden;
	}

	public static create<TThis extends TreeNodeSchema>(
		this: TThis,
		sideLength: number,
	): NodeFromSchema<TThis> {
		const instance = TreeBeta.create(this as unknown as typeof SquareInternal2, {
			hidden: sideLength,
		}) as unknown as NodeFromSchema<TThis>;
		return instance;
	}
}

export interface SquareSchemaSubclassable {
	create<TThis extends TreeNodeSchema>(this: TThis, sideLength: number): NodeFromSchema<TThis>;
}

export const SquareSubclassable: SquareSchemaSubclassable &
	ErasedSchemaSubclassable<SquareNode, "com.example.Demo"> = eraseSchemaDetailsSubclassable<
	Square,
	SquareSchemaSubclassable
>()(SquareInternal2);
