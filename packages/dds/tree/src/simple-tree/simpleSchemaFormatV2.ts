/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { Static } from "typebox";

import {
	SimpleFieldSchemaFormat,
	SimpleSchemaDefinitionsFormat,
} from "./simpleSchemaFormatV1.js";

/**
 * Defines the format version for schema compatibility snapshots.
 */
export const SimpleSchemaFormatVersion = {
	v2: 2,
} as const;

/**
 * Defines a snapshot format for schema compatibility and application-defined versions.
 *
 * @see {@link SimpleTreeSchema}
 */
export const SimpleTreeSchemaFormat = Type.Object(
	{
		version: Type.Literal(SimpleSchemaFormatVersion.v2),
		schemaVersion: Type.Optional(
			Type.Array(Type.Tuple([Type.String(), Type.Integer({ minimum: 0 })])),
		),
		root: SimpleFieldSchemaFormat,
		definitions: SimpleSchemaDefinitionsFormat,
	},
	{ additionalProperties: false },
);
export type SimpleTreeSchemaFormat = Static<typeof SimpleTreeSchemaFormat>;
