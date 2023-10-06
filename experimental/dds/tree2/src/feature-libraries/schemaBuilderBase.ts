/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Adapters, TreeSchemaIdentifier } from "../core";
import {
	SchemaLibraryData,
	SchemaLintConfiguration,
	buildViewSchemaCollection,
	schemaLintDefault,
	AllowedTypes,
	TreeSchema,
	FieldSchema,
	TypedSchemaCollection,
	RecursiveTreeSchema,
	FlexList,
} from "./typed-schema";
import { FieldKind } from "./modular-schema";

/**
 * Builds schema libraries, and the schema within them.
 * @alpha
 */

export class SchemaBuilderBase<TScope extends string, TName extends number | string = string> {
	private readonly lintConfiguration: SchemaLintConfiguration;
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};
	public readonly scope: TScope;

	public get name(): string {
		return this.scope;
	}

	/**
	 * @param name - Name used to refer to this builder in error messages. Has no impact on the actual generated schema.
	 * @param lint - Optional configuration for "linting". See {@link SchemaLintConfiguration}. Currently defaults to enabling all lints.
	 * @param libraries - Libraries to include in this one. See `addLibraries` for details.
	 */
	public constructor(options: {
		scope: TScope;
		lint?: Partial<SchemaLintConfiguration>;
		libraries?: SchemaLibrary[];
	}) {
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
		assert(!this.treeSchema.has(schema.name), 1707 /* Conflicting TreeSchema names */);
		this.treeSchema.set(schema.name, schema as TreeSchema);
	}

	private finalizeCommon(): void {
		assert(!this.finalized, "SchemaBuilder can only be finalized once.");
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
	 * Produce a TypedSchemaCollection which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	 * Can be used with schematize to provide schema aware access to document content.
	 *
	 * May only be called once after adding content to builder is complete.
	 */
	public toDocumentSchema<Kind extends FieldKind, Types extends AllowedTypes>(
		root: FieldSchema<Kind, Types>,
	): TypedSchemaCollection<FieldSchema<Kind, Types>> {
		this.finalizeCommon();
		const rootLibrary: SchemaLibraryData = {
			name: this.name,
			rootFieldSchema: root,
			treeSchema: new Map(),
			adapters: {},
		};
		const collection = buildViewSchemaCollection(this.lintConfiguration, [
			rootLibrary,
			...this.libraries,
		]);
		const typed: TypedSchemaCollection<FieldSchema<Kind, Types>> = {
			...collection,
			rootFieldSchema: root,
		};
		return typed;
	}

	/**
	 * Define a {@link FieldSchema}.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a {@link FieldSchema} which can be used as a struct field (see {@link SchemaBuilder.struct}),
	 * a map field (see {@link SchemaBuilder.map}), a field node(see {@link SchemaBuilder.fieldNode}) or the root field (see {@link SchemaBuilderBase.toDocumentSchema}).
	 *
	 * @privateRemarks
	 * TODO: since this APi surface is using classes, maybe just have users do `new FieldSchema` instead?
	 */
	public static field<Kind extends FieldKind, T extends AllowedTypes>(
		kind: Kind,
		...allowedTypes: T
	): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	/**
	 * Define a schema for a field.
	 * Same as {@link SchemaBuilderBase.field} but is less type safe and supports recursive types.
	 * This API is less safe to work around a limitation of TypeScript.
	 *
	 * T must extends `AllowedTypes`: This cannot be enforced via TypeScript since such an "extends" clauses cause recursive types to error with:
	 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
	 *
	 * TODO: Try and find a way to provide a more specific type without triggering the above error.
	 */
	public static fieldRecursive<
		Kind extends FieldKind,
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
		T extends FlexList<RecursiveTreeSchema>,
	>(kind: Kind, ...allowedTypes: T): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}
}

/**
 * Schema information collected by a SchemaBuilder, including referenced libraries.
 * Can be aggregated into other libraries by adding to their builders.
 * @alpha
 */
export interface SchemaLibrary extends TypedSchemaCollection {
	/**
	 * Schema data aggregated from a collection of libraries by a SchemaBuilder.
	 */
	readonly libraries: ReadonlySet<SchemaLibraryData>;
}
