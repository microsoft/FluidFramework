/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlexTreeNode, Unenforced, isFlexTreeNode } from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord } from "../util/index.js";
import {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	WithType,
} from "./schemaTypes.js";
import { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
import { TreeNode } from "./types.js";
import {
	FieldSchemaUnsafe,
	InsertableObjectFromSchemaRecordUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	ObjectFromSchemaRecordUnsafe,
	TreeArrayNodeUnsafe,
	TreeMapNodeUnsafe,
} from "./typesUnsafe.js";

export function createFieldSchemaUnsafe<
	Kind extends FieldKind,
	Types extends Unenforced<ImplicitAllowedTypes>,
>(kind: Kind, allowedTypes: Types): FieldSchemaUnsafe<Kind, Types> {
	// At runtime, we still want this to be a FieldSchema instance, but we can't satisfy its extends clause, so just return it as an FieldSchemaUnsafe
	return new FieldSchema(kind, allowedTypes as ImplicitAllowedTypes) as FieldSchemaUnsafe<
		Kind,
		Types
	>;
}

/**
 * Extends SchemaFactory with utilities for recursive schema.
 *
 * @remarks
 * This is separated from {@link SchemaFactory} as these APIs are more experimental and may be stabilized independently.
 *
 * The non-recursive versions of the schema building methods will run into several issues when used recursively.
 * Consider the following example:
 *
 * ```typescript
 * const Test = sf.array(Test); // Bad
 * ```
 *
 * This has several issues:
 *
 * 1. It is a structurally named schema.
 * Structurally named schema derive their name from the names of their child types, which is not possible when the type is recursive since its name would include itself.
 * Instead a name must be explicitly provided.
 *
 * 2. The schema accesses itself before it's defined.
 * This would be a runtime error if the TypeScript compiler allowed it.
 * This can be fixed by wrapping the type in a function, which also requires explicitly listing the allowed types in an array (`[() => Test]`).
 *
 * 3. TypeScript fails to infer the recursive type and falls back to `any` with the warning or error (depending on the compiler configuration):
 * `'Test' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.ts(7022)`.
 * This issue is what the specialized recursive schema building methods fix.
 * This fix comes at a cost: to make the recursive cases work, the `extends` clauses had to be removed.
 * This means that mistakes declaring recursive schema often don't give compile errors in the schema.
 * Additionally support for implicit construction had to be disabled.
 * This means that new nested {@link Unhydrated} nodes can not be created like `new Test([[]])`.
 * Instead the nested nodes must be created explicitly using the construction like`new Test([new Test([])])`.
 *
 * 4. It is using "POJO" mode since it's not explicitly declaring a new class.
 * This means that if the schema generated d.ts files replace recursive references with `any`, breaking use of recursive schema across compilation boundaries.
 * This is fixed by explicitly creating a class which extends the returned schema.
 *
 * All together, the fixed version looks like:
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => Test]) {} // Good
 * ```
 *
 * Be very careful when declaring recursive schema.
 * Due to the removed extends clauses, subtle mistakes will compile just fine but cause strange errors when the schema is used.
 *
 * For example if the square brackets around the allowed types are forgotten:
 *
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", () => Test) {} // Bad
 * ```
 * This schema will still compile, and some (but not all) usages of it may look like they work correctly while other usages will produce generally unintelligible compile errors.
 * This issue can be partially mitigated using {@link ValidateRecursiveSchema}.
 * @sealed @beta
 */
export class SchemaFactoryRecursive<
	TScope extends string,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * {@link SchemaFactory.object} except tweaked to work better for recursive types.
	 * @remarks
	 * This version of {@link SchemaFactory.object} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	>(name: Name, t: T) {
		return this.object(
			name,
			t as T & RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
		) as unknown as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			object & InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T
		>;
	}

	/**
	 * {@link SchemaFactory.optional} except tweaked to work better for recursive types.
	 * @remarks
	 * This version of {@link SchemaFactory.optional} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 */
	public optionalRecursive<const T extends Unenforced<readonly (() => TreeNodeSchema)[]>>(t: T) {
		return createFieldSchemaUnsafe(FieldKind.Optional, t);
	}

	/**
	 * `SchemaFactory.array` except tweaked to work better for recursive types.
	 * @remarks
	 * This version of `SchemaFactory.array` has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 *
	 * Additionally `ImplicitlyConstructable` is disabled (forcing use of constructor) to avoid
	 * `error TS2589: Type instantiation is excessively deep and possibly infinite.`
	 * which otherwise gets reported at sometimes incorrect source locations that vary based on incremental builds.
	 */
	public arrayRecursive<
		const Name extends TName,
		const T extends Unenforced<ImplicitAllowedTypes>,
	>(name: Name, allowedTypes: T) {
		class RecursiveArray extends this.namedArray_internal(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T & ImplicitAllowedTypes>>
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(data);
				}
			}
		}

		return RecursiveArray as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			TreeArrayNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>;
			},
			false,
			T
		>;
	}

	/**
	 * `SchemaFactory.map` except tweaked to work better for recursive types.
	 * @remarks
	 * This version of `SchemaFactory.map` uses the same workarounds as {@link SchemaFactoryRecursive.arrayRecursive}
	 */
	public mapRecursive<Name extends TName, const T extends Unenforced<ImplicitAllowedTypes>>(
		name: Name,
		allowedTypes: T,
	) {
		class MapSchema extends this.namedMap_internal(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<
							[
								string,
								InsertableTreeNodeFromImplicitAllowedTypes<
									T & ImplicitAllowedTypes
								>,
							]
					  >
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(new Map(data));
				}
			}
		}

		return MapSchema as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			TreeMapNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<
					[string, InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
				>;
			},
			false,
			T
		>;
	}
}

/**
 * Compile time check for validity of a recursive schema.
 *
 * @example
 * ```typescript
 * class Test extends sf.arrayRecursive("Test", [() => Test]) {}
 * {
 *     type _check = ValidateRecursiveSchema<typeof Test>;
 * }
 * ```
 * @remarks
 * The type of a recursive schema can be passed to this, and a compile error will be produced for some of the cases which the schema in malformed.
 * This can be used to help mitigate the issue that recursive schema definitions are {@link Unenforced}.
 * If an issue is encountered where a mistake in a recursive schema is made which produces an invalid schema but is not rejected by this checker,
 * it should be considered a bug and this should be updated to handle that case (or have a disclaimer added to these docs that it misses that case).
 * @privateRemarks
 * There are probably mistakes this misses: it's hard to guess all the wrong things people will accidentally do and defend against them.
 * Hopefully over time this can grow toward being robust, at least for common mistakes.
 * @beta
 */
export type ValidateRecursiveSchema<
	T extends TreeNodeSchemaClass<
		string,
		NodeKind.Array | NodeKind.Map | NodeKind.Object,
		TreeNode,
		{
			[NodeKind.Object]: T["info"] extends RestrictiveReadonlyRecord<string, FieldSchema>
				? InsertableObjectFromSchemaRecord<T["info"]>
				: unknown;
			[NodeKind.Array]: T["info"] extends ImplicitAllowedTypes
				? Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T["info"]>>
				: unknown;
			[NodeKind.Map]: T["info"] extends ImplicitAllowedTypes
				? Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T["info"]>]>
				: unknown;
		}[T["kind"]],
		false,
		{
			[NodeKind.Object]: RestrictiveReadonlyRecord<string, FieldSchema>;
			[NodeKind.Array]: ImplicitAllowedTypes;
			[NodeKind.Map]: ImplicitAllowedTypes;
		}[T["kind"]]
	>,
> = true;
