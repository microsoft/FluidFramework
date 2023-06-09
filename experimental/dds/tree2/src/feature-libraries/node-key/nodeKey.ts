/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionSpaceCompressedId, StableId } from "@fluidframework/runtime-definitions";
import { Brand, brand } from "../../util";
import { TreeSchemaIdentifier, ValueSchema } from "../../core";
import { GlobalFieldSchema, SchemaBuilder, SchemaLibrary } from "../modular-schema";
import { FieldKinds, NodeKeyFieldKind } from "../defaultFieldKinds";

/**
 * A key which uniquely identifies a node in the tree within this session.
 * @remarks {@link LocalNodeKey}s must not be serialized and stored as data without first being converted into a {@link StableNodeKey}.
 * However, they are otherwise preferential to use over {@link StableNodeKey}s as they are much smaller and faster to compare and equate.
 * {@link LocalNodeKey}s may be compared or equated via {@link compareLocalNodeKeys}.
 * @alpha
 */
export type LocalNodeKey = Brand<SessionSpaceCompressedId, "Local Node Key">; // TODO: can we make it opaque?

/**
 * A UUID which identifies a node in the tree.
 * This key is universally unique and stable forever; therefore it is safe to persist as data in a SharedTree or other DDS/database.
 * When not persisted or serialized, it is preferable to use a {@link LocalNodeKey} instead for better performance.
 * @alpha
 */
export type StableNodeKey = Brand<StableId, "Stable Node Key">;

/**
 * Compares two {@link LocalNodeKey}s.
 * All {@link LocalNodeKey}s retrieved from a single SharedTree client can be totally ordered using this comparator.
 * @param a - the first key to compare
 * @param b - the second key to compare
 * @returns `0` if `a` and `b` are the same key, otherwise `-1` if `a` is ordered before `b` or `1` if `a` is ordered after `b`.
 * @alpha
 */
export function compareLocalNodeKeys(a: LocalNodeKey, b: LocalNodeKey): -1 | 0 | 1 {
	return a === b ? 0 : a > b ? 1 : -1;
}

/**
 * Create a schema library for working with {@link StableNodeKey}s in a tree.
 * Node keys are added to nodes via a global field.
 * @param key - the string used as the global field key as well as the node type for node keys.
 * Defaults to a string that is unlikely to collide with user/application keys.
 * @returns the type of node key nodes in the schema,
 * the schema for the global field under which keys reside,
 * and a schema library containing the above.
 * @alpha
 */
export function buildNodeKeySchema(key: string): {
	schema: SchemaLibrary;
	field: GlobalFieldSchema<NodeKeyFieldKind>;
	type: TreeSchemaIdentifier;
} {
	const builder = new SchemaBuilder("Node Key Schema");
	const field = builder.globalField(
		key,
		SchemaBuilder.field(FieldKinds.nodeKey, builder.primitive(key, ValueSchema.String)),
	);
	return { schema: builder.intoLibrary(), field, type: brand(key) };
}
