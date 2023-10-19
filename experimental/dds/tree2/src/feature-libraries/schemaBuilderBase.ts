/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Adapters, TreeSchemaIdentifier } from "../core";
import { Assume, RestrictiveReadonlyRecord, transformObjectMap } from "../util";
import {
	SchemaLibraryData,
	SchemaLintConfiguration,
	buildViewSchemaCollection,
	schemaLintDefault,
	AllowedTypes,
	TreeSchema,
	FieldSchema,
	DocumentSchema,
	FlexList,
	Unenforced,
	Any,
} from "./typed-schema";
import { FieldKind } from "./modular-schema";

/**
 * Configuration for a SchemaBuilder.
 * @alpha
 */
export interface SchemaBuilderOptions<TScope extends string = string> {
	/**
	 * Prefix appended to the identifiers of all {@link TreeSchema} produced by this builder.
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
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};
	/**
	 * Prefix appended to the identifiers of all {@link TreeSchema} produced by this builder.
	 */
	public readonly scope: TScope;

	/**
	 * Used in error messages to identify content produced by this builder.
	 */
	public readonly name: string;

	/**
	 * @param defaultKind - The default field kind to use when inferring a {@link FieldSchema} from {@link ImplicitAllowedTypes}.
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

	protected scoped<Name extends TName>(name: Name): `${TScope}.${Name}` & TreeSchemaIdentifier {
		return `${this.scope}.${name}` as `${TScope}.${Name}` & TreeSchemaIdentifier;
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

	protected addNodeSchema<T extends TreeSchema<string, any>>(schema: T): void {
		assert(!this.treeSchema.has(schema.name), 0x799 /* Conflicting TreeSchema names */);
		this.treeSchema.set(schema.name, schema as TreeSchema);
	}

	private finalizeCommon(): void {
		assert(!this.finalized, 0x79a /* SchemaBuilder can only be finalized once. */);
		this.finalized = true;
		this.libraries.add({
			name: this.name,
			rootFieldSchema: undefined,
			treeSchema: this.treeSchema,
			adapters: this.adapters,
		});
	}

	/**
	 * Produce SchemaLibraries which capture the content added to this builder, as well as any additional SchemaLibraries that were added to it.
	 * May only be called once after adding content to builder is complete.
	 */
	public finalize(): SchemaLibrary {
		this.finalizeCommon();

		// Check for errors:
		const collection = buildViewSchemaCollection(this.lintConfiguration, this.libraries);

		return { ...collection, libraries: this.libraries };
	}

	/**
	 * Produce a DocumentSchema which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	 * Can be used with schematize to provide schema aware access to document content.
	 *
	 * @remarks
	 * May only be called once after adding content to builder is complete.
	 */
	public toDocumentSchema<const TSchema extends ImplicitFieldSchema>(
		root: TSchema,
	): DocumentSchema<NormalizeField<TSchema, TDefaultKind>> {
		// return this.toDocumentSchemaInternal(normalizeField(root, DefaultFieldKind));
		const field = this.normalizeField(root);
		this.finalizeCommon();
		const rootLibrary: SchemaLibraryData = {
			name: this.name,
			rootFieldSchema: field,
			treeSchema: new Map(),
			adapters: {},
		};
		const collection = buildViewSchemaCollection(this.lintConfiguration, [
			rootLibrary,
			...this.libraries,
		]);
		const typed: DocumentSchema<NormalizeField<TSchema, TDefaultKind>> = {
			...collection,
			rootFieldSchema: field,
		};
		return typed;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link Struct} node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 */
	public struct<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): TreeSchema<
		`${TScope}.${Name}`,
		{ structFields: { [key in keyof T]: NormalizeField<T[key], TDefaultKind> } }
	> {
		const schema = new TreeSchema(this, this.scoped(name), {
			structFields: transformObjectMap(
				t,
				(field): FieldSchema => this.normalizeField(field),
			) as {
				[key in keyof T]: NormalizeField<T[key], TDefaultKind>;
			},
		});
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `struct` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See {@link Unenforced} for details.
	 *
	 * TODO: Make this work with ImplicitFieldSchema.
	 */
	public structRecursive<
		Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	>(name: Name, t: T): TreeSchema<`${TScope}.${Name}`, { structFields: T }> {
		return this.struct(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
		) as unknown as TreeSchema<`${TScope}.${Name}`, { structFields: T }>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link MapNode}.
	 */
	public map<Name extends TName, const T extends ImplicitFieldSchema>(
		name: Name,
		fieldSchema: T,
	): TreeSchema<`${TScope}.${Name}`, { mapFields: NormalizeField<T, TDefaultKind> }> {
		const schema = new TreeSchema(this, this.scoped(name), {
			mapFields: this.normalizeField(fieldSchema),
		});
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
	public mapRecursive<Name extends TName, const T extends Unenforced<ImplicitFieldSchema>>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { mapFields: T }> {
		return this.map(name, t as unknown as ImplicitFieldSchema) as unknown as TreeSchema<
			`${TScope}.${Name}`,
			{ mapFields: T }
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link FieldNode}.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 *
	 * @privateRemarks
	 * TODO: Write and link document outlining field vs node data model and the separation of concerns related to that.
	 * TODO: Maybe find a better name for this.
	 */
	public fieldNode<Name extends TName, const T extends ImplicitFieldSchema>(
		name: Name,
		fieldSchema: T,
	): TreeSchema<
		`${TScope}.${Name}`,
		{ structFields: { [""]: NormalizeField<T, TDefaultKind> } }
	> {
		const schema = new TreeSchema(this, this.scoped(name), {
			structFields: { [""]: this.normalizeField(fieldSchema) },
		});
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
	): TreeSchema<`${TScope}.${Name}`, { structFields: { [""]: T } }> {
		return this.fieldNode(name, t as unknown as ImplicitFieldSchema) as unknown as TreeSchema<
			`${TScope}.${Name}`,
			{ structFields: { [""]: T } }
		>;
	}

	/**
	 * Define a {@link FieldSchema}.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a {@link FieldSchema} which can be used as a struct field (see {@link SchemaBuilderBase.struct}),
	 * a map field (see {@link SchemaBuilderBase.map}), a field node(see {@link SchemaBuilderBase.fieldNode}) or the root field (see {@link SchemaBuilderBase.toDocumentSchema}).
	 *
	 * @privateRemarks
	 * TODO:
	 * If a solution to FieldSchema not being able to have extends clauses gets found,
	 * consider just having users do `new FieldSchema` instead?
	 */
	public static field<Kind extends FieldKind, T extends ImplicitAllowedTypes>(
		kind: Kind,
		allowedTypes: T,
	): FieldSchema<Kind, NormalizeAllowedTypes<T>> {
		return FieldSchema.create(kind, normalizeAllowedTypes(allowedTypes));
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
		T extends FlexList<Unenforced<TreeSchema>>,
	>(kind: Kind, ...allowedTypes: T): FieldSchema<Kind, T> {
		return FieldSchema.createUnsafe(kind, allowedTypes);
	}

	/**
	 * Normalizes an {@link ImplicitFieldSchema} into a {@link FieldSchema} using this schema builder's `defaultKind`.
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
export interface SchemaLibrary extends DocumentSchema {
	/**
	 * Schema data aggregated from a collection of libraries by a SchemaBuilder.
	 */
	readonly libraries: ReadonlySet<SchemaLibraryData>;
}

/**
 * Generalized version of AllowedTypes allowing for more concise expressions in some cases.
 * @alpha
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeSchema | Any;

/**
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 * @alpha
 */
export type NormalizeAllowedTypes<TSchema extends ImplicitAllowedTypes> = TSchema extends TreeSchema
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
	if (schema instanceof TreeSchema) {
		return [schema] as unknown as NormalizeAllowedTypes<TSchema>;
	}
	assert(Array.isArray(schema), 0x7c6 /* invalid ImplicitAllowedTypes */);
	return schema as unknown as NormalizeAllowedTypes<TSchema>;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link FieldSchema}.
 * @alpha
 */
export type NormalizeField<
	TSchema extends ImplicitFieldSchema,
	TDefault extends FieldKind,
> = TSchema extends FieldSchema
	? TSchema
	: FieldSchema<TDefault, NormalizeAllowedTypes<Assume<TSchema, ImplicitAllowedTypes>>>;

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link FieldSchema}.
 */
export function normalizeField<TSchema extends ImplicitFieldSchema, TDefault extends FieldKind>(
	schema: TSchema,
	defaultKind: TDefault,
): NormalizeField<TSchema, TDefault> {
	if (schema instanceof FieldSchema) {
		return schema as NormalizeField<TSchema, TDefault>;
	}
	const allowedTypes = normalizeAllowedTypes(schema);
	return FieldSchema.create(defaultKind, allowedTypes) as unknown as NormalizeField<
		TSchema,
		TDefault
	>;
}

/**
 * Type that when combined with a default {@link FieldKind} can be normalized into a {@link FieldSchema}.
 * @alpha
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;
