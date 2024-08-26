/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { Adapters, TreeNodeSchemaIdentifier } from "../core/index.js";
import { brand, type RestrictiveReadonlyRecord, transformObjectMap } from "../util/index.js";

import { defaultSchemaPolicy } from "./default-schema/index.js";
import type { FlexFieldKind } from "./modular-schema/index.js";
import {
	type FlexAllowedTypes,
	FlexFieldSchema,
	type FlexMapFieldSchema,
	FlexMapNodeSchema,
	type FlexObjectNodeFields,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	type FlexTreeSchema,
	type SchemaCollection,
	type SchemaLibraryData,
	type SchemaLintConfiguration,
	TreeNodeSchemaBase,
	aggregateSchemaLibraries,
	schemaLintDefault,
} from "./typed-schema/index.js";

/**
 * Configuration for a SchemaBuilder.
 */
export interface SchemaBuilderOptions<TScope extends string = string> {
	/**
	 * Prefix appended to the identifiers of all {@link FlexTreeNodeSchema} produced by this builder.
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
 * *
 * @privateRemarks
 * This class does not directly depend on any specific field kinds,
 * or bake in any defaults that might have compatibility implications.
 * All use of such implicit defaults is done by subclasses, which thus get versioning implications.
 */
export class SchemaBuilderBase<TScope extends string, TDefaultKind extends FlexFieldKind> {
	private readonly lintConfiguration: SchemaLintConfiguration;
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly treeNodeSchema: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema> =
		new Map();
	private readonly adapters: Adapters = {};
	/**
	 * Prefix appended to the identifiers of all {@link FlexTreeNodeSchema} produced by this builder.
	 */
	public readonly scope: TScope;

	/**
	 * Used in error messages to identify content produced by this builder.
	 */
	public readonly name: string;

	/**
	 * @param defaultKind - The default field kind to use when inferring a {@link FlexFieldSchema} from {@link FlexImplicitAllowedTypes}.
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

	protected scoped(name: string): TreeNodeSchemaIdentifier {
		return brand(`${this.scope}.${name}`);
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
	private addLibraries(...libraries: SchemaLibrary[]): void {
		for (const libs of libraries) {
			for (const lib of libs.libraries) {
				this.libraries.add(lib);
			}
		}
	}

	protected addNodeSchema<T extends FlexTreeNodeSchema>(schema: T): void {
		assert(
			!this.treeNodeSchema.has(schema.name),
			0x799 /* Conflicting TreeNodeSchema names */,
		);
		this.treeNodeSchema.set(schema.name, schema);
	}

	private finalizeCommon(field?: FlexFieldSchema): SchemaLibraryData {
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
	public intoSchema<const TSchema extends FlexImplicitFieldSchema>(
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
	 * Define (and add to this library) a {@link FlexObjectNodeSchema}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public object(
		name: string,
		t: RestrictiveReadonlyRecord<string, FlexImplicitFieldSchema>,
	): FlexObjectNodeSchema {
		const schema = FlexObjectNodeSchema.create(
			this,
			this.scoped(name),
			transformObjectMap(
				t,
				(field): FlexFieldSchema => this.normalizeField(field),
			) as FlexObjectNodeFields,
		);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define (and add to this library) a {@link FlexMapNodeSchema}.
	 */
	public map(name: string, fieldSchema: FlexMapFieldSchema): FlexMapNodeSchema {
		const schema = FlexMapNodeSchema.create(this, this.scoped(name), fieldSchema);
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define a {@link FlexFieldSchema}.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a {@link FlexFieldSchema} which can be used as a object field (see {@link SchemaBuilderBase.object}),
	 * a map field (see {@link SchemaBuilderBase.map}), a field node (see {@link SchemaBuilderBase.fieldNode}) or the root field (see {@link SchemaBuilderBase.intoSchema}).
	 *
	 * @privateRemarks
	 * TODO:
	 * If a solution to TreeFieldSchema not being able to have extends clauses gets found,
	 * consider just having users do `new TreeFieldSchema` instead?
	 */
	public static field<Kind extends FlexFieldKind>(
		kind: Kind,
		allowedTypes: FlexImplicitAllowedTypes,
	): FlexFieldSchema<Kind> {
		return FlexFieldSchema.create(kind, normalizeAllowedTypes(allowedTypes));
	}

	/**
	 * Normalizes an {@link FlexImplicitFieldSchema} into a {@link FlexFieldSchema} using this schema builder's `defaultKind`.
	 */
	protected normalizeField<TSchema extends FlexImplicitFieldSchema>(
		schema: TSchema,
	): NormalizeField<TSchema, TDefaultKind> {
		return normalizeField(schema, this.defaultKind);
	}
}

/**
 * Schema information collected by a SchemaBuilder, including referenced libraries.
 * Can be aggregated into other libraries by adding to their builders.
 */
export interface SchemaLibrary extends SchemaCollection {
	/**
	 * Schema data aggregated from a collection of libraries by a SchemaBuilder.
	 */
	readonly libraries: ReadonlySet<SchemaLibraryData>;
}

/**
 * Generalized version of AllowedTypes allowing for more concise expressions in some cases.
 */
export type FlexImplicitAllowedTypes = FlexAllowedTypes | FlexTreeNodeSchema;

/**
 * Normalizes an {@link FlexImplicitAllowedTypes} into  {@link FlexAllowedTypes}.
 */
export function normalizeAllowedTypes(schema: FlexImplicitAllowedTypes): FlexAllowedTypes {
	if (schema instanceof TreeNodeSchemaBase) {
		return [schema];
	}
	assert(Array.isArray(schema), 0x7c6 /* invalid ImplicitAllowedTypes */);
	return schema as FlexAllowedTypes;
}

/**
 * Normalizes an {@link FlexImplicitFieldSchema} into a {@link FlexFieldSchema}.
 */
export type NormalizeField<
	TSchema extends FlexImplicitFieldSchema,
	TDefault extends FlexFieldKind,
> = TSchema extends FlexFieldSchema ? TSchema : FlexFieldSchema<TDefault>;

/**
 * Normalizes an {@link FlexImplicitFieldSchema} into a {@link FlexFieldSchema}.
 */
export function normalizeField<
	TSchema extends FlexImplicitFieldSchema,
	TDefault extends FlexFieldKind,
>(schema: TSchema, defaultKind: TDefault): NormalizeField<TSchema, TDefault> {
	if (schema instanceof FlexFieldSchema) {
		return schema as NormalizeField<TSchema, TDefault>;
	}
	const allowedTypes = normalizeAllowedTypes(schema);
	return FlexFieldSchema.create(defaultKind, allowedTypes) as NormalizeField<
		TSchema,
		TDefault
	>;
}

/**
 * Type that when combined with a default {@link FlexFieldKind} can be normalized into a {@link FlexFieldSchema}.
 */
export type FlexImplicitFieldSchema = FlexFieldSchema | FlexImplicitAllowedTypes;
