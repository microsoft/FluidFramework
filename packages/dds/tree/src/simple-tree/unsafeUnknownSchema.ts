/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
} from "./core/index.js";
import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
} from "./fieldSchema.js";
import type { InsertableContent } from "./unhydratedFlexTreeFromInsertable.js";

/**
 * {@inheritdoc (UnsafeUnknownSchema:type)}
 * @alpha
 */

export const UnsafeUnknownSchema: unique symbol = Symbol("UnsafeUnknownSchema");
/**
 * A special type which can be provided to some APIs as the schema type parameter when schema cannot easily be provided at compile time and an unsafe (instead of disabled) editing API is desired.
 * @remarks
 * When used, this means the TypeScript typing should err on the side of completeness (allow all inputs that could be valid).
 * This introduces the risk that out-of-schema data could be allowed at compile time, and only error at runtime.
 *
 * @privateRemarks
 * This only applies to APIs which input data which is expected to be in schema, since APIs outputting have easy mechanisms to do so in a type safe way even when the schema is unknown.
 * In most cases that amounts to returning `TreeNode | TreeLeafValue`.
 *
 * This can be contrasted with the default behavior of TypeScript, which is to require the intersection of the possible types for input APIs,
 * which for unknown schema defining input trees results in the `never` type.
 *
 * Any APIs which use this must produce UsageErrors when out of schema data is encountered, and never produce unrecoverable errors,
 * or silently accept invalid data.
 * This is currently only type exported from the package: the symbol is just used as a way to get a named type.
 * @alpha
 */

export type UnsafeUnknownSchema = typeof UnsafeUnknownSchema;
/**
 * Content which could be inserted into a tree.
 *
 * @see {@link Input}
 * @remarks
 * Extended version of {@link InsertableTreeNodeFromImplicitAllowedTypes} that also allows {@link (UnsafeUnknownSchema:type)}.
 * @alpha
 */

export type Insertable<TSchema extends ImplicitAllowedTypes | UnsafeUnknownSchema> =
	TSchema extends ImplicitAllowedTypes
		? InsertableTreeNodeFromImplicitAllowedTypes<TSchema>
		: InsertableContent;

/**
 * Content which could be inserted into a field within a tree.
 *
 * @see {@link Input}
 * @remarks
 * Extended version of {@link InsertableTreeFieldFromImplicitField} that also allows {@link (UnsafeUnknownSchema:type)}.
 * @alpha
 */
export type InsertableField<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema> = [
	TSchema,
] extends [ImplicitFieldSchema]
	? InsertableTreeFieldFromImplicitField<TSchema>
	: [TSchema] extends [UnsafeUnknownSchema]
		? InsertableContent | undefined
		: never;
