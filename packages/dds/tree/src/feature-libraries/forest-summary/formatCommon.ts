/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { versionField } from "../../codec/index.js";
import { schemaFormatV1 } from "../../core/index.js";
import { strictEnum, type Values, JsonCompatibleReadOnlySchema } from "../../util/index.js";

/**
 * The format version for the forest.
 */
export const ForestFormatVersion = strictEnum("ForestFormatVersion", {
	v1: 1,
	/** This format is the same as v1, and was added at the same time as incremental encoding for reasons that no longer apply */
	v2: 2,
});
export type ForestFormatVersion = Values<typeof ForestFormatVersion>;

/**
 * Format used by {@link ForestFormatVersion.v1} and {@link ForestFormatVersion.v2}.
 */
export const FormatCommon = Type.Object(
	{
		...versionField,
		keys: Type.Array(schemaFormatV1.FieldKeySchema),
		fields: JsonCompatibleReadOnlySchema, // Uses field batch codec
	},
	{ additionalProperties: false },
);
export type FormatCommon = Static<typeof FormatCommon>;
