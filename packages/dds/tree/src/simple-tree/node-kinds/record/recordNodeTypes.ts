/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
	UnannotateImplicitAllowedTypes,
} from "../../schemaTypes.js";
import {
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchema,
	type TreeNodeSchemaNonClass,
	type WithType,
	type TreeNode,
} from "../../core/index.js";

import type { SimpleRecordNodeSchema } from "../../simpleSchema.js";
import type { RestrictiveStringRecord } from "../../../util/index.js";

/**
 * A {@link TreeNode} which models a TypeScript {@link https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type | record}.
 *
 * @remarks
 * Record nodes consist of a type which specifies which {@link TreeNodeSchema} may appear as child elements (see {@link TreeNodeApi.schema} and {@link SchemaFactoryAlpha.recordAlpha}).
 *
 * @alpha
 */
// TODO: allow writing via insertable types
export interface TreeRecordNode<T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeNode,
		Record<string, TreeNodeFromImplicitAllowedTypes<T>> {}

/**
 * Content which can be used to construct a Record node, explicitly or implicitly.
 * @system @alpha
 */
export type RecordNodeInsertableData<T extends ImplicitAllowedTypes> = RestrictiveStringRecord<
	InsertableTreeNodeFromImplicitAllowedTypes<T>
>;

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
			/* Name */ TName,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<UnannotateImplicitAllowedTypes<T>> &
				WithType<TName, NodeKind.Record, T>,
			/* TInsertable */ RecordNodeInsertableData<UnannotateImplicitAllowedTypes<T>>,
			/* ImplicitlyConstructable */ ImplicitlyConstructable,
			/* Info */ T,
			/* TConstructorExtra */ never,
			/* TCustomMetadata */ TCustomMetadata
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
			/* Name */ TName,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<UnannotateImplicitAllowedTypes<T>> &
				WithType<TName, NodeKind.Record, T>,
			/* TInsertable */ RecordNodeInsertableData<UnannotateImplicitAllowedTypes<T>>,
			/* ImplicitlyConstructable */ ImplicitlyConstructable,
			/* Info */ T,
			/* TConstructorExtra */ never,
			/* TCustomMetadata */ TCustomMetadata
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
export type RecordNodeSchema<
	TName extends string = string,
	T extends ImplicitAnnotatedAllowedTypes = ImplicitAnnotatedAllowedTypes,
	ImplicitlyConstructable extends boolean = true,
	TCustomMetadata = unknown,
> =
	| RecordNodeCustomizableSchema<TName, T, ImplicitlyConstructable, TCustomMetadata>
	| RecordNodePojoEmulationSchema<TName, T, ImplicitlyConstructable, TCustomMetadata>;

/**
 * @alpha
 */
export const RecordNodeSchema = {
	/**
	 * `instanceof`-based narrowing support for {@link RecordNodeSchema} in JavaScript and TypeScript 5.3 or newer.
	 */
	[Symbol.hasInstance](value: TreeNodeSchema): value is RecordNodeSchema {
		return isRecordNodeSchema(value);
	},
} as const;

/**
 * Narrows a {@link (TreeNodeSchema:interface)} to an {@link (RecordNodeSchema:interface)}.
 * @privateRemarks
 * If at some point we want to have internal only APIs for RecordNodeSchema (like done for objects),
 * this can include those since its not the public-facing API.
 */
export function isRecordNodeSchema(schema: TreeNodeSchema): schema is RecordNodeSchema {
	return schema.kind === NodeKind.Record;
}
