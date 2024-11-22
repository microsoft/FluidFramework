/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../util/index.js";
import type {
	TreeObjectNode,
	InsertableObjectFromSchemaRecord,
	SimpleKeyMap,
} from "./objectNode.js";
import type { ImplicitFieldSchema, FieldSchema } from "./schemaTypes.js";
import { NodeKind, type TreeNodeSchemaClass, type TreeNodeSchema } from "./core/index.js";
import type { FieldKey } from "../core/index.js";

/**
 * A schema for {@link TreeObjectNode}s.
 * @privateRemarks
 * This is a candidate for being promoted to the public package API.
 */
export interface ObjectNodeSchema<
	TName extends string = string,
	T extends
		RestrictiveStringRecord<ImplicitFieldSchema> = RestrictiveStringRecord<ImplicitFieldSchema>,
	ImplicitlyConstructable extends boolean = boolean,
> extends TreeNodeSchemaClass<
		TName,
		NodeKind.Object,
		TreeObjectNode<T, TName>,
		object & InsertableObjectFromSchemaRecord<T>,
		ImplicitlyConstructable,
		T
	> {
	/**
	 * From property keys to the associated schema.
	 */
	readonly fields: ReadonlyMap<string, FieldSchema>;
}

/**
 * Extra data provided on all {@link ObjectNodeSchema} that is not included in the (soon possibly public) ObjectNodeSchema type.
 */
export interface ObjectNodeSchemaInternalData {
	/**
	 * {@inheritdoc SimpleKeyMap}
	 */
	readonly flexKeyMap: SimpleKeyMap;

	/**
	 * Lookup the property keys from the stored keys.
	 */
	readonly storedKeyToPropertyKey: ReadonlyMap<FieldKey, string>;

	/**
	 * Stored keys which hold identifiers.
	 */
	readonly identifierFieldKeys: readonly FieldKey[];

	/**
	 * Whether to tolerate (and preserve) additional unknown optional fields in instances of this object node.
	 */
	readonly allowUnknownOptionalFields: boolean;
}

export const ObjectNodeSchema = {
	/**
	 * instanceof-based narrowing support for ObjectNodeSchema in Javascript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](value: TreeNodeSchema): value is ObjectNodeSchema {
		return isObjectNodeSchema(value);
	},
} as const;

export function isObjectNodeSchema(
	schema: TreeNodeSchema,
): schema is ObjectNodeSchema & ObjectNodeSchemaInternalData {
	return schema.kind === NodeKind.Object;
}
