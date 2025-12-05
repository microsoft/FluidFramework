/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { schemaFormatV1 } from "../../core/index.js";
import { brand, type Brand } from "../../util/index.js";
import { EncodedFieldBatch } from "../chunked-forest/index.js";

/**
 * The format version for the forest.
 */
export const ForestFormatVersion = {
	v1: 1,
} as const;
export type ForestFormatVersion = Brand<
	(typeof ForestFormatVersion)[keyof typeof ForestFormatVersion],
	"ForestFormatVersion"
>;

const FormatGeneric = (
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

export const FormatV1 = FormatGeneric(brand<ForestFormatVersion>(ForestFormatVersion.v1));
export type FormatV1 = Static<typeof FormatV1>;
