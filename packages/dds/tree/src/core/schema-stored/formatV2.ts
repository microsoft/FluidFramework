/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";
import { JsonCompatibleReadOnlySchema } from "../../util/index.js";

import {
	FieldKindIdentifierSchema,
	PersistedValueSchema,
	TreeNodeSchemaIdentifierSchema,
} from "./formatV1.js";

export type PersistedMetadataFormat = Static<typeof PersistedMetadataFormat>;
export const PersistedMetadataFormat = Type.Optional(
	Type.Unsafe<JsonCompatibleReadOnlyObject>(
		Type.Record(Type.String(), JsonCompatibleReadOnlySchema),
	),
);

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Array(TreeNodeSchemaIdentifierSchema),
	metadata: PersistedMetadataFormat,
});

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
export const FieldSchemaFormat = Type.Composite([FieldSchemaFormatBase], noAdditionalProps);

/**
 * Format for the content of a {@link TreeNodeStoredSchema}.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export const TreeNodeSchemaUnionFormat = Type.Object(
	{
		/**
		 * Object node union member.
		 */
		object: Type.Optional(Type.Record(Type.String(), FieldSchemaFormat)),
		/**
		 * Map node union member.
		 */
		map: Type.Optional(FieldSchemaFormat),
		/**
		 * Leaf node union member.
		 */
		leaf: Type.Optional(Type.Enum(PersistedValueSchema)),
	},
	unionOptions,
);

export type TreeNodeSchemaUnionFormat = Static<typeof TreeNodeSchemaUnionFormat>;

/**
 * Format for {@link TreeNodeStoredSchema}.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export type TreeNodeSchemaDataFormat = Static<typeof TreeNodeSchemaDataFormat>;
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
