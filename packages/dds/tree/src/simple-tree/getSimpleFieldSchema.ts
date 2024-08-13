/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FlexFieldSchema } from "../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	type FieldSchema,
	normalizeFieldSchema,
} from "./schemaTypes.js";

/**
 * A symbol for storing {@link FieldSchema}s on a {@link FlexFieldSchema}.
 */
const simpleFieldSchemaSymbol: unique symbol = Symbol(`simpleFieldSchema`);

/**
 * Gets the {@link FieldSchema} which corresponds with the provided {@link FlexFieldSchema | flexSchema}.
 * Caches the result on the provided `flexSchema` for future access.
 * @param flexSchema - The flex schema on which the result will be cached.
 * @param implicitSimpleSchema - The allowed types from which the `FieldSchema` will be derived.
 */
export function getSimpleFieldSchema(
	flexSchema: FlexFieldSchema,
	implicitSimpleSchema: ImplicitFieldSchema,
): FieldSchema {
	if (simpleFieldSchemaSymbol in flexSchema) {
		return flexSchema[simpleFieldSchemaSymbol] as FieldSchema;
	}

	const fieldSchema = normalizeFieldSchema(implicitSimpleSchema);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(flexSchema as any)[simpleFieldSchemaSymbol] = fieldSchema;
	return fieldSchema;
}
