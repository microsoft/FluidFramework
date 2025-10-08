/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ArrayNodeCustomizableSchema,
	arraySchema,
	type MapNodeCustomizableSchema,
	mapSchema,
	type ObjectNodeSchema,
	objectSchema,
	type RecordNodeCustomizableSchema,
	recordSchema,
} from "../node-kinds/index.js";
import {
	defaultSchemaFactoryObjectOptions,
	scoped,
	type NodeSchemaOptionsAlpha,
	type ObjectSchemaOptionsAlpha,
	type ScopedSchemaName,
} from "./schemaFactory.js";
import { schemaStatics } from "./schemaStatics.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import type { RestrictiveStringRecord } from "../../util/index.js";
import type {
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	ImplicitAllowedTypes,
	AnnotatedAllowedType,
	LazyItem,
	WithType,
	AllowedTypesMetadata,
	AllowedTypesFullFromMixed,
} from "../core/index.js";
import {
	normalizeToAnnotatedAllowedType,
	createSchemaUpgrade,
	AnnotatedAllowedTypesInternal,
} from "../core/index.js";
import type {
	ArrayNodeCustomizableSchemaUnsafe,
	MapNodeCustomizableSchemaUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
} from "./typesUnsafe.js";
import type { SimpleObjectNodeSchema } from "../simpleSchema.js";
import { SchemaFactoryBeta } from "./schemaFactoryBeta.js";

