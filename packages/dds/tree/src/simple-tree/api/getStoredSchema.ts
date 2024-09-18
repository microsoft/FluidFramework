/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { encodeTreeSchema } from "../../feature-libraries/index.js";
import type { JsonCompatible } from "../../util/index.js";
import type { ImplicitFieldSchema } from "../schemaTypes.js";
import { toStoredSchema } from "../toFlexSchema.js";

/**
 * Dumps the "persisted" schema subset of `schema` into a deterministic JSON compatible semi-human readable but unspecified format.
 *
 * @remarks
 * This can be used to help inspect schema for debugging, and to save a snapshot of schema to help detect and review changes to an applications schema.
 *
 * This format may change across major versions of this package: such changes are considered breaking.
 * Beyond that, no compatibility guarantee is provided for this format: it should never be relied upon to load data, it should only be used for comparing outputs from this function.
 *
 * This only includes the "persisted" subset of schema information, which means the portion which gets included in documents.
 * It thus uses "persisted" keys, see {@link FieldProps.key}.
 *
 * If two schema have identical "persisted" schema, then they are considered {@link SchemaCompatibilityStatus.isEquivalent|equivalent}.
 *
 * @privateRemarks
 * This currently uses the schema summary format, but that could be changed to something more human readable (particularly if the encoded format becomes less human readable).
 * This intentionally does not leak the format types in the API.
 *
 * Public API surface uses "persisted" terminology while internally we use "stored".
 * @alpha
 */
export function extractPersistedSchema(schema: ImplicitFieldSchema): JsonCompatible {
	const stored = toStoredSchema(schema);
	return encodeTreeSchema(stored);
}
