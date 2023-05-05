/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TSchema, Type } from "@sinclair/typebox";
import { TreeSchemaIdentifierSchema } from "../schema-stored";

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
export interface EncodedFieldMapObject<TChild> {
	[key: string]: TChild[];
}
export const EncodedFieldMapObject = <Schema extends TSchema>(tChild: Schema) =>
	Type.Record(Type.String(), Type.Array(tChild));

export type EncodedNodeData = Static<typeof EncodedNodeData>;
export const EncodedNodeData = Type.Object({
	value: Type.Optional(Type.Any()),
	type: Type.Readonly(TreeSchemaIdentifierSchema),
});

/**
 * Json comparable field collection, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
export interface EncodedGenericFieldsNode<TChild> {
	fields?: EncodedFieldMapObject<TChild>;
	globalFields?: EncodedFieldMapObject<TChild>;
}
export const EncodedGenericFieldsNode = <Schema extends TSchema>(tChild: Schema) =>
	Type.Object({
		fields: Type.Optional(EncodedFieldMapObject(tChild)),
		globalFields: Type.Optional(EncodedFieldMapObject(tChild)),
	});

/**
 * Json comparable tree node, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
export interface EncodedGenericTreeNode<TChild>
	extends EncodedGenericFieldsNode<TChild>,
		EncodedNodeData {}
export const EncodedGenericTreeNode = <Schema extends TSchema>(tChild: Schema) =>
	Type.Intersect([EncodedGenericFieldsNode(tChild), EncodedNodeData]);

/**
 * A tree represented using plain JavaScript objects.
 * Can be passed to `JSON.stringify()` to produce a human-readable/editable JSON tree.
 *
 * JsonableTrees should not store empty fields.
 */
export interface EncodedJsonableTree extends EncodedGenericTreeNode<EncodedJsonableTree> {}
export const EncodedJsonableTree = Type.Recursive((Self) => EncodedGenericTreeNode(Self));
