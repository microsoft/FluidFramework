/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Handle "Any"

// JSON Schema
// - Map policy
// - FluidHandle policy
// - How to represent types (for type disambiguation)
//    - Allow only annotating types when required for disambiguation.
//    - Root (type) is maybe special

// Future:
// - For API where you can get this for a view schema, configuration options for which field names to use (stored or view) and plan for future config options.

/**
 * @internal
 */
export type SimpleNodeSchemaKind = "object" | "array" | "map" | "leaf";

/**
 * @internal
 */
export type SimpleFieldSchemaKind = "optional" | "required" | "identifier";

/**
 * @internal
 */
export type SimpleLeafSchemaKind = "string" | "number" | "boolean" | "null" | "fluid-handle";

/**
 * @internal
 */
export interface SimpleNodeSchemaBase<TNodeKind extends SimpleNodeSchemaKind> {
	readonly kind: TNodeKind;
}

/**
 * @internal
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<"object"> {
	readonly fields: Record<string, SimpleFieldSchema>;
}

/**
 * @internal
 */
export interface SimpleArrayNodeSchema extends SimpleNodeSchemaBase<"array"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * @internal
 */
export interface SimpleMapNodeSchema extends SimpleNodeSchemaBase<"map"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * @internal
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBase<"leaf"> {
	readonly type: SimpleLeafSchemaKind;
}

/**
 * @internal
 */
export type SimpleNodeSchema =
	| SimpleLeafNodeSchema
	| SimpleMapNodeSchema
	| SimpleArrayNodeSchema
	| SimpleObjectNodeSchema;

/**
 * TODO
 * @internal
 */
export interface SimpleFieldSchema {
	readonly kind: SimpleFieldSchemaKind;
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 * @privateRemarks Currently assumes root field is required. TODO: verify this is true in simple tree world.
 * @internal
 */
export interface SimpleTreeSchema {
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;
	readonly allowedTypes: ReadonlySet<string>;
}
