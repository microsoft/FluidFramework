/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import {
	SimpleFieldSchemaFormat,
	SimpleSchemaDefinitionsFormat,
} from "./simpleSchemaFormatV1.js";

/**
 * The format version for the schema.
 */
export const SimpleSchemaFormatVersion = {
	v2: 2,
} as const;

/**
 * Persisted format for the compatibility impacting subset of simple schema with application-defined schema versions.
 * @see {@link SimpleTreeSchema}.
 */
export const SimpleTreeSchemaFormat = Type.Object(
	{
		version: Type.Literal(SimpleSchemaFormatVersion.v2),
		schemaVersion: Type.Array(Type.Tuple([Type.String(), Type.Integer({ minimum: 0 })])),
		root: SimpleFieldSchemaFormat,
		definitions: SimpleSchemaDefinitionsFormat,
	},
	{ additionalProperties: false },
);
export type SimpleTreeSchemaFormat = Static<typeof SimpleTreeSchemaFormat>;
