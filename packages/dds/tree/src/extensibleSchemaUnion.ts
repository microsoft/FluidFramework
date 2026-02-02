/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeAlpha, Tree } from "./shared-tree/index.js";
import type {
	TreeNodeSchema,
	TreeNodeFromImplicitAllowedTypes,
	TreeFieldFromImplicitField,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	SchemaFactoryBeta,
} from "./simple-tree/index.js";
import {
	createCustomizedFluidFrameworkScopedFactory,
	eraseSchemaDetailsSubclassable,
	SchemaFactory,
	TreeBeta,
} from "./simple-tree/index.js";
import type { UnionToIntersection } from "./util/index.js";

/**
 * Utilities for creating extensible schema unions.
 * @remarks
 * Unlike a schema union created using {@link SchemaStaticsBeta.staged | staged} allowed types, this union allows for unknown future types to exist in addition to the known types.
 * This allows for faster roll-outs of new types without waiting for old clients to be updated to be aware of them.
 * This does mean however that old clients may see types they do not know about, which are simply exposed as `undefined` children.
 *
 * `staged` types are lower overhead, and might gain support for `unknown` types in the future, so prefer them when possible.
 * This is simply an alternative for when future compat with unknown types is required,
 * and is built on top of the existing {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields} feature.
 * @alpha
 */
export namespace ExtensibleSchemaUnion {
	/**
	 * Members for classes created by {@link ExtensibleSchemaUnion.extensibleSchemaUnion}.
	 * @alpha
	 */
	export interface Members<T> {
		readonly child: T | undefined;
	}

	/**
	 * Statics for classes created by {@link ExtensibleSchemaUnion.extensibleSchemaUnion}.
	 * @alpha
	 */
	export interface Statics<T extends readonly TreeNodeSchema[]> {
		create<TThis extends TreeNodeSchema>(
			this: TThis,
			child: TreeNodeFromImplicitAllowedTypes<T>,
		): TreeFieldFromImplicitField<TThis>;
	}

	/**
	 * Create an extensible schema union which currently supports the types in `types`,
	 * but tolerates collaboration with future versions that may include additional types.
	 * @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	export function extensibleSchemaUnion<
		const T extends readonly TreeNodeSchema[],
		const TScope extends string,
		const TName extends string,
	>(types: T, inputSchemaFactory: SchemaFactoryBeta<TScope>, name: TName) {
		const record: Record<string, ImplicitFieldSchema> = {};
		for (const type of types) {
			record[`_${type.identifier}`] = SchemaFactory.optional(type, { key: type.identifier });
		}
		const schemaFactory = createCustomizedFluidFrameworkScopedFactory(
			inputSchemaFactory,
			"extensibleSchemaUnion",
		);
		class Union
			extends schemaFactory.object(name, record, { allowUnknownOptionalFields: true })
			implements Members<TreeNodeFromImplicitAllowedTypes<T>>
		{
			public get child(): TreeNodeFromImplicitAllowedTypes<T> | undefined {
				for (const [_key, child] of TreeAlpha.children(this)) {
					return child as TreeNodeFromImplicitAllowedTypes<T>;
				}
				return undefined;
			}

			public static create<TThis extends TreeNodeSchema>(
				this: TThis,
				child: TreeNodeFromImplicitAllowedTypes<T>,
			): TreeFieldFromImplicitField<TThis> {
				const schema = Tree.schema(child);
				return TreeBeta.create(this, {
					[`_${schema.identifier}`]: child,
				} as unknown as InsertableTreeFieldFromImplicitField<
					TThis,
					UnionToIntersection<TThis>
				>);
			}
		}
		return eraseSchemaDetailsSubclassable<
			Members<TreeNodeFromImplicitAllowedTypes<T>>,
			Statics<T>
		>()(Union);
	}
}
