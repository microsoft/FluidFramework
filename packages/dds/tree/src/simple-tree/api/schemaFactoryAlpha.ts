/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ScopedSchemaName,
	InsertableObjectFromSchemaRecord,
	TreeObjectNodeUnsafe,
	InsertableObjectFromSchemaRecordUnsafe,
} from "../../internalTypes.js";
import {
	defaultSchemaFactoryObjectOptions,
	SchemaFactory,
	schemaStaticsAlpha,
	type SchemaFactoryObjectOptions,
} from "./schemaFactory.js";
import type {
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeSchemaOptions,
} from "../schemaTypes.js";
import { type TreeObjectNode, objectSchema } from "../objectNode.js";
import type { RestrictiveStringRecord } from "../../util/index.js";
import type { NodeKind, TreeNodeSchemaClass, WithType } from "../core/index.js";
import type {
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeArrayNodeUnsafe,
	TreeMapNodeUnsafe,
	Unenforced,
} from "./typesUnsafe.js";
import { mapSchema, type MapNodeInsertableData, type TreeMapNode } from "../mapNode.js";
import { arraySchema, type TreeArrayNode } from "../arrayNode.js";

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 *
 * Some private methods on `SchemaFactory` are intentionally duplicated here to avoid increasing their exposure to `protected`.
 * If we were to do so, they would be exposed on the public API surface of `SchemaFactory`.
 */
export class SchemaFactoryAlpha<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	private scoped2<Name extends TName | string>(name: Name): ScopedSchemaName<TScope, Name> {
		return (
			this.scope === undefined ? `${name}` : `${this.scope}.${name}`
		) as ScopedSchemaName<TScope, Name>;
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 * @param options - Additional options for the schema.
	 */
	public override object<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: SchemaFactoryObjectOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T,
		never,
		TCustomMetadata
	> {
		return objectSchema(
			this.scoped2(name),
			fields,
			true,
			options?.allowUnknownOptionalFields ??
				defaultSchemaFactoryObjectOptions.allowUnknownOptionalFields,
			options?.metadata,
		);
	}

	/**
	 * {@inheritdoc SchemaFactory.objectRecursive}
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: SchemaFactoryObjectOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.object(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			TreeObjectNodeUnsafe<T, TScopedName>,
			object & InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		>;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear as values in the map.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedMap extends factory.map("name", factory.number, {
	 * 	metadata: { description: "A map of numbers" }
	 * }) {}
	 * ```
	 */
	public mapAlpha<
		Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Map>,
		MapNodeInsertableData<T>,
		true,
		T,
		undefined,
		TCustomMetadata
	> {
		return mapSchema(this.scoped2(name), allowedTypes, true, true, options?.metadata);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override mapRecursive<
		Name extends TName,
		const T extends Unenforced<ImplicitAllowedTypes>,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptions<TCustomMetadata>) {
		return this.mapAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			TreeMapNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Map>,
			| {
					[Symbol.iterator](): Iterator<
						[string, InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
					>;
			  }
			| {
					readonly [P in string]: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			  },
			false,
			T,
			undefined,
			TCustomMetadata
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the array.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.array("name", factory.number) {}
	 * ```
	 */
	public arrayAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Array>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T,
		undefined,
		TCustomMetadata
	> {
		return arraySchema(this.scoped2(name), allowedTypes, true, true, options?.metadata);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override arrayRecursive<
		const Name extends TName,
		const T extends Unenforced<ImplicitAllowedTypes>,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptions<TCustomMetadata>) {
		return this.arrayAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			TreeArrayNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Array>,
			{
				[Symbol.iterator](): Iterator<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>;
			},
			false,
			T,
			undefined,
			TCustomMetadata
		>;
	}

	/**
	 * {@inheritDoc schemaStaticsAlpha.optional}
	 */
	public override readonly optional = schemaStaticsAlpha.optional;
}
