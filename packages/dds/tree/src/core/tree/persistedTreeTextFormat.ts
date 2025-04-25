/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, type TSchema, Type } from "@sinclair/typebox";

import { schemaFormatV1 as schemaFormat } from "../schema-stored/index.js";

/**
 * This module contains persisted types for a simple, human-readable tree format.
 *
 * It was forked from `treeTextFormat.ts` to more cleanly separate compatibility concerns: in the long-term,
 * treeTextFormat.ts is intended to be useful for debugging/test purposes but not for persisted document storage
 * due to its unoptimized nature.
 *
 * However, at the time of forking it was also used as a persisted format for several of SharedTree's indexes.
 * Using the same types for both scenarios is problematic since `treeTextFormat.ts` types are exposed to the
 * public API.
 * These types should be used instead for all persisted format concerns.
 *
 * Before SharedTree has committed to persisted format backwards-compatibility, changes to `treeTextFormat.ts`
 * should be accompanied by the same changes to this module.
 *
 * After that point, changes to `treeTextFormat.ts` will necessitate changes to codecs that deal with these types
 * (and types in this module should not be changed except in compliance with persisted type compatibility guidelines).
 *
 * Longer-term, usages of these types should likely be replaced with a more optimized format.
 * If that switch happens before SharedTree commits to back-compat, this persisted format file can be deleted.
 */

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Json compatible map as object.
 * Keys are FieldKey strings.
 * Values are the content of the field specified by the key.
 *
 * WARNING:
 * Be very careful when using objects as maps:
 * Use `Object.prototype.hasOwnProperty.call(fieldMap, key)` to safely check for keys.
 * Do NOT simply read the field and check for undefined as this will return values for `__proto__`
 * and various methods on Object.prototype, like `hasOwnProperty` and `toString`.
 * This exposes numerous bug possibilities, including prototype pollution.
 *
 * Due to the above issue, try to avoid this type (and the whole object as map pattern).
 * Only use this type when needed for json compatible maps,
 * but even in those cases consider lists of key value pairs for serialization and using `Map`
 * for runtime.
 */
interface EncodedFieldMapObject<TChild> {
	[key: string]: TChild[];
}
const EncodedFieldMapObject = <Schema extends TSchema>(tChild: Schema) =>
	Type.Record(Type.String(), Type.Array(tChild, { minItems: 1 }));

type EncodedNodeData = Static<typeof EncodedNodeData>;
const EncodedNodeData = Type.Object({
	value: Type.Optional(Type.Any()),
	type: Type.Readonly(schemaFormat.TreeNodeSchemaIdentifierSchema),
});

/**
 * Json comparable field collection, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
interface EncodedGenericFieldsNode<TChild> {
	fields?: EncodedFieldMapObject<TChild>;
	globalFields?: EncodedFieldMapObject<TChild>;
}
const EncodedGenericFieldsNode = <Schema extends TSchema>(tChild: Schema) =>
	Type.Object({
		fields: Type.Optional(EncodedFieldMapObject(tChild)),
		globalFields: Type.Optional(EncodedFieldMapObject(tChild)),
	});

/**
 * Json comparable tree node, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
interface EncodedGenericTreeNode<TChild>
	extends EncodedGenericFieldsNode<TChild>,
		EncodedNodeData {}
const EncodedGenericTreeNode = <Schema extends TSchema>(tChild: Schema) =>
	Type.Composite([EncodedGenericFieldsNode(tChild), EncodedNodeData], {
		additionalProperties: false,
	});

/**
 * A tree represented using plain JavaScript objects.
 * Can be passed to `JSON.stringify()` to produce a human-readable/editable JSON tree.
 *
 * JsonableTrees must not store empty fields.
 */
export interface EncodedJsonableTree extends EncodedGenericTreeNode<EncodedJsonableTree> {}
export const EncodedJsonableTree = Type.Recursive((Self) => EncodedGenericTreeNode(Self));

/* eslint-enable @typescript-eslint/explicit-function-return-type */
