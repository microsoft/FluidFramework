/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isReadonlyArray } from "../util/index.js";
import {
	AllowedTypes,
	FieldKind,
	FieldSchema,
	type ImplicitAllowedTypes,
	ImplicitFieldSchema,
} from "./schemaTypes.js";

/**
 * Normalizes a {@link ImplicitFieldSchema} to a {@link FieldSchema}.
 */
export function normalizeFieldSchema(
	schema: ImplicitFieldSchema,
): FieldSchema<FieldKind, AllowedTypes> {
	return schema instanceof FieldSchema
		? new FieldSchema(schema.kind, normalizeAllowedTypes(schema.allowedTypes))
		: new FieldSchema(FieldKind.Required, normalizeAllowedTypes(schema));
}

/**
 * Normalizes a {@link ImplicitAllowedTypes} to a {@link AllowedTypes}.
 */
export function normalizeAllowedTypes(types: ImplicitAllowedTypes): AllowedTypes {
	return isReadonlyArray(types) ? types : [types];
}
