/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { Versioned } from "../../codec/index.js";
import { schemaFormat } from "../../core/index.js";

export const version = 1.0;

export const Format = Type.Object(
	{
		version: Type.Literal(version),
		keys: Type.Array(schemaFormat.FieldKeySchema),
		fields: Versioned,
	},
	{ additionalProperties: false },
);

export type Format = Static<typeof Format>;
