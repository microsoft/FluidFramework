/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { schemaFormatV1 as schemaFormat } from "../../core/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * Format for encoding as json.
 *
 * For consistency all lists are sorted and undefined values are omitted.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also makes it simpler to determinately sort by keys.
 */
export const Format = Type.Object(
	{
		version: Type.Literal(schemaFormat.version),
		nodes: Type.Record(Type.String(), schemaFormat.TreeNodeSchemaDataFormat),
		root: schemaFormat.FieldSchemaFormat,
	},
	noAdditionalProps,
);
export type Format = Static<typeof Format>;
