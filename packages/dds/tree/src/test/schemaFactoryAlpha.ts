/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ScopedSchemaName, InsertableObjectFromSchemaRecord } from "../internalTypes.js";
import {
	SchemaFactory,
	type SchemaFactoryObjectOptions,
	type TreeNodeSchemaClass,
	type NodeKind,
	type Unenforced,
	type ImplicitFieldSchema,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { defaultSchemaFactoryObjectOptions } from "../simple-tree/api/schemaFactory.js";
// eslint-disable-next-line import/no-internal-modules
import { type TreeObjectNode, objectSchema } from "../simple-tree/objectNode.js";
import type { RestrictiveStringRecord } from "../util/index.js";

/**
 * Copy of {@link SchemaFactory} with additional alpha APIs.
 *
 * @privateRemarks
 * Not currently exported to the public API surface as doing so produces errors in API-extractor.
 *
 * Can be removed once additional object node features are deemed stable and on the base class.
 */
export class SchemaFactoryAlpha<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	// TS has trouble with subclassing schema factory and produces errors in the definition of objectRecursive without
	// explicit type annotations saying the return type is "the same as the parent class". There's not a great way to do
	// that AFAICT without using an instantiation expression, but `super` is unsupported in such expressions.
	private readonly baseKludge: SchemaFactory<TScope, TName> = this;
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
		);
	}

	/**
	 * {@inheritdoc}
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: SchemaFactoryObjectOptions<TCustomMetadata>,
	): ReturnType<typeof this.baseKludge.objectRecursive<Name, T, TCustomMetadata>> {
		return this.object(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as ReturnType<
			typeof this.baseKludge.objectRecursive<Name, T, TCustomMetadata>
		>;
	}
}