// These imports prevent a large number of type references in the API reports from showing up as *_2.
/* eslint-disable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import/no-duplicates */
import type {
	FieldProps,
	FieldSchemaAlpha,
	FieldPropsAlpha,
	FieldKind,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import type { SimpleLeafNodeSchema } from "../simpleSchema.js";
import type { FieldSchemaAlphaUnsafe } from "./typesUnsafe.js";
/* eslint-enable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import/no-duplicates */

/**
 * Stateless APIs exposed via {@link SchemaFactoryAlpha} as both instance properties and as statics.
 * @remarks
 * See {@link SchemaStatics} for why this is useful.
 * @system @sealed @alpha
 */
export interface SchemaStaticsAlpha {
	/**
	 * Declares a staged type in a set of {@link AllowedTypes}.
	 *
	 * @remarks
	 * Staged allowed types add support for loading documents which may contain that type at the declared location.
	 * This allows for an incremental rollout of a schema change to add a {@link TreeNodeSchema} to an {@link AllowedTypes} without breaking cross version collaboration.
	 * A guide on this process can be found here: https://fluidframework.com/docs/data-structures/tree/schema-evolution/allowed-types-rollout
	 *
	 * Once enough clients have the type staged (and thus can read documents which allow it), documents can start being created and upgraded to allow the staged type.
	 * This is done by deploying a new version of the app which removes the `staged` wrapper around the allowed type in the the schema definition.
	 * This will also require {@link TreeView.upgradeSchema|upgrading the schema} for existing documents.
	 *
	 * Using a staged allowed type in a schema is just like using the schema as an allowed type with the following exceptions:
	 *
	 * 1. {@link TreeView.initialize} will omit the staged allowed type from the newly created stored schema.
	 * 2. {@link TreeView.upgradeSchema} will omit the staged allowed type from the the upgraded stored schema.
	 * 3. When evaluating {@link TreeView.compatibility}, it will be viewable even if the staged allowed type is not present in the stored schema's corresponding allowed types.
	 * 4. Because of the above, it is possible to get errors when inserting content which uses the staged allowed type into a tree whose stored schema does not permit it.
	 *
	 * Currently, `staged` is not supported in the recursive type APIs: this is a known limitation which future versions of the API will address.
	 *
	 * @example
	 * A full code example of the schema migration process can be found in our {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts | tests}.
	 *
	 * @privateRemarks
	 * TODO:#44317 staged allowed types rely on schema validation of stored schema to output errors, these errors are not very
	 * user friendly and should be improved, particularly in the case of staged allowed types
	 *
	 * TODO: AB#45711: Update the docs above when recursive type support is added.
	 */
	readonly staged: <const T extends LazyItem<TreeNodeSchema>>(
		t: T | AnnotatedAllowedType<T>,
	) => AnnotatedAllowedType<T>;

	/**
	 * Normalize information about a set of {@link AllowedTypes} into an {@link AllowedTypesFull}.
	 * @remarks
	 * This can take in {@link AnnotatedAllowedType} to preserve their annotations.
	 */
	readonly types: <
		const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
	>(
		t: T,
		metadata?: AllowedTypesMetadata,
	) => AllowedTypesFullFromMixed<T>;
}

const schemaStaticsAlpha: SchemaStaticsAlpha = {
	staged: <const T extends LazyItem<TreeNodeSchema>>(
		t: T | AnnotatedAllowedType<T>,
	): AnnotatedAllowedType<T> => {
		const annotatedType = normalizeToAnnotatedAllowedType(t);
		return {
			type: annotatedType.type,
			metadata: {
				...annotatedType.metadata,
				stagedSchemaUpgrade: createSchemaUpgrade(),
			},
		};
	},

	types: <const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[]>(
		t: T,
		metadata: AllowedTypesMetadata = {},
	): AllowedTypesFullFromMixed<T> => {
		return AnnotatedAllowedTypesInternal.createMixed<T>(t, metadata);
	},
};

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 * When building schema, when `options` is not provided, `TCustomMetadata` is inferred as `unknown`.
 * If desired, this could be made to infer `undefined` instead by adding overloads for everything,
 * but currently it is not worth the maintenance overhead as there is no use case which this is known to be helpful for.
 */
export class SchemaFactoryAlpha<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactoryBeta<TScope, TName> {
	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 * @param options - Additional options for the schema.
	 */
	public objectAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): ObjectNodeSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> & {
		/**
		 * Typing checking workaround: not for for actual use.
		 * @remarks
		 * This API collides with {@link TreeNodeSchemaCore.createFromInsertable} to disable a type checking optimization which produces different and undesired results.
		 * See {@link https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693} for more details.
		 * @privateRemarks
		 * The specific issue here is non-empty POJO mode object schema not being assignable to `ObjectNodeSchema`,
		 * See the above link and the tests in objectNode.spec.ts which reference it.
		 * @system
		 */
		readonly createFromInsertable: unknown;
	} {
		return objectSchema(
			scoped<TScope, TName, Name>(this, name),
			fields,
			true,
			options?.allowUnknownOptionalFields ??
				defaultSchemaFactoryObjectOptions.allowUnknownOptionalFields,
			options?.metadata,
			options?.persistedMetadata,
		);
	}

	/**
	 * {@inheritdoc SchemaFactory.objectRecursive}
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> &
		SimpleObjectNodeSchema<TCustomMetadata> &
		// We can't just use non generic `ObjectNodeSchema` here since "Base constructors must all have the same return type".
		// We also can't just use generic `ObjectNodeSchema` here and not `TreeNodeSchemaClass` since that doesn't work with unsafe recursive types.
		// ObjectNodeSchema<
		// 	ScopedSchemaName<TScope, Name>,
		// 	//  T & RestrictiveStringRecord<ImplicitFieldSchema> would be nice to use here, but it breaks the recursive type self references.
		// 	RestrictiveStringRecord<ImplicitFieldSchema>,
		// 	false,
		// 	TCustomMetadata
		// >
		Pick<ObjectNodeSchema, "fields"> {
		// TODO: syntax highting is vs code is broken here. Don't trust it. Use the compiler instead.
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.objectAlpha(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		> &
			ObjectNodeSchema<
				ScopedSchemaName<TScope, Name>,
				RestrictiveStringRecord<ImplicitFieldSchema>,
				false,
				TCustomMetadata
			>;
	}

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public static override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public static override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public static override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public static override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public static override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * Like {@link SchemaFactory.identifier} but static and a factory function that can be provided {@link FieldProps}.
	 */
	public static readonly identifier = schemaStatics.identifier;

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * {@inheritDoc SchemaStaticsAlpha.staged}
	 */
	public static staged = schemaStaticsAlpha.staged;

	/**
	 * {@inheritDoc SchemaStaticsAlpha.staged}
	 */
	public staged = schemaStaticsAlpha.staged;

	/**
	 * {@inheritDoc SchemaStaticsAlpha.types}
	 */
	public static types = schemaStaticsAlpha.types;

	/**
	 * {@inheritDoc SchemaStaticsAlpha.types}
	 */
	public types = schemaStaticsAlpha.types;

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
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): MapNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return mapSchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options?.metadata,
			options?.persistedMetadata,
		);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override mapRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.mapAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as MapNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the array.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.arrayAlpha("name", factory.number) {}
	 * ```
	 */
	public arrayAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): ArrayNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return arraySchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options?.metadata,
			options?.persistedMetadata,
		);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override arrayRecursive<
		const Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.arrayAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as ArrayNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.recordAlpha("name", factory.number) {}
	 * ```
	 */
	public recordAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): RecordNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable: true,
			implicitlyConstructable: true,
			metadata: options?.metadata,
			persistedMetadata: options?.persistedMetadata,
		});
	}

	/**
	 * {@link SchemaFactoryBeta.(record:2)} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.record` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		const RecordSchema = recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes as T & ImplicitAllowedTypes,
			customizable: true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			implicitlyConstructable: false,
			metadata: options?.metadata,
			persistedMetadata: options?.persistedMetadata,
		});

		return RecordSchema as TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
			/* TInsertable */ {
				// Ideally this would be
				// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
				// but doing so breaks recursive types.
				// Instead we do a less nice version:
				readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			},
			/* ImplicitlyConstructable */ false,
			/* Info */ T,
			/* TConstructorExtra */ undefined,
			/* TCustomMetadata */ TCustomMetadata
		>;
	}

	/**
	 * {@inheritDoc SchemaFactoryBeta.scopedFactory}
	 */
	public scopedFactoryAlpha<
		const T extends TName,
		TNameInner extends number | string = string,
	>(name: T): SchemaFactoryAlpha<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryAlpha(scoped<TScope, TName, T>(this, name));
	}
}
