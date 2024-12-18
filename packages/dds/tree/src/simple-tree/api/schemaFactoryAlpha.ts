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
import { SchemaFactory, type SchemaFactoryObjectOptions } from "./schemaFactory.js";
import type { ImplicitFieldSchema } from "../schemaTypes.js";
import { defaultSchemaFactoryObjectOptions } from "./schemaFactory.js";
import { type TreeObjectNode, objectSchema } from "../objectNode.js";
import type { RestrictiveStringRecord } from "../../util/index.js";
import type { NodeKind, TreeNodeSchemaClass } from "../core/index.js";
import type { Unenforced } from "./typesUnsafe.js";

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 *
 * Defining this class separately allows correct API isolation of alpha APIs (method signatures) on SchemaFactory.
 * Prefer defining duplicate private methods in `SchemaFactoryAlpha` rather than increasing their exposure, as `protected`
 * APIs on `SchemaFactory` will be exposed to the public API surface.
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
	 */
	public override object<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
	>(
		name: Name,
		fields: T,
		options?: SchemaFactoryObjectOptions,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T
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
	 * {@inheritdoc SchemaFactory.objectRecursive}
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
	>(
		name: Name,
		t: T,
		options?: SchemaFactoryObjectOptions,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T
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
			T
		>;
	}
}
