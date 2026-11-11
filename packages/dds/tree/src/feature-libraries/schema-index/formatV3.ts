/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { TObjectOptions, Static } from "typebox";

import { SchemaFormatVersion, schemaFormatV2 } from "../../core/index.js";
import { stringKeyRecord } from "../../util/index.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

/**
 * Defines an experimental stored schema format with application-defined versions.
 *
 * @remarks
 * Extends V2 by changing the version discriminator to `"schemaVersion"` and adding an optional `schemaVersion` array.
 * The node and root field formats are unchanged, so their encoding and decoding can reuse V2.
 *
 * The new array contains library identifier and version pairs, sorted by identifier with no duplicates for deterministic encoding.
 * The decoder validates that order and checks that every version is a non-negative safe integer.
 * An omitted array means no application-defined versions, while an empty array preserves an explicitly empty version map.
 */
export const Format = Type.Object(
	{
		version: Type.Literal(SchemaFormatVersion.v3Experimental),
		nodes: stringKeyRecord(schemaFormatV2.TreeNodeSchemaDataFormat),
		root: schemaFormatV2.FieldSchemaFormat,
		schemaVersion: Type.Optional(
			Type.Array(Type.Tuple([Type.String(), Type.Integer({ minimum: 0 })])),
		),
	},
	noAdditionalProps,
);
export type Format = Static<typeof Format>;
