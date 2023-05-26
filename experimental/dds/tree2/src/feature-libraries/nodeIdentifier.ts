/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StableId } from "@fluidframework/runtime-definitions";
import { Brand, brand } from "../util";
import { TreeSchemaIdentifier, ValueSchema } from "../core";
import { GlobalFieldSchema, SchemaBuilder, SchemaLibrary } from "./modular-schema";
import { NodeIdentifierFieldKind, nodeIdentifier } from "./defaultFieldKinds";

/**
 * The primitive type used to identify nodes in the tree.
 * @alpha
 */
export type NodeIdentifier = Brand<StableId, "Node Identifier">;

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
		SchemaBuilder.field(nodeIdentifier, builder.primitive(key, ValueSchema.String)),
	);
	return { schema: builder.intoLibrary(), field, type: brand(key) };
}
