/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey } from "../../../core/index.js";
import type { RestrictiveStringRecord } from "../../../util/index.js";
import {
	NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaCorePrivate,
} from "../../core/index.js";
import type { FieldSchemaAlpha, ImplicitFieldSchema } from "../../fieldSchema.js";
import type {
	SchemaType,
	SimpleObjectFieldSchema,
	SimpleObjectNodeSchema,
} from "../../simpleSchema.js";

import type {
	InsertableObjectFromSchemaRecordAlpha,
	SimpleKeyMap,
	TreeObjectNode,
} from "./objectNode.js";

/**
 * {@link (ObjectNodeSchema:interface)} with a workaround to avoid a specific known TypeScript issue which causes it to not be assignable to itself in some cases.
 * @remarks
 * If dealing with a schema whose inferred type includes this workaround (because it was produced by a schema factory API which uses it),
 * if you need to explicitly state that type (for example when using {@link https://www.typescriptlang.org/tsconfig/#isolatedDeclarations | isolatedDeclarations}), it is best to keep this workaround.
 * No other case should need to refer to this workaround type directly.
 * See {@link ObjectNodeSchemaWorkaround.createFromInsertable} for details.
 * @sealed
 * @alpha
 */
export type ObjectNodeSchemaWorkaround<
	TName extends string = string,
	T extends
		RestrictiveStringRecord<ImplicitFieldSchema> = RestrictiveStringRecord<ImplicitFieldSchema>,
	ImplicitlyConstructable extends boolean = boolean,
	TCustomMetadata = unknown,
> = ObjectNodeSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> & {
	/**
	 * Typing checking workaround: not for for actual use.
	 * @remarks
	 * This API collides with {@link TreeNodeSchemaCore.createFromInsertable} to disable a type checking optimization which produces different and undesired results.
	 * See {@link https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693} for more details.
	 *
	 * The specific issue here is non-empty POJO mode object schema not being assignable to `ObjectNodeSchema`,
	 * @privateRemarks
	 * See the above link and the tests in objectNode.spec.ts which reference it.
	 * @system
	 */
	readonly createFromInsertable: unknown;
};

/**
 * A schema for {@link TreeObjectNode}s.
 * @sealed
 * @alpha
 */
export interface ObjectNodeSchema<
	out TName extends string = string,
	in out T extends
		RestrictiveStringRecord<ImplicitFieldSchema> = RestrictiveStringRecord<ImplicitFieldSchema>,
	ImplicitlyConstructable extends boolean = boolean,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Object,
			TreeObjectNode<T, TName>,
			object & InsertableObjectFromSchemaRecordAlpha<T>,
			ImplicitlyConstructable,
			T,
			never,
			TCustomMetadata
		>,
		SimpleObjectNodeSchema<SchemaType.View, TCustomMetadata> {
	/**
	 * From property keys to the associated schema.
	 */
	readonly fields: ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema>;
}

/**
 * Extra data provided on all {@link ObjectNodeSchema} that is not included in the (soon possibly public) ObjectNodeSchema type.
 */
export interface ObjectNodeSchemaInternalData extends TreeNodeSchemaCorePrivate {
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

/**
 * {@link ObjectNodeSchema} with data that is not part of the package-exported API surface.
 */
export type ObjectNodeSchemaPrivate = ObjectNodeSchema &
	ObjectNodeSchemaInternalData &
	TreeNodeSchemaCorePrivate;

export function isObjectNodeSchema(schema: TreeNodeSchema): schema is ObjectNodeSchemaPrivate {
	return schema.kind === NodeKind.Object;
}
