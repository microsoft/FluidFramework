/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionSpaceCompressedId, StableId } from "@fluidframework/runtime-definitions";
import { Brand, Opaque, brand } from "../../util";
import { TreeSchemaIdentifier, ValueSchema } from "../../core";
import { GlobalFieldSchema, SchemaBuilder, SchemaLibrary } from "../modular-schema";
import { FieldKinds, NodeIdentifierFieldKind } from "../defaultFieldKinds";

/**
 * The primitive type used to identify nodes in the tree.
 * This identifier is universally unique and stable forever; therefore it is safe to persist as data in a SharedTree or other DDS/database.
 * @alpha
 */
export type NodeIdentifier = Brand<StableId, "Node Identifier">;

/**
 * A {@link NodeIdentifier} which has been compressed to provide space and runtime savings.
 * @remarks A {@link CompressedNodeIdentifier} will be faster than a {@link NodeIdentifier} when used as a lookup key in a map.
 * {@link CompressedNodeIdentifier}s may be used as identifiers for nodes in a `{@link ISharedTreeView}`,
 * but must not otherwise be serialized and stored as data without first being decompressed into a {@link NodeIdentifier}.
 * Compressed node identifiers may be compared or equated via {@link compareCompressedNodeIdentifiers}.
 * @alpha
 */
export interface CompressedNodeIdentifier
	extends Opaque<Brand<SessionSpaceCompressedId, "Compressed Node Identifier">> {}

/**
 * Compares two {@link CompressedNodeIdentifier}s.
 * All compressed node identifiers retrieved from a single SharedTree client can be totally ordered using this comparator.
 * @param a - the first identifier to compare
 * @param b - the second identifier to compare
 * @returns `0` if `a` and `b` are the same identifier, otherwise `-1` if `a` is ordered before `b` or `1` if `a` is ordered after `b`.
 * @alpha
 */
export function compareCompressedNodeIdentifiers(
	a: CompressedNodeIdentifier,
	b: CompressedNodeIdentifier,
): -1 | 0 | 1 {
	return a === b ? 0 : a > b ? 1 : -1;
}

/**
 * Create a schema library for working with {@link NodeIdentifier}s in a tree.
 * Node identifiers are added to nodes via a global field.
 * @param key - the string used as the identifier global field key as well as the identifier node type.
 * Defaults to a string that is unlikely to collide with user/application keys.
 * @returns the identifier/type of identifier nodes in the schema,
 * the schema for the global field under which identifiers reside,
 * and a schema library containing the above.
 * @alpha
 */
export function buildNodeIdentifierSchema(key: string): {
	schema: SchemaLibrary;
	field: GlobalFieldSchema<NodeIdentifierFieldKind>;
	type: TreeSchemaIdentifier;
} {
	const builder = new SchemaBuilder("Node Identifier Schema");
	const field = builder.globalField(
		key,
		SchemaBuilder.field(FieldKinds.nodeIdentifier, builder.primitive(key, ValueSchema.String)),
	);
	return { schema: builder.intoLibrary(), field, type: brand(key) };
}
