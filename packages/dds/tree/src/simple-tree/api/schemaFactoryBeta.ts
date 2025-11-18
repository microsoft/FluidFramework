/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AnnotatedAllowedTypesInternal,
	createSchemaUpgrade,
	normalizeToAnnotatedAllowedType,
	type AllowedTypesFullFromMixed,
	type AllowedTypesMetadata,
	type AnnotatedAllowedType,
	type ImplicitAllowedTypes,
	type LazyItem,
	type NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaBoth,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaNonClass,
	type WithType,
} from "../core/index.js";

import {
	objectSchema,
	recordSchema,
	type InsertableObjectFromSchemaRecord,
	type RecordNodeInsertableData,
	type TreeObjectNode,
	type TreeRecordNode,
} from "../node-kinds/index.js";
import {
	defaultSchemaFactoryObjectOptions,
	SchemaFactory,
	scoped,
	structuralName,
	type NodeSchemaOptions,
	type ObjectSchemaOptions,
	type ScopedSchemaName,
} from "./schemaFactory.js";
import type {
	AllowedTypesFullFromMixedUnsafe,
	AnnotatedAllowedTypeUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
	UnannotateAllowedTypeUnsafe,
	Unenforced,
} from "./typesUnsafe.js";

// These imports prevent a large number of type references in the API reports from showing up as *_2.
/* eslint-disable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import-x/no-duplicates */
import type {
	FieldProps,
	FieldSchemaAlpha,
	FieldPropsAlpha,
	FieldKind,
	ImplicitFieldSchema,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import type { SimpleLeafNodeSchema } from "../simpleSchema.js";
import type { RestrictiveStringRecord } from "../../util/index.js";
/* eslint-enable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import-x/no-duplicates */

/**
 * Stateless APIs exposed via {@link SchemaFactoryBeta} as both instance properties and as statics.
 * @see {@link SchemaStatics} for why this is useful.
 * @system @sealed @beta
 */
export interface SchemaStaticsBeta {
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
	 * For recursive schemas, use {@link SchemaStaticsBeta.stagedRecursive} instead.
	 * It offers equivalent runtime behavior with relaxed compile-time typing for recursive type.
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

	/**
	 * {@link SchemaStaticsBeta.staged} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsBeta.staged} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	stagedRecursive: <
		const T extends Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>,
	>(
		t: T,
	) => AnnotatedAllowedTypeUnsafe<UnannotateAllowedTypeUnsafe<T>>;

	/**
	 * {@link SchemaStaticsBeta.types} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsBeta.types} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 * @privateRemarks
	 * If all inputs (at least recursive ones) were required to be annotated, this could be typed more strongly.
	 * In that case it could use `T extends readonly (AnnotatedAllowedTypeUnsafe | LazyItem<System_Unsafe.TreeNodeSchemaUnsafe>)[]`.
	 */
	readonly typesRecursive: <
		const T extends readonly Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>[],
	>(
		t: T,
		metadata?: AllowedTypesMetadata,
	) => AllowedTypesFullFromMixedUnsafe<T>;
}

const staged = <const T extends LazyItem<TreeNodeSchema>>(
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
};

const types = <const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[]>(
	t: T,
	metadata: AllowedTypesMetadata = {},
): AllowedTypesFullFromMixed<T> => {
	return AnnotatedAllowedTypesInternal.createMixed<T>(t, metadata);
};

const schemaStaticsBeta: SchemaStaticsBeta = {
	staged,
	types,

	stagedRecursive: staged as SchemaStaticsBeta["stagedRecursive"],
	typesRecursive: types as unknown as SchemaStaticsBeta["typesRecursive"],
};

/**
 * {@link SchemaFactory} with additional beta APIs.
 * @beta
 * @privateRemarks
 */
export class SchemaFactoryBeta<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * {@inheritDoc SchemaStaticsBeta.staged}
	 */
	public static staged = schemaStaticsBeta.staged;

	/**
	 * {@inheritDoc SchemaStaticsBeta.staged}
	 */
	public staged = schemaStaticsBeta.staged;

	/**
	 * {@inheritDoc SchemaStaticsBeta.stagedRecursive}
	 */
	public static stagedRecursive = schemaStaticsBeta.stagedRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.stagedRecursive}
	 */
	public stagedRecursive = schemaStaticsBeta.stagedRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.types}
	 */
	public static types = schemaStaticsBeta.types;

	/**
	 * {@inheritDoc SchemaStaticsBeta.types}
	 */
	public types = schemaStaticsBeta.types;

	/**
	 * {@inheritDoc SchemaStaticsBeta.typesRecursive}
	 */
	public static typesRecursive = schemaStaticsBeta.typesRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.typesRecursive}
	 */
	public typesRecursive = schemaStaticsBeta.typesRecursive;

	/**
	 * Create a {@link SchemaFactory} with a {@link SchemaFactory.scope|scope} which is a combination of this factory's scope and the provided name.
	 * @remarks
	 * The main use-case for this is when creating a collection of related schema (for example using a function that creates multiple schema).
	 * Creating such related schema using a sub-scope helps ensure they won't collide with other schema in the parent scope.
	 */
	public scopedFactory<const T extends TName, TNameInner extends number | string = string>(
		name: T,
	): SchemaFactoryBeta<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryBeta(scoped<TScope, TName, T>(this, name));
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
		options?: ObjectSchemaOptions<TCustomMetadata>,
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
		return objectSchema(scoped<TScope, TName, Name>(this, name), fields, true, {
			...defaultSchemaFactoryObjectOptions,
			...(options ?? {}),
		});
	}

	public override objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
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
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param allowedTypes - The types that may appear in the record.
	 *
	 * @remarks
	 * The identifier for this record is defined as a function of the provided types.
	 * It is still scoped to this `SchemaFactory`, but multiple calls with the same arguments will return the same
	 * schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named records, other types in this schema builder should avoid names of the form `Record<${string}>`.
	 *
	 * The underlying data format for `Record` nodes is the same as that for `Map` nodes.
	 * Therefore, changing an existing `Map` schema to a `Record` schema (or vice versa) is
	 * a non-breaking change and does not require schema migration.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyRecord = factory.record(factory.number);
	 * type MyRecord = NodeFromSchema<typeof Record>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", { myRecord: factory.record(factory.number) });
	 * ```
	 *
	 * @privateRemarks
	 * The name produced at the type-level here is not as specific as it could be; however, doing type-level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal, since TypeScript's structural types will allow assignment between runtime incompatible types at compile time.
	 * For example, attempts to narrow unions of structural records by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls to this different subclasses)
	 * when working with structural typing.
	 *
	 * {@label STRUCTURAL}
	 */
	public record<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaNonClass<
		/* Name */ ScopedSchemaName<TScope, `Record<${string}>`>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, `Record<${string}>`>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	>;

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 * @param options - Additional options for the schema.
	 *
	 * @remarks
	 * The underlying data format for `Record` nodes is the same as that for `Map` nodes.
	 * Therefore, changing an existing `Map` schema to a `Record` schema (or vice versa) is
	 * a non-breaking change and does not require schema migration.
	 *
	 * Like TypeScript `Record`s, record nodes have some potential pitfalls.
	 * For example: TypeScript makes assumptions about built-in keys being present (e.g. `toString`, `hasOwnProperty`, etc.).
	 * Since these are otherwise valid keys in a record, this can lead to unexpected behavior.
	 * To prevent inconsistent behavior, these built-ins are hidden by record nodes.
	 * This means that if you try to call these built-ins (e.g. `toString()`) on a record node, you will get an error.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.record("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public record<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined,
		/* TCustomMetadata */ TCustomMetadata
	>;

	/**
	 * {@link SchemaFactoryBeta.record} implementation.
	 *
	 * @privateRemarks
	 * This should return {@link TreeNodeSchemaBoth}: see note on {@link SchemaFactory.map} implementation for details.
	 */
	public record<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		maybeAllowedTypes?: T,
		options?: NodeSchemaOptions,
	): TreeNodeSchema<
		/* Name */ ScopedSchemaName<TScope, string>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T
	> {
		if (maybeAllowedTypes === undefined) {
			const nodeTypes = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Record", nodeTypes);
			return this.getStructuralType(fullName, nodeTypes, () =>
				this.namedRecord(
					fullName,
					nameOrAllowedTypes as T,
					/* customizable */ false,
					/* implicitlyConstructable */ true,
				),
			) as TreeNodeSchemaClass<
				/* Name */ ScopedSchemaName<TScope, string>,
				/* Kind */ NodeKind.Record,
				/* TNode */ TreeRecordNode<T>,
				/* TInsertable */ RecordNodeInsertableData<T>,
				/* ImplicitlyConstructable */ true,
				/* Info */ T,
				/* TConstructorExtra */ undefined
			>;
		}
		const out: TreeNodeSchemaBoth<
			/* Name */ ScopedSchemaName<TScope, string>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<T>,
			/* TInsertable */ RecordNodeInsertableData<T>,
			/* ImplicitlyConstructable */ true,
			/* Info */ T,
			/* TConstructorExtra */ undefined
		> = this.namedRecord(
			nameOrAllowedTypes as TName,
			maybeAllowedTypes,
			/* customizable */ true,
			/* implicitlyConstructable */ true,
			options,
		);
		return out;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `record` which takes a name instead.
	 */
	private namedRecord<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaBoth<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, string>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ ImplicitlyConstructable,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	> {
		return recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable,
			implicitlyConstructable,
			nodeOptions: options,
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
	public recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptions<TCustomMetadata>) {
		const RecordSchema = this.namedRecord(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			/* customizable */ true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			/* implicitlyConstructable */ false,
			options,
		);

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
}
