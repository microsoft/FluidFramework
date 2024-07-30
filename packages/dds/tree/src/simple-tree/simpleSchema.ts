/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Kind of {@link TreeNodeSchema}.
 * @alpha
 */
export type SimpleNodeSchemaKind = "object" | "array" | "map" | "leaf";

/**
 * TODO
 */
export type SimpleFieldSchemaKind = "optional" | "required" | "identifier";

/**
 * TODO
 */
export type SimpleLeafSchemaKind = "string" | "number" | "boolean" | "null" | "fluid-handle";

/**
 * TODO
 */
export interface SimpleNodeSchemaBase<TNodeKind extends SimpleNodeSchemaKind> {
	readonly kind: TNodeKind;
}

/**
 * TODO
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<"object"> {
	readonly fields: Record<string, SimpleFieldSchema>;
}

/**
 * TODO
 */
export interface SimpleArrayNodeSchema extends SimpleNodeSchemaBase<"array"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 */
export interface SimpleMapNodeSchema extends SimpleNodeSchemaBase<"map"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBase<"leaf"> {
	readonly type: SimpleLeafSchemaKind;
}

/**
 * TODO
 */
export type SimpleNodeSchema =
	| SimpleLeafNodeSchema
	| SimpleMapNodeSchema
	| SimpleArrayNodeSchema
	| SimpleObjectNodeSchema;

/**
 * TODO
 */
export interface SimpleFieldSchema {
	readonly kind: SimpleFieldSchemaKind;
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 * @privateRemarks
 * Currently assumes root field is required.
 * TODO: verify this is true in simple tree world.
 */
export interface SimpleTreeSchema {
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;
	readonly allowedTypes: ReadonlySet<string>;
}
