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
	ValueSchema,
} from "../../../core";
import { Sourced, SchemaCollection } from "../view";
import { brand, requireAssignableTo, RestrictiveReadonlyRecord } from "../../../util";
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

	private addNodeSchema<T extends TreeSchema<string, any>>(schema: T): void {
		assert(!this.treeSchema.has(schema.name), 0x6ab /* Conflicting TreeSchema names */);
		this.treeSchema.set(schema.name, schema as TreeSchema);
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
		this.addNodeSchema(schema);
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
	 * Define (and add to this library) a {@link TreeSchema} for a struct node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 *
	 * Struct nodes consist of a finite collection of fields, each with their own (distinct) key and {@link FieldSchema}.
	 *
	 * @remarks
	 * These "Structs" resemble (and are named after) "Structs" from a wide variety of programming languages
	 * (Including Algol 68, C, Go, Rust, C# etc.).
	 * Struct nodes also somewhat resemble JavaScript objects: this analogy is less precise (objects don't have a fixed schema for example),
	 * which is why "Struct" nodes are named after "Structs" instead.
	 *
	 * Another common name for this abstraction is [record](https://en.wikipedia.org/wiki/Record_(computer_science)).
	 * The name "Record" is avoided (in favor of Struct) here because it has less precise connotations for most TypeScript developers.
	 * For example, TypeScript has a built in `Record` type, but it requires all of the fields to have the same type,
	 * putting its semantics half way between this library's "struct" schema and "map" schema.
	 */
	public struct<Name extends string, T extends RestrictiveReadonlyRecord<string, FieldSchema>>(
		name: Name,
		t: T,
	): TreeSchema<Name, { local: T }> {
		const schema = new TreeSchema(this, name, { local: t });
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
	): TreeSchema<Name, { local: T }> {
		return this.struct(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, FieldSchema>,
		) as unknown as TreeSchema<Name, { local: T }>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a map node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 *
	 * Map nodes consist of a collection of fields, each with a unique key, but with the content of each following the same schema.
	 * The schema permits any string to be used as a key.
	 *
	 * @remarks
	 * These node resemble the TypeScript Map type, parameterized as `Map<string, fieldSchema>` with one important difference:
	 * Unlike TypeScript Map type, Map nodes can always provide a reference to any field looked up, even if its never been set.
	 * This means that, for example, a Map node of sequenceFields will return an empty sequence when a previously unused key is looked up, and that sequence can be used to insert new items into the field.
	 * Additionally empty fields (those containing no nodes) are not distinguished from fields which do not exist.
	 * This differs from JavaScript Maps which have a subtle distinction between storing undefined as a value in the map and deleting an entry from the map.
	 */
	public map<Name extends string, T extends FieldSchema>(
		name: Name,
		fieldSchema: T,
	): TreeSchema<Name, { extraLocalFields: T }> {
		const schema = new TreeSchema(this, name, { extraLocalFields: fieldSchema });
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
	): TreeSchema<Name, { extraLocalFields: T }> {
		return this.map(name, t as unknown as FieldSchema) as unknown as TreeSchema<
			Name,
			{ extraLocalFields: T }
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a field node.
	 * Such nodes will be implicitly unwrapped to the field in some APIs.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 *
	 * A field is a node with a single field which captures all its meaning.
	 *
	 * @remarks
	 * Field nodes are mainly a shorthand for a struct with a single field.
	 *
	 * There are several use-cases where it makes sense to use a field node.
	 * Here are a few:
	 * - When it's necessary to differentiate between an empty sequence, and no sequence.
	 * One case where this is needed is encoding Json.
	 * - When polymorphism over file kinds is required.
	 * For example when encoding a schema for a type like
	 * `Foo[] | Bar[]`, `Foo | Foo[]` or `Optional<Foo> | Optional<Bar>` (Where `Optional` is our Optional field kind, not TypeScript's `Optional`).
	 * Since this schema system only allows `|` of {@link TreeSchema} (and only when declaring a {@link FieldSchema}), see {@link SchemaBuilder.field},
	 * these aggregate types are most simply expressed by creating fieldNodes for the terms like `Foo[]`, and `Optional<Foo>`.
	 * Note that these are distinct from types like `(Foo | Bar)[]` and `Optional<Foo | Bar>` which can be expressed as single fields without extra nodes.
	 * - When a distinct merge identity is desired for a field.
	 * For example, if the application wants to be able to have an optional node or a sequence which it can pass around, edit and observe changes to,
	 * in some cases (like when the content is moved to a different parent) this can be more flexible if a field node is introduced
	 * to create a separate logical entity (node) which wraps the field.
	 * This can even be useful with value fields to wrap terminal nodes if a stable merge identity is needed that survives editing the value (which is done by replacing the leaf node).
	 *
	 * Field nodes store their field under the {@link FieldKey} {@link EmptyKey}.
	 *
	 * TODO: Write and link document outlining field vs node data model and the separation of concerns related to that.
	 * TODO: Maybe find a better name for this.
	 */
	public fieldNode<Name extends string, T extends FieldSchema>(
		name: Name,
		t: T,
	): TreeSchema<Name, { local: { [""]: T } }> {
		const schema = new TreeSchema(this, name, { local: { [""]: t } });
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
	): TreeSchema<Name, { local: { [""]: T } }> {
		return this.fieldNode(name, t as unknown as FieldSchema) as unknown as TreeSchema<
			Name,
			{ local: { [""]: T } }
		>;
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
	): TreeSchema<Name, { value: T }> {
		const schema = new TreeSchema(this, name, { value: t });
		this.addNodeSchema(schema);
		return schema;
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
		assert(!this.globalFieldSchema.has(schema.key), 0x6ac /* Conflicting global field keys */);
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
		assert(!this.finalized, 0x6ad /* SchemaBuilder can only be finalized once. */);
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
