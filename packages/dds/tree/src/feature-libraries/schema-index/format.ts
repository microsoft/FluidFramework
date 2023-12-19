/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import { schemaFormat } from "../../core";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const TreeNodeSchemaFormat = Type.Object(
	{
		name: schemaFormat.TreeNodeSchemaIdentifierSchema,
		data: schemaFormat.TreeNodeSchemaDataFormat,
	},
	noAdditionalProps,
);

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
		nodeSchema: Type.Array(TreeNodeSchemaFormat),
		rootFieldSchema: schemaFormat.FieldSchemaFormat,
	},
	noAdditionalProps,
);

export type Format = Static<typeof Format>;

export type TreeNodeSchemaFormat = Static<typeof TreeNodeSchemaFormat>;

export const Versioned = Type.Object({
	version: Type.String(),
});
export type Versioned = Static<typeof Versioned>;
