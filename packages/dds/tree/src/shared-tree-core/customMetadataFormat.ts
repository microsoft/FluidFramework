/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";

import {
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
} from "../util/index.js";

/**
 * The persisted form of a {@link CustomMetadataTree}.
 * @privateRemarks
 * The property names (`m` for metadata, `c` for children) are abbreviated and both are optional because
 * this rides on every annotated op and occupies summary space for as long as its commit survives.
 */
export type EncodedCustomMetadataTree = Type.Static<typeof EncodedCustomMetadataTree>;
export const EncodedCustomMetadataTree = Type.Recursive((Self) =>
	Type.Object(
		{
			/** The metadata supplied by the transaction represented by this entry. */
			m: Type.Optional(
				Type.Unsafe<JsonCompatibleReadOnlyObject>(
					Type.Record(Type.String(), JsonCompatibleReadOnlySchema),
				),
			),
			/** The metadata trees of transactions nested within the transaction represented by this entry. */
			c: Type.Optional(Type.Array(Self)),
		},
		{ additionalProperties: false },
	),
);
