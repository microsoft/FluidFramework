/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Adapters, TreeNodeSchemaIdentifier } from "../core";
import { Assume, RestrictiveReadonlyRecord, transformObjectMap } from "../util";
import {
	SchemaLibraryData,
	SchemaLintConfiguration,
	aggregateSchemaLibraries,
	schemaLintDefault,
	AllowedTypes,
	TreeNodeSchema,
	TreeFieldSchema,
	FlexTreeSchema,
	FlexList,
	Unenforced,
	Any,
	MapFieldSchema,
	SchemaCollection,
	ObjectNodeSchema,
	MapNodeSchema,
	FieldNodeSchema,
	TreeNodeSchemaBase,
} from "./typed-schema";
import { FieldKind } from "./modular-schema";
import { defaultSchemaPolicy } from "./default-schema";

/**
 * Configuration for a SchemaBuilder.
 * @alpha
 */
export interface SchemaBuilderOptions<TScope extends string = string> {
	/**
	 * Prefix appended to the identifiers of all {@link TreeNodeSchema} produced by this builder.
	 * Use of [Reverse domain name notation](https://en.wikipedia.org/wiki/Reverse_domain_name_notation) or a UUIDv4 is recommended to avoid collisions.
	 */
	scope: TScope;

	/**
	 * Name used to refer to this builder in error messages.
	 * Has no impact on the actual generated schema.
	 * Defaults to scope.
	 */
	name?: string;

	/**
	 * Optional configuration for "linting".
	 * See {@link SchemaLintConfiguration}. Currently defaults to enabling all lints.
	 */
	lint?: Partial<SchemaLintConfiguration>;

	/**
	 * Libraries to include in this one.
	 *
	 * @remarks
	 * Unlike adding of individual schema, adding of libraries is idempotent.
	 * If a single library is added multiple times (even indirectly via libraries it was added into),
	 * only a single copy will be included, so they will not conflict.
	 * This allows adding any library this one depends on without risk of conflicts for users of this library.
	 * Contents within the added libraries can still conflict however.
	 * Such errors will be reported when finalizing this builder into a library or document schema.
	 */
	libraries?: SchemaLibrary[];
}

/**
 * Builds schema libraries, and the schema within them.
 * @alpha
 *
 * @privateRemarks
 * This class does not directly depend on any specific field kinds,
 * or bake in any defaults that might have compatibility implications.
 * All use of such implicit defaults is done by subclasses, which thus get versioning implications.
 */
export class SchemaBuilderBase<
	TScope extends string,
	TDefaultKind extends FieldKind,
	TName extends number | string = string,
