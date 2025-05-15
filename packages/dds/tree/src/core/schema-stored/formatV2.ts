/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import { JsonCompatibleReadOnlySchema } from "../../util/index.js";
import {
	FieldKindIdentifierSchema,
	TreeNodeSchemaIdentifierSchema,
	TreeNodeSchemaDataFormat as TreeNodeSchemaDataFormatV1,
} from "./formatV1.js";

export const PersistedMetadataFormat = Type.Optional(JsonCompatibleReadOnlySchema);

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Array(TreeNodeSchemaIdentifierSchema),
	metadata: PersistedMetadataFormat,
});

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const FieldSchemaFormat = Type.Composite([FieldSchemaFormatBase], noAdditionalProps);

/**
 * Discriminated union content of tree node schema.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export const TreeNodeSchemaDataFormat = Type.Object(
	{
		...TreeNodeSchemaDataFormatV1.properties,
		/**
		 * Persisted metadata for the schema.
		 */
		metadata: PersistedMetadataFormat,
	},
	unionOptions,
);

export type TreeNodeSchemaDataFormat = Static<typeof TreeNodeSchemaDataFormat>;

export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;

export type PersistedMetadataFormat = Static<typeof PersistedMetadataFormat>;
