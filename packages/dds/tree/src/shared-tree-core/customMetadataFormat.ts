/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { Static as TypeStatic } from "typebox";

import {
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	stringKeyRecord,
	typeboxOptional,
} from "../util/index.js";

/**
 * The persisted form of a {@link CustomMetadataTree}.
 * @privateRemarks
 * The property names (`m` for metadata, `c` for children) are abbreviated and both are optional because
 * this rides on every annotated op and occupies summary space for as long as its commit survives.
 */
export type EncodedCustomMetadataTree = TypeStatic<typeof EncodedCustomMetadataTree>;
export const EncodedCustomMetadataTree = Type.Cyclic(
	{
		EncodedCustomMetadataTree: Type.Object(
			{
				/** The metadata supplied by the transaction represented by this entry. */
				m: typeboxOptional(
					Type.Unsafe<JsonCompatibleReadOnlyObject>(
						stringKeyRecord(JsonCompatibleReadOnlySchema),
					),
				),
				/** The metadata trees of transactions nested within the transaction represented by this entry. */
				c: typeboxOptional(Type.Array(Type.Ref("EncodedCustomMetadataTree"))),
			},
			{ additionalProperties: false },
		),
	},
	"EncodedCustomMetadataTree",
);
