/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TObjectOptions, Static } from "typebox";
import * as Type from "typebox/type";
import {
	typeboxInterface,
	typeboxOptional,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	stringKeyRecord,
} from "../../util/index.js";

import { unionOptions } from "../../codec/index.js";

import {
	FieldKindIdentifierSchema,
	PersistedValueSchema,
	TreeNodeSchemaIdentifierSchema,
} from "./formatV1.js";

export type PersistedMetadataFormat = Static<typeof PersistedMetadataFormat>;
export const PersistedMetadataFormat = typeboxOptional(
	Type.Unsafe<JsonCompatibleReadOnlyObject>(stringKeyRecord(JsonCompatibleReadOnlySchema)),
);

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Array(TreeNodeSchemaIdentifierSchema),
	metadata: PersistedMetadataFormat,
});

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
export const FieldSchemaFormat = typeboxInterface(
	[FieldSchemaFormatBase],
	{},
	noAdditionalProps,
);

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
		object: typeboxOptional(stringKeyRecord(FieldSchemaFormat)),
		/**
		 * Map node union member.
		 */
		map: typeboxOptional(FieldSchemaFormat),
		/**
		 * Leaf node union member.
		 */
		leaf: typeboxOptional(Type.Enum(PersistedValueSchema)),
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
		 * Persisted subset of metadata for this node schema.
		 */
		metadata: PersistedMetadataFormat,
	},
	noAdditionalProps,
);
