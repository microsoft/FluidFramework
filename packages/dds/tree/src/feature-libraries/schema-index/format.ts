/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import { FieldKindIdentifierSchema, FieldKeySchema, TreeSchemaIdentifierSchema } from "../../core";

export const version = "1.0.0" as const;

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Optional(Type.Array(TreeSchemaIdentifierSchema)),
});

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const FieldSchemaFormat = Type.Composite([FieldSchemaFormatBase], noAdditionalProps);

const NamedFieldSchemaFormat = Type.Composite(
	[
		FieldSchemaFormatBase,
		Type.Object({
			name: FieldKeySchema,
		}),
	],
	noAdditionalProps,
);

/**
 * Persisted version of {@link ValueSchema}.
 */
export enum PersistedValueSchema {
	Number,
	String,
	Boolean,
	FluidHandle,
	Null,
}

export const TreeNodeSchemaFormat = Type.Object(
	{
		name: TreeSchemaIdentifierSchema,
		objectNodeFields: Type.Array(NamedFieldSchemaFormat),
		mapFields: Type.Optional(FieldSchemaFormat),
		leafValue: Type.Optional(Type.Enum(PersistedValueSchema)),
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
		version: Type.Literal(version),
		nodeSchema: Type.Array(TreeNodeSchemaFormat),
		rootFieldSchema: FieldSchemaFormat,
	},
	noAdditionalProps,
);

export type Format = Static<typeof Format>;
export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
export type TreeNodeSchemaFormat = Static<typeof TreeNodeSchemaFormat>;
export type NamedFieldSchemaFormat = Static<typeof NamedFieldSchemaFormat>;

export const Versioned = Type.Object({
	version: Type.String(),
});
export type Versioned = Static<typeof Versioned>;
