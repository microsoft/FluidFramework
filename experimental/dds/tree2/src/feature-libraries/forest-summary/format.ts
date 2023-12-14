/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { FieldKeySchema } from "../../core";
import { Versioned } from "../versioned";

export const version = 1.0;

export const Format = Type.Object(
	{
		version: Type.Literal(version),
		keys: Type.Array(FieldKeySchema),
		fields: Versioned,
	},
	{ additionalProperties: false },
);

export type Format = Static<typeof Format>;
