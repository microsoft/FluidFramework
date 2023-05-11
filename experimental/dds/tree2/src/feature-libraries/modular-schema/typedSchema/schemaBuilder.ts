/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Adapters,
	FieldAdapter,
	GlobalFieldKey,
	rootFieldKey,
	TreeAdapter,
	TreeSchemaIdentifier,
} from "../../../core";
import { Sourced, SchemaCollection } from "../view";
import { brand, requireAssignableTo } from "../../../util";
import { optional, sequence, value, FieldKindTypes } from "../../defaultFieldKinds";
import type { FieldKinds } from "../..";
import { InternalTypes } from "../../schema-aware";
import { buildViewSchemaCollection } from "./buildViewSchemaCollection";
import {
	AllowedTypes,
	TreeSchema,
	TreeSchemaSpecification,
	GlobalFieldSchema,
	FieldSchema,
} from "./typedTreeSchema";
import { FlexList } from "./flexList";

// TODO: tests and examples for this file

/**
 * Placeholder for to `TreeSchema` to use in constraints where `TreeSchema` is desired but using it causes
 * recursive types to fail to compile due to TypeScript limitations.
 *
 * Using `TreeSchema` instead in some key "extends" clauses cause recursive types to error with:
 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
 *
 * TODO: how much more specific of a type can be provided without triggering the above error?
 * @alpha
 */
export type RecursiveTreeSchema = unknown;

/**
 * Placeholder for to `TreeSchemaSpecification` to use in constraints where `TreeSchemaSpecification` is desired but using it causes
 * recursive types to fail to compile due to TypeScript limitations.
 *
 * See `RecursiveTreeSchema`.
 *
 * TODO: how much more specific of a type can be provided without triggering the above error?
 * @alpha
 */
export type RecursiveTreeSchemaSpecification = unknown;

