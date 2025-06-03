/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RecordNodeInsertableData, TreeRecordNode } from "./recordNode.js";
import type {
	ImplicitAnnotatedAllowedTypes,
	UnannotateImplicitAllowedTypes,
} from "../../schemaTypes.js";
import {
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type WithType,
} from "../../core/index.js";

import type { SimpleRecordNodeSchema } from "../../simpleSchema.js";

/**
 * A schema for customizable {@link (TreeMapNode:interface)}s.
 * @system @sealed @alpha
 */
export interface RecordNodeCustomizableSchema<
	out TName extends string = string,
	in out T extends ImplicitAnnotatedAllowedTypes = ImplicitAnnotatedAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Record,
			TreeRecordNode<UnannotateImplicitAllowedTypes<T>> & WithType<TName, NodeKind.Record, T>,
			RecordNodeInsertableData<UnannotateImplicitAllowedTypes<T>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleRecordNodeSchema<TCustomMetadata> {}

/**
 * A schema for POJO emulation mode {@link (TreeMapNode:interface)}s.
 * @system @sealed @alpha
 */
export interface RecordNodePojoEmulationSchema<
	out TName extends string = string,
	in out T extends ImplicitAnnotatedAllowedTypes = ImplicitAnnotatedAllowedTypes,
	out ImplicitlyConstructable extends boolean = true,
	out TCustomMetadata = unknown,
> extends TreeNodeSchemaNonClass<
			TName,
			NodeKind.Record,
			TreeRecordNode<UnannotateImplicitAllowedTypes<T>> & WithType<TName, NodeKind.Record, T>,
			RecordNodeInsertableData<UnannotateImplicitAllowedTypes<T>>,
			ImplicitlyConstructable,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleRecordNodeSchema<TCustomMetadata> {}

/**
 * A schema for {@link (TreeRecordNode:interface)}s.
 * @privateRemarks
 * This could have generic arguments added and forwarded.
 * The expected use-cases for this don't need them however, and if they did want an argument it would probably be the allowed types;
 * perhaps if moving to an order independent way to pass generic arguments, adding support for them here would make sense.
 * @alpha
 */
export type RecordNodeSchema = RecordNodeCustomizableSchema | RecordNodePojoEmulationSchema;

/**
 * @alpha
 */
export const RecordNodeSchema = {
	/**
	 * instanceof-based narrowing support for RecordNodeSchema in Javascript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](value: TreeNodeSchema): value is RecordNodeSchema {
		return isRecordNodeSchema(value);
	},
} as const;

/**
 * Narrows a {@link (TreeNodeSchema:interface)} to an {@link (RecordNodeSchema:interface)}.
 * @privateRemarks
 * If at some point we want to have internal only APIs for MapNodeSchema (like done for objects),
 * this can include those since its not the public facing API.
 */
export function isRecordNodeSchema(schema: TreeNodeSchema): schema is RecordNodeSchema {
	return schema.kind === NodeKind.Record;
}
