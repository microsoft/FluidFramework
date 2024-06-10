/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
export interface AllowedTypeIncompatibility {
	identifier: string;
	mismatch: "allowedTypes";
	/**
	 * List of allowed type identifiers in viewed schema
	 */
	view: string[];
	/**
	 * List of allowed type identifiers in stored schema
	 */
	stored: string[];
}

/**
 * @public
 */
export type SchemaFactoryFieldKind = "required" | "optional" | "array" | "identifier";

/**
 * @public
 */
export interface FieldKindIncompatibility {
	identifier: string;
	mismatch: "fieldKind";
	view: SchemaFactoryFieldKind | undefined;
	stored: SchemaFactoryFieldKind | undefined;
}

/**
 * @public
 */
export type FieldIncompatibility = AllowedTypeIncompatibility | FieldKindIncompatibility;

/**
 * @public
 */
export type SchemaFactoryNodeKind = "object" | "array" | "map";

/**
 * @public
 */
export interface NodeKindIncompatibility {
	identifier: string;
	mismatch: "nodeKind";
	view: SchemaFactoryNodeKind | undefined;
	stored: SchemaFactoryNodeKind | undefined;
}

/**
 * @public
 */
export interface NodeFieldsIncompatibility {
	identifier: string;
	mismatch: "fields";
	differences: FieldIncompatibility[];
}

/**
 * @public
 */
export type NodeIncompatibility = NodeKindIncompatibility | NodeFieldsIncompatibility;

/**
 * @public
 */
export type Incompatibility = FieldIncompatibility | NodeIncompatibility;