{
	type _check1 = requireAssignableTo<TreeSchemaSpecification, RecursiveTreeSchemaSpecification>;
	type _check2 = requireAssignableTo<TreeSchema, RecursiveTreeSchema>;
}

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaBuilder {
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly globalFieldSchema: Map<GlobalFieldKey, GlobalFieldSchema> = new Map();
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};

	/**
	 * @param name - Name used to refer to this builder in error messages. Has no impact on the actual generated schema.
	 * @param libraries - Libraries to include in this one. See `addLibraries` for details.
	 */
	public constructor(public readonly name: string, ...libraries: SchemaLibrary[]) {
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
	 * Contents withing the added libraries can still conflict however.
	 * Such errors will be reported when finalizing this builder into a library of document schema.
	 */
	public addLibraries(...libraries: SchemaLibrary[]) {
		for (const libs of libraries) {
			for (const lib of libs.libraries) {
				this.libraries.add(lib);
			}
		}
	}

	/**
	 * Define (and add to this library) a schema for an object.
	 *
	 * The name must be unique among all object schema in the the document schema.
	 */
	public object<Name extends string, T extends TreeSchemaSpecification>(
		name: Name,
		t: T,
	): TreeSchema<Name, T> {
		const schema = new TreeSchema(this, name, t);
		assert(!this.treeSchema.has(schema.name), "Conflicting TreeSchema names");
		this.treeSchema.set(schema.name, schema as TreeSchema);
		return schema;
	}

	/**
	 * Same as `object` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public objectRecursive<Name extends string, T extends RecursiveTreeSchemaSpecification>(
		name: Name,
		t: T,
	): TreeSchema<Name, T> {
		return this.object(name, t as TreeSchemaSpecification) as TreeSchema<Name, T>;
	}

	/**
	 * Define (and add to this library) a schema for an object that just wraps a primitive value.
	 * Such objects will be implicitly unwrapped to the value in some APIs.
	 *
	 * This is just a shorthand for a common case of `object`. See {@link SchemaBuilder.object} for details.
	 */
	public primitive<Name extends string, T extends InternalTypes.PrimitiveValueSchema>(
		name: Name,
		t: T,
	): TreeSchema<Name, { value: T }> {
		// TODO: add "primitive" metadata to schema, and set it here.
		return this.object(name, { value: t });
	}

	/**
	 * Define (and add to this library) a schema for a global field.
	 * Global fields can be included in the schema for multiple objects.
	 *
	 * The key must be unique among all object global fields in the the document schema.
	 *
	 * See {@link SchemaBuilder.field} for how to build the `field` parameter.
	 */
	public globalField<Kind extends FieldKindTypes, Types extends AllowedTypes>(
		key: string,
		field: FieldSchema<Kind, Types>,
	): GlobalFieldSchema<Kind, Types> {
		const schema = new GlobalFieldSchema(this, brand(key), field);
		assert(!this.globalFieldSchema.has(schema.key), "Conflicting global field keys");
		this.globalFieldSchema.set(schema.key, schema);
		return schema;
	}

	/**
	 * Define a schema for a field.
	 *
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of children are allowed in this field.
	 * @returns a field which can be used as a local field (see {@link SchemaBuilder.object}),
	 * global fields (see {@link SchemaBuilder.globalField}) or the root field (see {@link SchemaBuilder.intoDocumentSchema}).
	 */
	public static field<Kind extends FieldKindTypes, T extends AllowedTypes>(
		kind: Kind,
		...allowedTypes: T
	): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	/**
	 * Define a schema for an optional field.
	 * Shorthand or passing `FieldKinds.optional` to {@link SchemaBuilder.field}.
	 *
	 * Optional fields can be empty (undefined) or contain a single value of the allowed types.
	 *
	 * Optional fields can be used with last write wins OR first write wins merge resolution.
	 * TODO: ensure the above is true and easy to do.
	 * TODO:
	 * Better centralize the documentation about what kinds of merge semantics are available for field kinds.
	 * Maybe link editor?
	 */
	public static fieldOptional<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.optional, T> {
		return SchemaBuilder.field(optional, ...allowedTypes);
	}

	/**
	 * Define a schema for an value field.
	 * Shorthand or passing `FieldKinds.value` to {@link SchemaBuilder.field}.
	 *
	 * Value fields hold a single child.
	 *
	 * TODO: consider adding even shorter syntax where AllowedTypes can be used as a FieldSchema.
	 */
	public static fieldValue<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.value, T> {
		return SchemaBuilder.field(value, ...allowedTypes);
	}

	/**
	 * Define a schema for a sequence field.
	 * Sequence fields can contain any number of value of the allowed types in an ordered sequence.
	 *
	 * Edits to sequence fields are anchored relative to their surroundings, so concurrent edits can result in the indexes of nodes and edits getting shifted.
	 * To hold onto locations in sequence across an edit, use anchors.
	 *
	 * TODO:
	 * Add anchor API that can actually hold onto locations in a sequence.
	 * Currently only nodes can be held onto with anchors, and this does not replicate the behavior implemented for editing.
	 */
	public static fieldSequence<T extends AllowedTypes>(
		...t: T
	): FieldSchema<typeof FieldKinds.sequence, T> {
		return SchemaBuilder.field(sequence, ...t);
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
		T extends FlexList<RecursiveTreeSchema>,
	>(kind: Kind, ...allowedTypes: T): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	private finalize(): void {
		assert(!this.finalized, "SchemaBuilder can only be finalized once.");
		this.finalized = true;
		this.libraries.add({
			name: this.name,
			globalFieldSchema: this.globalFieldSchema,
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
		const collection = buildViewSchemaCollection([...this.libraries]);

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
	): TypedSchemaCollection<GlobalFieldSchema<Kind, Types>> {
		this.finalize();
		const rootField = new GlobalFieldSchema(this, rootFieldKey, root);
		const rootLibrary: SchemaLibraryData = {
			name: this.name,
			globalFieldSchema: new Map<GlobalFieldKey, GlobalFieldSchema>([
				[rootField.key, rootField],
			]),
			treeSchema: new Map(),
			adapters: {},
		};
		const collection = buildViewSchemaCollection([rootLibrary, ...this.libraries]);
		const typed: TypedSchemaCollection<GlobalFieldSchema<Kind, Types>> = {
			...collection,
			root: rootField,
		};
		return typed;
	}
}

/**
 * Schema data collected by a single SchemaBuilder (does not include referenced libraries).
 * @alpha
 */
export interface SchemaLibraryData {
	readonly name: string;
	readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, GlobalFieldSchema>;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly adapters: Adapters;
}

/**
 * @alpha
 */
export interface TypedSchemaCollection<T extends GlobalFieldSchema> extends SchemaCollection {
	/**
	 * Root field.
	 * Also in globalFieldSchema under the key {@link rootFieldKey}.
	 */
	readonly root: T;
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
 * Mutable adapter collection which records the associated factory.
 * See {@link Adapters}.
 */
export interface SourcedAdapters {
	readonly tree: (Sourced & TreeAdapter)[];
	readonly fieldAdapters: Map<GlobalFieldKey, Sourced & FieldAdapter>;
}

{
	type _check = requireAssignableTo<SourcedAdapters, Adapters>;
}
