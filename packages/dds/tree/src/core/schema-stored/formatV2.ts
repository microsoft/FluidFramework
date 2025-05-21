/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { JsonCompatibleReadOnlySchema } from "../../util/index.js";
import {
	FieldKindIdentifierSchema,
	TreeNodeSchemaIdentifierSchema,
	TreeNodeSchemaDataFormat as TreeNodeSchemaUnionFormat,
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
 * Format for {@link TreeNodeStoredSchema}.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export const TreeNodeSchemaDataFormat = Type.Object(
	{
		/**
		 * Node kind specific data.
		 */
		kind: TreeNodeSchemaUnionFormat,

		// Data in common for all TreeNode schemas:
		/**
		 * Leaf node union member.
		 */
		metadata: PersistedMetadataFormat,
	},
	noAdditionalProps,
);

export type TreeNodeSchemaDataFormat = Static<typeof TreeNodeSchemaDataFormat>;

export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;

export type PersistedMetadataFormat = Static<typeof PersistedMetadataFormat>;

export { TreeNodeSchemaUnionFormat };
