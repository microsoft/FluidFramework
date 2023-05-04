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
import { Sourced, ViewSchemaCollection } from "../view";
import { brand, requireAssignableTo } from "../../../util";
import { optional, sequence, value } from "../../defaultFieldKinds";
import type { FieldKinds } from "../..";
import { InternalTypes } from "../../schema-aware";
import { buildViewSchemaCollection } from "./buildViewSchemaCollection";
import {
	AllowedTypes,
	TreeSchema,
	TreeSchemaSpecification,
	GlobalFieldSchema,
	FieldSchema,
	Kinds,
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
 */
export type RecursiveTreeSchema = unknown;

/**
 * Placeholder for to `TreeSchemaSpecification` to use in constraints where `TreeSchemaSpecification` is desired but using it causes
 * recursive types to fail to compile due to TypeScript limitations.
 *
 * See `RecursiveTreeSchema`.
 *
 * TODO: how much more specific of a type can be provided without triggering the above error?
 */
export type RecursiveTreeSchemaSpecification = unknown;

{
	type _check = requireAssignableTo<TreeSchemaSpecification, RecursiveTreeSchemaSpecification>;
}

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaBuilder {
	private readonly libraries: Set<SchemaLibrary>;
	private finalized: boolean = false;
	private readonly globalFieldSchema: Map<GlobalFieldKey, GlobalFieldSchema> = new Map();
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};
	public constructor(public readonly name: string, ...libraries: ViewSchemaLibrary[]) {
		this.libraries = new Set();
		this.addLibraries(...libraries);
	}

	public addLibraries(...libraries: ViewSchemaLibrary[]) {
		for (const libs of libraries) {
			for (const lib of libs.libraries) {
				this.libraries.add(lib);
			}
		}
	}

	/**
	 * Define (and add to this library) a schema for an object.
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
	 */
	public globalField<Kind extends Kinds, Types extends AllowedTypes>(
		name: string,
		t: FieldSchema<Kind, Types>,
	): GlobalFieldSchema<Kind, Types> {
		const schema = new GlobalFieldSchema(this, brand(name), t);
		assert(!this.globalFieldSchema.has(schema.key), "Conflicting global field keys");
		this.globalFieldSchema.set(schema.key, schema);
		return schema;
	}

	/**
	 * Define a schema for an optional field.
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
	 * TODO: maybe remove use-cases for this
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
	 */
	public static field<Kind extends Kinds, T extends AllowedTypes>(
		kind: Kind,
		...allowedTypes: T
	): FieldSchema<Kind, T> {
		return new FieldSchema(kind, allowedTypes);
	}

	/**
	 * Define a schema for a field.
	 * Same as `field` but takes in `AllowedTypes`, is less type safe and supports recursive types.
	 * This API is less safe and less ergonomic to work around a limitation of TypeScript.
	 *
	 * T must extends `AllowedTypes`: This cannot be enforced via TypeScript since such an "extends" clauses cause recursive types to error with:
	 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
	 *
	 * TODO: how much more specific of a type can be provided without triggering the above error?
	 */
	public static fieldRecursive<Kind extends Kinds, T extends FlexList<RecursiveTreeSchema>>(
		kind: Kind,
		...allowedTypes: T
	): FieldSchema<Kind, T> {
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
	public intoLibrary(): ViewSchemaLibrary {
		this.finalize();

		// Check for errors:
		const collection = buildViewSchemaCollection([...this.libraries]);

		return { ...collection, libraries: this.libraries };
	}

	/**
	 * Produce a TypedViewSchemaCollection which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	 * Can be used with schematize to provide schema aware access to document content.
	 *
	 * May only be called once after adding content to builder is complete.
	 */
	public intoDocumentSchema<Kind extends Kinds, Types extends AllowedTypes>(
		root: FieldSchema<Kind, Types>,
	): TypedViewSchemaCollection<GlobalFieldSchema<Kind, Types>> {
		this.finalize();
		const rootField = new GlobalFieldSchema(this, rootFieldKey, root);
		const rootLibrary: SchemaLibrary = {
			name: "Root Field",
			globalFieldSchema: new Map<GlobalFieldKey, GlobalFieldSchema>([
				[rootField.key, rootField],
			]),
			treeSchema: new Map(),
			adapters: {},
		};
		const collection = buildViewSchemaCollection([rootLibrary, ...this.libraries]);
		const typed: TypedViewSchemaCollection<GlobalFieldSchema<Kind, Types>> = {
			...collection,
			root: rootField,
		};
		return typed;
	}
}

export type SchemaLibraries = ReadonlySet<SchemaLibrary>;

export interface SchemaLibrary {
	readonly name: string;
	readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, GlobalFieldSchema>;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly adapters: Adapters;
}

export interface TypedViewSchemaCollection<T extends GlobalFieldSchema>
	extends ViewSchemaCollection {
	/**
	 * Root field.
	 * Also in globalFieldSchema under the key {@link rootFieldKey}.
	 */
	readonly root: T;
}

export interface ViewSchemaLibrary extends ViewSchemaCollection {
	/**
	 * Root field.
	 * Also in globalFieldSchema under the key {@link rootFieldKey}.
	 */
	readonly libraries: ReadonlySet<SchemaLibrary>;
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
