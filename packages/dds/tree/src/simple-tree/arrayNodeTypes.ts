/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeArrayNode } from "./arrayNode.js";
import type {
	ImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import {
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type WithType,
} from "./core/index.js";

import type { SimpleArrayNodeSchema } from "./simpleSchema.js";

/**
 * A schema for customizable {@link (TreeArrayNode:interface)}s.
 * @sealed
 * @alpha
 */
export interface ArrayNodeCustomizableSchema<
	out TName extends string = string,
	in out T extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Array,
			TreeArrayNode<T> & WithType<TName, NodeKind.Array, T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleArrayNodeSchema<TCustomMetadata> {}

/**
 * A schema for POJO emulation mode {@link (TreeArrayNode:interface)}s.
 * @sealed
 * @alpha
 */
export interface ArrayNodePojoEmulationSchema<
	out TName extends string = string,
	in out T extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaNonClass<
			TName,
			NodeKind.Array,
			TreeArrayNode<T> & WithType<TName, NodeKind.Array, T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleArrayNodeSchema<TCustomMetadata> {}

/**
 * @alpha
 */
export const ArrayNodeSchema = {
	/**
	 * instanceof-based narrowing support for ArrayNodeSchema in Javascript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](
		value: TreeNodeSchema,
	): value is ArrayNodeCustomizableSchema | ArrayNodePojoEmulationSchema {
		return isArrayNodeSchema(value);
	},
} as const;

export function isArrayNodeSchema(
	schema: TreeNodeSchema,
): schema is ArrayNodeCustomizableSchema | ArrayNodePojoEmulationSchema {
	return schema.kind === NodeKind.Array;
}
