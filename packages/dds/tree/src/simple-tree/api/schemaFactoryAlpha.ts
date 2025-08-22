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
	type RecordNodeInsertableData,
	recordSchema,
	type TreeRecordNode,
} from "../node-kinds/index.js";
import {
	defaultSchemaFactoryObjectOptions,
	SchemaFactory,
	structuralName,
	type NodeSchemaOptionsAlpha,
	type SchemaFactoryObjectOptions,
	type ScopedSchemaName,
} from "./schemaFactory.js";
import { schemaStatics } from "./schemaStatics.js";
import type { ImplicitAnnotatedFieldSchema, ImplicitFieldSchema } from "../fieldSchema.js";
import type { RestrictiveStringRecord } from "../../util/index.js";
import type {
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaBoth,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	WithType,
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	AnnotatedAllowedType,
	LazyItem,
} from "../core/index.js";
import { normalizeToAnnotatedAllowedType, createSchemaUpgrade } from "../core/index.js";
import type {
	ArrayNodeCustomizableSchemaUnsafe,
	MapNodeCustomizableSchemaUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
} from "./typesUnsafe.js";
import type { SimpleObjectNodeSchema } from "../simpleSchema.js";

// This import prevents a large number of type references in the API reports from showing up as *_2.
/* eslint-disable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import/no-duplicates */
import type {
	FieldProps,
	FieldSchemaAlpha,
	FieldPropsAlpha,
	FieldKind,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import type { SimpleLeafNodeSchema } from "../simpleSchema.js";
import type { UnannotateImplicitAllowedTypes } from "../core/index.js";
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
	 * Staged allowed types add support for loading documents which may or may not permit an allowed type in a location in a schema.
	 * This allows for an incremental rollout of a schema change to add a {@link TreeNodeSchema} to an {@link AllowedTypes} without breaking cross version collaboration.
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
	 * 4. Because of the above, it is possible to get errors when inserting content which uses the staged allowed type when inserting the content into a tree who's stored schema does not permit it.
	 *
	 * Currently, `staged` is not supported in the recursive type APIs: this is a known limitation which future versions of the API will address.
	 *
	 * @example
	 * Suppose you have a schema which has a field that allows some type `A`, but you want to add support for type `B`.
	 *
	 * The first change is to used to mark the new type as staged, replacing `A` in the schema with `[A, SchemaStaticsAlpha.staged(B)]`.
	 * Once this is done, and any code which reads contents from documents is updated to handle any `B` content that may be present, this version of the code can be deployed.
	 *
	 * Once all users have the above changes, the schema can be updated again to `[A, B]`, and the app can be updated to allow creating of `B` content.
	 * This updated version of the app will need to call {@link TreeView.upgradeSchema} when opening documents created by earlier versions.
	 *
	 * Adding a `B` schema as an option in the root could look like this:
	 * ```typescript
	 * const factory = new SchemaFactoryAlpha("test");
	 * class A extends factory.objectAlpha("A", {}) {}
	 * class B extends factory.objectAlpha("B", {}) {}
	 *
	 * // Does not support B
	 * const configBefore = new TreeViewConfigurationAlpha({
	 * 	schema: A,
	 * });
	 *
	 * // Supports documents with or without B
	 * const configStaged = new TreeViewConfigurationAlpha({
	 * 	// Adds staged support for B.
	 * 	// Currently this requires wrapping the root field with `SchemaFactoryAlpha.required`:
	 * 	// this is normally implicitly included, but is currently required while the "staged" APIs are `@alpha`.
	 * 	schema: SchemaFactoryAlpha.required([A, SchemaFactoryAlpha.staged(B)]),
	 * });
	 *
	 * // Only supports documents with A and B: can be used to upgrade schema to add B.
	 * const configAfter = new TreeViewConfigurationAlpha({
	 * 	schema: [A, B],
	 * });
	 * ```
	 * @example
	 * Below is a full example of how the schema migration process works.
	 * This can also be found in our {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts | tests}.
	 * ```typescript
	 * // Schema A: only number allowed
	 * const schemaA = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);
	 *
	 * // Schema B: number or string (string is staged)
	 * const schemaB = SchemaFactoryAlpha.optional([
	 * 	SchemaFactoryAlpha.number,
	 * 	SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
	 * ]);
	 *
	 * // Schema C: number or string, both fully allowed
	 * const schemaC = SchemaFactoryAlpha.optional([
	 * 	SchemaFactoryAlpha.number,
	 * 	SchemaFactoryAlpha.string,
	 * ]);
	 *
	 * // Initialize with schema A.
	 * const configA = new TreeViewConfiguration({
	 * 	schema: schemaA,
	 * });
	 * const viewA = treeA.viewWith(configA);
	 * viewA.initialize(5);
	 *
	 * // Since we are running all the different versions of the app in the same process making changes synchronously,
	 * // an explicit flush is needed to make them available to each other.
	 * synchronizeTrees();
	 *
	 * assert.deepEqual(viewA.root, 5);
	 *
	 * // View the same document with a second tree using schema B.
	 * const configB = new TreeViewConfiguration({
	 * 	schema: schemaB,
	 * });
	 * const viewB = treeB.viewWith(configB);
	 * // B cannot write strings to the root.
	 * assert.throws(() => (viewB.root = "test"));
	 *
	 * // View the same document with a third tree using schema C.
	 * const configC = new TreeViewConfiguration({
	 * 	schema: schemaC,
	 * });
	 * const viewC = treeC.viewWith(configC);
	 * // Upgrade to schema C
	 * viewC.upgradeSchema();
	 * // Use the newly enabled schema.
	 * viewC.root = "test";
	 *
	 * synchronizeTrees();
	 *
	 * // View A is now incompatible with the stored schema:
	 * assert.equal(viewA.compatibility.canView, false);
	 *
	 * // View B can still read the document, and now sees the string root which relies on the staged schema.
	 * assert.deepEqual(viewB.root, "test");
	 * ```
	 * @privateRemarks
	 * TODO:#44317 staged allowed types rely on schema validation of stored schema to output errors, these errors are not very
	 * user friendly and should be improved, particularly in the case of staged allowed types
	 *
	 * TODO: the example above does not work tell in intellisense: its formatted to work onm the website. We should find a solution that works well for both.
	 *
	 * TODO: AB#45711: Update the docs above when recursive type support is added.
	 */
	staged: <const T extends LazyItem<TreeNodeSchema>>(
		t: T | AnnotatedAllowedType<T>,
	) => AnnotatedAllowedType<T>;
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
};

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 *
 * Some private methods on `SchemaFactory` are intentionally duplicated here to avoid increasing their exposure to `protected`.
 * If we were to do so, they would be exposed on the public API surface of `SchemaFactory`.
 *
 * When building schema, when `options` is not provided, TCustomMetadata infers to unknown.
 * If desired, this could be made to infer `undefined` instead by adding overloads for everything,
 * but currently it is not worth the maintenance overhead as there is no use case which this is known to be helpful for.
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
	public objectAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitAnnotatedFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: SchemaFactoryObjectOptions<TCustomMetadata>,
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
			this.scoped2(name),
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
		options?: SchemaFactoryObjectOptions<TCustomMetadata>,
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
		const T extends ImplicitAnnotatedAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): MapNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return mapSchema(
			this.scoped2(name),
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
		const T extends ImplicitAnnotatedAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): ArrayNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return arraySchema(
			this.scoped2(name),
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
	 *
	 * @remarks
	 * Like TypeScript `Record`s, record nodes have some potential pitfalls.
	 * For example: TypeScript makes assumptions about built-in keys being present (e.g. `toString`, `hasOwnProperty`, etc.).
	 * Since these are otherwise valid keys in a record, this can lead to unexpected behavior.
	 * To prevent inconsistent behavior, these built-ins are hidden by record nodes.
	 * This means that if you try to call these built-ins (e.g. `toString()`) on a record node, you will get an error.
	 *
	 * In most cases, it is probably preferable to use {@link SchemaFactory.(map:2)} instead.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.record("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public record<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	>;
	/**
	 * {@link SchemaFactory.array} implementation.
	 *
	 * @privateRemarks
	 * This should return TreeNodeSchemaBoth: see note on "map" implementation for details.
	 */
	public record<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		maybeAllowedTypes?: T,
	): TreeNodeSchema<
		/* Name */ ScopedSchemaName<TScope, string>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T
	> {
		if (maybeAllowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Record", types);
			return this.getStructuralType(fullName, types, () =>
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
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
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
		const record = recordSchema({
			identifier: this.scoped2(name),
			info: allowedTypes,
			customizable,
			implicitlyConstructable,
			metadata: options?.metadata,
			persistedMetadata: options?.persistedMetadata,
		});

		return record as TreeNodeSchemaBoth<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<T> &
				WithType<ScopedSchemaName<TScope, string>, NodeKind.Record>,
			/* TInsertable */ RecordNodeInsertableData<T>,
			/* ImplicitlyConstructable */ ImplicitlyConstructable,
			/* Info */ T,
			/* TConstructorExtra */ undefined
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
		const T extends ImplicitAnnotatedAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): RecordNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return recordSchema({
			identifier: this.scoped2(name),
			info: allowedTypes,
			customizable: true,
			implicitlyConstructable: true,
			metadata: options?.metadata,
			persistedMetadata: options?.persistedMetadata,
		});
	}

	/**
	 * {@link SchemaFactoryAlpha.(record:2)} except tweaked to work better for recursive types.
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
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
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

	/**
	 * Create a {@link SchemaFactory} with a {@link SchemaFactory.scope|scope} which is a combination of this factory's scope and the provided name.
	 * @remarks
	 * The main use-case for this is when creating a collection of related schema (for example using a function that creates multiple schema).
	 * Creating such related schema using a sub-scope helps ensure they won't collide with other schema in the parent scope.
	 */
	public scopedFactory<const T extends TName, TNameInner extends number | string = string>(
		name: T,
	): SchemaFactoryAlpha<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryAlpha(this.scoped2(name));
	}
}
