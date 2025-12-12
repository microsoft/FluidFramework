/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { schemaFormatV1 } from "../../core/index.js";
import { strictEnum, type Values } from "../../util/index.js";
import { EncodedFieldBatch } from "../chunked-forest/index.js";

/**
 * The format version for the forest.
 */
export const ForestFormatVersion = strictEnum("ForestFormatVersion", {
	v1: 1,
	/** This format supports incremental encoding */
	v2: 2,
});
export type ForestFormatVersion = Values<typeof ForestFormatVersion>;

export const validVersions = new Set([...Object.values(ForestFormatVersion)]);

export const FormatCommon = (
	version: ForestFormatVersion,
	// Return type is intentionally derived.
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
	Type.Object(
		{
			version: Type.Literal(version),
			keys: Type.Array(schemaFormatV1.FieldKeySchema),
			fields: EncodedFieldBatch,
		},
		{ additionalProperties: false },
	);
export type Format = Static<ReturnType<typeof FormatCommon>>;
