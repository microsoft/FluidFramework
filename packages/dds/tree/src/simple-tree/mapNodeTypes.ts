/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MapNodeInsertableData, TreeMapNode } from "./mapNode.js";
import type { ImplicitAllowedTypes } from "./schemaTypes.js";
import {
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type WithType,
} from "./core/index.js";

import type { SimpleMapNodeSchema } from "./simpleSchema.js";

/**
 * A schema for customizable {@link (TreeMapNode:interface)}s.
 * @system @sealed @alpha
 */
export interface MapNodeCustomizableSchema<
	out TName extends string = string,
	in out T extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Map,
			TreeMapNode<T> & WithType<TName, NodeKind.Map, T>,
			MapNodeInsertableData<T>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleMapNodeSchema<TCustomMetadata> {}

/**
 * A schema for POJO emulation mode {@link (TreeMapNode:interface)}s.
 * @system @sealed @alpha
 */
export interface MapNodePojoEmulationSchema<
	out TName extends string = string,
	in out T extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaNonClass<
			TName,
			NodeKind.Map,
			TreeMapNode<T> & WithType<TName, NodeKind.Map, T>,
			MapNodeInsertableData<T>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleMapNodeSchema<TCustomMetadata> {}

/**
 * A schema for {@link (TreeMapNode:interface)}s.
 * @privateRemarks
 * This could have generic arguments added and forwarded.
 * The expected use-cases for this don't need them however, and if they did want an argument it would probably be the allowed types;
 * perhaps if moving to an order independent way to pass generic arguments, adding support for them here would make sense.
 * @alpha
 */
export type MapNodeSchema = MapNodeCustomizableSchema | MapNodePojoEmulationSchema;

/**
 * @alpha
 */
export const MapNodeSchema = {
	/**
	 * instanceof-based narrowing support for MapNodeSchema in Javascript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](value: TreeNodeSchema): value is MapNodeSchema {
		return isMapNodeSchema(value);
	},
} as const;

/**
 * Narrows a {@link (TreeNodeSchema:interface)} to an {@link (MapNodeSchema:interface)}.
 * @privateRemarks
 * If at some point we want to have internal only APIs for MapNodeSchema (like done for objects),
 * this can include those since its not the public facing API.
 */
export function isMapNodeSchema(schema: TreeNodeSchema): schema is MapNodeSchema {
	return schema.kind === NodeKind.Map;
}
