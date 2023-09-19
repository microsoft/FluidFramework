/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Adapters, TreeSchemaIdentifier, ValueSchema } from "../core";
import { RestrictiveReadonlyRecord } from "../util";
import { FieldKindTypes, FieldKinds } from "./default-field-kinds";
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

// TODO: tests and examples for this file

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaBuilder {
	private readonly lintConfiguration: SchemaLintConfiguration;
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};

	/**
	 * @param name - Name used to refer to this builder in error messages. Has no impact on the actual generated schema.
	 * @param lint - Optional configuration for "linting". See {@link SchemaLintConfiguration}. Currently defaults to enabling all lints.
	 * @param libraries - Libraries to include in this one. See `addLibraries` for details.
	 */
	public constructor(
		public readonly name: string,
		lint: Partial<SchemaLintConfiguration> = {},
		...libraries: SchemaLibrary[]
	) {
		this.lintConfiguration = { ...schemaLintDefault, ...lint };
		this.libraries = new Set();
		this.addLibraries(...libraries);
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
	public addLibraries(...libraries: SchemaLibrary[]) {
		for (const libs of libraries) {
			for (const lib of libs.libraries) {
				this.libraries.add(lib);
			}
		}
	}

	private addNodeSchema<T extends TreeSchema<string, any>>(schema: T): void {
		assert(!this.treeSchema.has(schema.name), 0x6ab /* Conflicting TreeSchema names */);
		this.treeSchema.set(schema.name, schema as TreeSchema);
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link Struct} node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 */
	public struct<Name extends string, T extends RestrictiveReadonlyRecord<string, FieldSchema>>(
		name: Name,
		t: T,
	): TreeSchema<Name, { structFields: T }> {
		const schema = new TreeSchema(this, name, { structFields: t });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `struct` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public structRecursive<Name extends string, T>(
		name: Name,
		t: T,
	): TreeSchema<Name, { structFields: T }> {
		return this.struct(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, FieldSchema>,
		) as unknown as TreeSchema<Name, { structFields: T }>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link MapNode}.
	 */
	public map<Name extends string, T extends FieldSchema>(
		name: Name,
		fieldSchema: T,
	): TreeSchema<Name, { mapFields: T }> {
		const schema = new TreeSchema(this, name, { mapFields: fieldSchema });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `map` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public mapRecursive<Name extends string, T>(
		name: Name,
		t: T,
	): TreeSchema<Name, { mapFields: T }> {
		return this.map(name, t as unknown as FieldSchema) as unknown as TreeSchema<
			Name,
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
	public fieldNode<Name extends string, T extends FieldSchema>(
		name: Name,
		t: T,
	): TreeSchema<Name, { structFields: { [""]: T } }> {
		const schema = new TreeSchema(this, name, { structFields: { [""]: t } });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `fieldNode` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public fieldNodeRecursive<Name extends string, T>(
		name: Name,
		t: T,
	): TreeSchema<Name, { structFields: { [""]: T } }> {
		return this.fieldNode(name, t as unknown as FieldSchema) as unknown as TreeSchema<
			Name,
			{ structFields: { [""]: T } }
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a node that wraps a value.
	 * Such nodes will be implicitly unwrapped to the value in some APIs.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 *
	 * In addition to the normal properties of all nodes (having a schema for example),
	 * Leaf nodes only contain a value.
	 * Leaf nodes cannot have fields.
	 *
	 * TODO: Maybe ban undefined from allowed values here.
	 * TODO: Decide and document how unwrapping works for non-primitive terminals.
	 */
	public leaf<Name extends string, T extends ValueSchema>(
		name: Name,
		t: T,
	): TreeSchema<Name, { leafValue: T }> {
		const schema = new TreeSchema(this, name, { leafValue: t });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define a {@link FieldSchema}.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a {@link FieldSchema} which can be used as a struct field (see {@link SchemaBuilder.struct}),
	 * a map field (see {@link SchemaBuilder.map}), a field node(see {@link SchemaBuilder.fieldNode}) or the root field (see {@link SchemaBuilder.intoDocumentSchema}).
	 *
	 * @privateRemarks
	 * TODO: since this APi surface is using classes, maybe just have users do `new FieldSchema` instead?
	 */
	public static field<Kind extends FieldKindTypes, T extends AllowedTypes>(
		kind: Kind,
		...allowedTypes: T
	): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	/**
	 * Define a schema for an {@link OptionalField}.
	 * Shorthand or passing `FieldKinds.optional` to {@link SchemaBuilder.field}.
	 */
	public static fieldOptional<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.optional, T> {
		return SchemaBuilder.field(FieldKinds.optional, ...allowedTypes);
	}

	/**
	 * Define a schema for a {@link RequiredField}.
	 * Shorthand or passing `FieldKinds.value` to {@link SchemaBuilder.field}.
	 *
	 * @privateRemarks
	 * TODO: Consider adding even shorter syntax where:
	 * - AllowedTypes can be used as a FieldSchema (Or SchemaBuilder takes a default field kind).
	 * - A TreeSchema can be used as AllowedTypes in the non-polymorphic case.
	 */
	public static fieldValue<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.value, T> {
		return SchemaBuilder.field(FieldKinds.value, ...allowedTypes);
	}

	/**
	 * Define a schema for a {@link Sequence} field.
	 */
	public static fieldSequence<T extends AllowedTypes>(
		...t: T
	): FieldSchema<typeof FieldKinds.sequence, T> {
		return SchemaBuilder.field(FieldKinds.sequence, ...t);
	}

	/**
	 * Define a schema for a field.
	 * Same as {@link SchemaBuilder.field} but is less type safe and supports recursive types.
	 * This API is less safe to work around a limitation of TypeScript.
	 *
	 * T must extends `AllowedTypes`: This cannot be enforced via TypeScript since such an "extends" clauses cause recursive types to error with:
	 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
	 *
	 * TODO: Try and find a way to provide a more specific type without triggering the above error.
	 */
	public static fieldRecursive<
		Kind extends FieldKindTypes,
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
		T extends FlexList<RecursiveTreeSchema>,
	>(kind: Kind, ...allowedTypes: T): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	private finalize(): void {
		assert(!this.finalized, 0x6ad /* SchemaBuilder can only be finalized once. */);
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
	public intoLibrary(): SchemaLibrary {
		this.finalize();

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
	public intoDocumentSchema<Kind extends FieldKindTypes, Types extends AllowedTypes>(
		root: FieldSchema<Kind, Types>,
	): TypedSchemaCollection<FieldSchema<Kind, Types>> {
		this.finalize();
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
