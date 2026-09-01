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
 * @remarks
 * The property names (`m` for metadata, `c` for children) are abbreviated and both are optional because
 * this rides on every annotated op and occupies summary space for as long as its commit survives.
 */
// Declared as a type alias rather than an interface so that it satisfies the index signature of
// `JsonCompatibleReadOnlyObject`, which the encoded message and summary types are constrained to.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodedCustomMetadataTree = {
	readonly m?: JsonCompatibleReadOnlyObject;
	readonly c?: readonly EncodedCustomMetadataTree[];
};

export const EncodedCustomMetadataTree = Type.Recursive((Self) =>
	Type.Object(
		{
			m: Type.Optional(
				Type.Unsafe<JsonCompatibleReadOnlyObject>(
					Type.Record(Type.String(), JsonCompatibleReadOnlySchema),
				),
			),
			c: Type.Optional(Type.Array(Self)),
		},
		{ additionalProperties: false },
	),
) as unknown as Type.TSchema;