> {
	private readonly lintConfiguration: SchemaLintConfiguration;
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly treeNodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeSchema> = new Map();
	private readonly adapters: Adapters = {};
	/**
	 * Prefix appended to the identifiers of all {@link TreeNodeSchema} produced by this builder.
	 */
	public readonly scope: TScope;

	/**
	 * Used in error messages to identify content produced by this builder.
	 */
	public readonly name: string;

	/**
	 * @param defaultKind - The default field kind to use when inferring a {@link TreeFieldSchema} from {@link ImplicitAllowedTypes}.
	 */
	public constructor(
		private readonly defaultKind: TDefaultKind,
		options: SchemaBuilderOptions<TScope>,
	) {
		this.name = options.name ?? options.scope;
		this.lintConfiguration = { ...schemaLintDefault, ...options.lint };
		this.libraries = new Set();
		this.addLibraries(...(options.libraries ?? []));
		this.scope = options.scope;
	}

	protected scoped<Name extends TName>(
		name: Name,
	): TreeNodeSchemaIdentifier<`${TScope}.${Name}`> {
		return `${this.scope}.${name}` as TreeNodeSchemaIdentifier<`${TScope}.${Name}`>;
	}

	/**
	 * Adds more libraries to this one.
	 *
	 * Unlike adding of individual schema, adding of libraries is idempotent.
	 * If a single library is added multiple times (even indirectly via libraries it was added into),
	 * only a single copy will be included, so they will not conflict.
	 * This allows adding any library this one depends on without risk of conflicts for users of this library.
	 * Contents within the added libraries can still conflict however.
	 * Such errors will be reported when finalizing this builder into a library of document schema.
	 */
	private addLibraries(...libraries: SchemaLibrary[]) {
		for (const libs of libraries) {
			for (const lib of libs.libraries) {
				this.libraries.add(lib);
			}
		}
	}

	protected addNodeSchema<T extends TreeNodeSchema>(schema: T): void {
		assert(!this.treeNodeSchema.has(schema.name), 0x799 /* Conflicting TreeNodeSchema names */);
		this.treeNodeSchema.set(schema.name, schema);
	}

	private finalizeCommon(field?: TreeFieldSchema): SchemaLibraryData {
		assert(!this.finalized, 0x79a /* SchemaBuilder can only be finalized once. */);
		this.finalized = true;
		this.libraries.add({
			name: this.name,
			nodeSchema: this.treeNodeSchema,
			adapters: this.adapters,
		});

		// Check for errors and aggregate data
		return aggregateSchemaLibraries(this.name, this.lintConfiguration, this.libraries, field);
	}

	/**
	 * Produce SchemaLibraries which capture the content added to this builder, as well as any additional SchemaLibraries that were added to it.
	 * May only be called once after adding content to builder is complete.
	 */
	public intoLibrary(): SchemaLibrary {
		const aggregated = this.finalizeCommon();

		// Full library set (instead of just aggregated) is kept since it is required to handle deduplication of libraries included through different paths.
		return { nodeSchema: aggregated.nodeSchema, libraries: this.libraries };
	}

	/**
	 * Produce a TreeSchema which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	 * Can be used with schematize to provide schema aware access to document content.
	 *
	 * @remarks
	 * May only be called once after adding content to builder is complete.
	 */
	public intoSchema<const TSchema extends ImplicitFieldSchema>(
		root: TSchema,
	): FlexTreeSchema<NormalizeField<TSchema, TDefaultKind>> {
		// return this.toDocumentSchemaInternal(normalizeField(root, DefaultFieldKind));
		const field: NormalizeField<TSchema, TDefaultKind> = this.normalizeField(root);
		const library = this.finalizeCommon(field);

		const typed: FlexTreeSchema<NormalizeField<TSchema, TDefaultKind>> = {
			nodeSchema: library.nodeSchema,
			adapters: library.adapters,
			rootFieldSchema: field,
			policy: defaultSchemaPolicy,
		};
		return typed;
	}

	/**
	 * Define (and add to this library) a {@link ObjectNodeSchema}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public object<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): ObjectNodeSchema<
		`${TScope}.${Name}`,
		{ [key in keyof T]: NormalizeField<T[key], TDefaultKind> }
	> {
		const schema = ObjectNodeSchema.create(
			this,
			this.scoped(name),
			transformObjectMap(t, (field): TreeFieldSchema => this.normalizeField(field)) as {
				[key in keyof T]: NormalizeField<T[key], TDefaultKind>;
			},
		);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `object` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See {@link Unenforced} for details.
	 *
	 * TODO: Make this work with ImplicitFieldSchema.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	>(name: Name, t: T): ObjectNodeSchema<`${TScope}.${Name}`, T> {
		return this.object(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
		) as unknown as ObjectNodeSchema<`${TScope}.${Name}`, T>;
	}

	/**
	 * Define (and add to this library) a {@link MapNodeSchema}.
	 */
	public map<Name extends TName, const T extends MapFieldSchema>(
		name: Name,
		fieldSchema: T,
	): MapNodeSchema<`${TScope}.${Name}`, T> {
		const schema = MapNodeSchema.create(this, this.scoped(name), fieldSchema);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `map` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See {@link Unenforced} for details.
	 *
	 * TODO: Make this work with ImplicitFieldSchema.
	 */
	public mapRecursive<Name extends TName, const T extends Unenforced<MapFieldSchema>>(
		name: Name,
		t: T,
	): MapNodeSchema<`${TScope}.${Name}`, T> {
		return this.map(name, t as MapFieldSchema) as MapNodeSchema<`${TScope}.${Name}`, T>;
	}

	/**
	 * Define (and add to this library) a {@link FieldNodeSchema}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 *
	 * @privateRemarks
	 * TODO: Write and link document outlining field vs node data model and the separation of concerns related to that.
	 * TODO: Maybe find a better name for this.
	 */
	public fieldNode<Name extends TName, const T extends ImplicitFieldSchema>(
		name: Name,
		fieldSchema: T,
	): FieldNodeSchema<`${TScope}.${Name}`, NormalizeField<T, TDefaultKind>> {
		const schema = FieldNodeSchema.create(
			this,
			this.scoped(name),
			this.normalizeField(fieldSchema),
		);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `fieldNode` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See {@link Unenforced} for details.
	 *
	 * TODO: Make this work with ImplicitFieldSchema.
	 */
	public fieldNodeRecursive<Name extends TName, const T extends Unenforced<ImplicitFieldSchema>>(
		name: Name,
		t: T,
	): FieldNodeSchema<`${TScope}.${Name}`, T> {
		return this.fieldNode(name, t as ImplicitFieldSchema) as FieldNodeSchema<
			`${TScope}.${Name}`,
			T
		>;
	}

	/**
	 * Define a {@link TreeFieldSchema}.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a {@link TreeFieldSchema} which can be used as a object field (see {@link SchemaBuilderBase.object}),
	 * a map field (see {@link SchemaBuilderBase.map}), a field node (see {@link SchemaBuilderBase.fieldNode}) or the root field (see {@link SchemaBuilderBase.intoSchema}).
	 *
	 * @privateRemarks
	 * TODO:
	 * If a solution to TreeFieldSchema not being able to have extends clauses gets found,
	 * consider just having users do `new TreeFieldSchema` instead?
	 */
	public static field<Kind extends FieldKind, T extends ImplicitAllowedTypes>(
		kind: Kind,
		allowedTypes: T,
	): TreeFieldSchema<Kind, NormalizeAllowedTypes<T>> {
		return TreeFieldSchema.create(kind, normalizeAllowedTypes(allowedTypes));
	}

	/**
	 * Define a schema for a field.
	 * Same as {@link SchemaBuilderBase.field} but is less type safe and supports recursive types.
	 * This API is less safe to work around a [limitation of TypeScript](https://github.com/microsoft/TypeScript/issues/55758).
	 *
	 * T must extends `AllowedTypes`: This cannot be enforced via TypeScript since such an "extends" clauses cause recursive types to error with:
	 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
	 *
	 * TODO: Try and find a way to provide a more specific type without triggering the above error.
	 */
	public static fieldRecursive<
		Kind extends FieldKind,
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
		T extends FlexList<Unenforced<TreeNodeSchema>>,
	>(kind: Kind, ...allowedTypes: T): TreeFieldSchema<Kind, T> {
		return TreeFieldSchema.createUnsafe(kind, allowedTypes);
	}

	/**
	 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema} using this schema builder's `defaultKind`.
	 */
	protected normalizeField<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
	): NormalizeField<TSchema, TDefaultKind> {
		return normalizeField(schema, this.defaultKind);
	}
}

/**
 * Schema information collected by a SchemaBuilder, including referenced libraries.
 * Can be aggregated into other libraries by adding to their builders.
 * @alpha
 */
export interface SchemaLibrary extends SchemaCollection {
	/**
	 * Schema data aggregated from a collection of libraries by a SchemaBuilder.
	 */
	readonly libraries: ReadonlySet<SchemaLibraryData>;
}

/**
 * Generalized version of AllowedTypes allowing for more concise expressions in some cases.
 * @alpha
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema | Any;

/**
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 * @alpha
 */
export type NormalizeAllowedTypes<TSchema extends ImplicitAllowedTypes> =
	TSchema extends TreeNodeSchema
		? readonly [TSchema]
		: TSchema extends Any
		? readonly [Any]
		: TSchema;

/**
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 */
export function normalizeAllowedTypes<TSchema extends ImplicitAllowedTypes>(
	schema: TSchema,
): NormalizeAllowedTypes<TSchema> {
	if (schema === Any) {
		return [Any] as unknown as NormalizeAllowedTypes<TSchema>;
	}
	if (schema instanceof TreeNodeSchemaBase) {
		return [schema] as unknown as NormalizeAllowedTypes<TSchema>;
	}
	assert(Array.isArray(schema), 0x7c6 /* invalid ImplicitAllowedTypes */);
	return schema as unknown as NormalizeAllowedTypes<TSchema>;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 * @alpha
 */
export type NormalizeField<
	TSchema extends ImplicitFieldSchema,
	TDefault extends FieldKind,
> = TSchema extends TreeFieldSchema
	? TSchema
	: TreeFieldSchema<TDefault, NormalizeAllowedTypes<Assume<TSchema, ImplicitAllowedTypes>>>;

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function normalizeField<TSchema extends ImplicitFieldSchema, TDefault extends FieldKind>(
	schema: TSchema,
	defaultKind: TDefault,
): NormalizeField<TSchema, TDefault> {
	if (schema instanceof TreeFieldSchema) {
		return schema as NormalizeField<TSchema, TDefault>;
	}
	const allowedTypes = normalizeAllowedTypes(schema);
	return TreeFieldSchema.create(defaultKind, allowedTypes) as unknown as NormalizeField<
		TSchema,
		TDefault
	>;
}

/**
 * Type that when combined with a default {@link FieldKind} can be normalized into a {@link TreeFieldSchema}.
 * @alpha
 */
export type ImplicitFieldSchema = TreeFieldSchema | ImplicitAllowedTypes;
