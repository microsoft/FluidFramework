/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../util/index.js";
import type {
	TreeObjectNode,
	SimpleKeyMap,
	InsertableObjectFromAnnotatedSchemaRecord,
} from "./objectNode.js";
import type {
	FieldSchemaAlpha,
	ImplicitAnnotatedFieldSchema,
	UnannotateSchemaRecord,
} from "./schemaTypes.js";
import { NodeKind, type TreeNodeSchemaClass, type TreeNodeSchema } from "./core/index.js";
import type { FieldKey } from "../core/index.js";
import type { SimpleObjectFieldSchema, SimpleObjectNodeSchema } from "./simpleSchema.js";

/**
 * A schema for {@link TreeObjectNode}s.
 * @sealed
 * @alpha
 */
export interface ObjectNodeSchema<
	out TName extends string = string,
	in out T extends
		RestrictiveStringRecord<ImplicitAnnotatedFieldSchema> = RestrictiveStringRecord<ImplicitAnnotatedFieldSchema>,
	ImplicitlyConstructable extends boolean = boolean,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Object,
			TreeObjectNode<UnannotateSchemaRecord<T>, TName>,
			InsertableObjectFromAnnotatedSchemaRecord<T>,
			ImplicitlyConstructable,
			T,
			never,
			TCustomMetadata
		>,
		SimpleObjectNodeSchema<TCustomMetadata> {
	/**
	 * From property keys to the associated schema.
	 */
	readonly fields: ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema>;
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

/**
 * @alpha
 */
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
