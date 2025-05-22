/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeArrayNode } from "./arrayNode.js";
import type {
	ImplicitAnnotatedAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	UnannotateImplicitAllowedTypes,
} from "../schemaTypes.js";
import {
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type WithType,
} from "../core/index.js";

import type { SimpleArrayNodeSchema } from "../simpleSchema.js";

/**
 * A schema for customizable {@link (TreeArrayNode:interface)}s.
 * @system @sealed @alpha
 */
export interface ArrayNodeCustomizableSchema<
	out TName extends string = string,
	in out T extends ImplicitAnnotatedAllowedTypes = ImplicitAnnotatedAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Array,
			TreeArrayNode<UnannotateImplicitAllowedTypes<T>> & WithType<TName, NodeKind.Array, T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<UnannotateImplicitAllowedTypes<T>>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleArrayNodeSchema<TCustomMetadata> {}

/**
 * A schema for POJO emulation mode {@link (TreeArrayNode:interface)}s.
 * @system @sealed @alpha
 */
export interface ArrayNodePojoEmulationSchema<
	out TName extends string = string,
	in out T extends ImplicitAnnotatedAllowedTypes = ImplicitAnnotatedAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaNonClass<
			TName,
			NodeKind.Array,
			TreeArrayNode<UnannotateImplicitAllowedTypes<T>> & WithType<TName, NodeKind.Array, T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<UnannotateImplicitAllowedTypes<T>>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleArrayNodeSchema<TCustomMetadata> {}

/**
 * A schema for {@link (TreeArrayNode:interface)}s.
 * @privateRemarks
 * This could have generic arguments added and forwarded.
 * The expected use-cases for this don't need them however, and if they did want an argument it would probably be the allowed types;
 * perhaps if moving to an order independent way to pass generic arguments, adding support for them here would make sense.
 * @alpha
 */
export type ArrayNodeSchema = ArrayNodeCustomizableSchema | ArrayNodePojoEmulationSchema;

/**
 * @alpha
 */
export const ArrayNodeSchema = {
	/**
	 * instanceof-based narrowing support for ArrayNodeSchema in Javascript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](value: TreeNodeSchema): value is ArrayNodeSchema {
		return isArrayNodeSchema(value);
	},
} as const;

/**
 * Narrows a {@link (TreeNodeSchema:interface)} to an {@link (ArrayNodeSchema:interface)}.
 * @privateRemarks
 * If at some point we want to have internal only APIs for ArrayNodeSchema (like done for objects),
 * this can include those since its not the public facing API.
 */
export function isArrayNodeSchema(schema: TreeNodeSchema): schema is ArrayNodeSchema {
	return schema.kind === NodeKind.Array;
}
