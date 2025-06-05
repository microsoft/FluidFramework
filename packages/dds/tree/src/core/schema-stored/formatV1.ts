/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import { type Brand, brandedStringType } from "../../util/index.js";

export const version = 1 as const;

/**
 * Key (aka Name or Label) for a field which is scoped to a specific TreeNodeStoredSchema.
 *
 * Stable identifier, used when persisting data.
 */
export type FieldKey = Brand<string, "tree.FieldKey">;

/**
 * TypeBox Schema for encoding {@link FieldKey} in persisted data.
 */
export const FieldKeySchema = brandedStringType<FieldKey>();

/**
 * Identifier for a TreeNode schema.
 * Also known as "Definition"
 *
 * Stable identifier, used when persisting data.
 */
export type TreeNodeSchemaIdentifier<TName extends string = string> = Brand<
	TName,
	"tree.TreeNodeSchemaIdentifier"
>;

/**
 * Identifier for a FieldKind.
 * Refers to an exact stable policy (ex: specific version of a policy),
 * for how to handle (ex: edit and merge edits to) fields marked with this kind.
 * Persisted in documents as part of stored schema.
 */
export type FieldKindIdentifier = Brand<string, "tree.FieldKindIdentifier">;
export const FieldKindIdentifierSchema = brandedStringType<FieldKindIdentifier>();

/**
 * TypeBox Schema for encoding {@link TreeNodeSchemaIdentifiers} in persisted data.
 */
export const TreeNodeSchemaIdentifierSchema = brandedStringType<TreeNodeSchemaIdentifier>();

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Array(TreeNodeSchemaIdentifierSchema),
});

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const FieldSchemaFormat = Type.Composite([FieldSchemaFormatBase], noAdditionalProps);

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

/**
 * Discriminated union content of tree node schema.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export const TreeNodeSchemaDataFormat = Type.Object(
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

export type TreeNodeSchemaDataFormat = Static<typeof TreeNodeSchemaDataFormat>;

export type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
