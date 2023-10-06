/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { assert } from "@fluidframework/core-utils";
import { Adapters, FieldKey, TreeSchemaIdentifier, TreeTypeSet, ValueSchema } from "../core";
import { MakeNominal, RestrictiveReadonlyRecord, objectToMap } from "../util";
import { SchemaLintConfiguration, schemaLintDefault } from "./typed-schema";
import { FieldKind, FullSchemaPolicy } from "./modular-schema";
import { FieldKinds } from "./default-field-kinds";
import { Any } from "./typed-schema/typedTreeSchema";
import { LazyItem, normalizeFlexList } from "./typed-schema/flexList";

// TODO: tests and examples for this file

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaBuilder<
	TFieldKinds extends Record<string, FieldKind>,
	//  extends keyof TFieldKinds = "Required",
	TScope extends string,
	TName extends number | string = string,
> {
	private readonly lintConfiguration: SchemaLintConfiguration;
	private readonly libraries: Set<SchemaLibraryData>;
	private finalized: boolean = false;
	private readonly treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	private readonly adapters: Adapters = {};
	public readonly scope: TScope;
	public readonly field: {
		readonly [Property in keyof TFieldKinds]: <TTypes extends AllowedTypes>(
			...types: TTypes
		) => FieldSchema<TFieldKinds[Property], TTypes>;
	};

	// Unneeded due to use of fixRecursiveReference
	// public readonly fieldRecursive: {
	// 	readonly [Property in keyof TFieldKinds]: <TTypes extends unknown[]>(
	// 		...types: TTypes
	// 	) => FieldSchema<TFieldKinds[Property], TTypes>;
	// };

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
		fieldKinds: TFieldKinds;
	}) {
		this.lintConfiguration = { ...schemaLintDefault, ...options.lint };
		this.libraries = new Set();
		this.addLibraries(...(options.libraries ?? []));
		this.scope = options.scope;

		const record: Record<string, FieldKind> = Object.create(null);

		for (const [key, kind] of Object.entries(options.fieldKinds)) {
			Object.defineProperty(record, key, {
				value: (...types: AllowedTypes) => new FieldSchema(kind, types),
				configurable: false,
				enumerable: true,
			});
		}

		this.field = record as unknown as {
			readonly [Property in keyof TFieldKinds]: <TTypes extends AllowedTypes>(
				...types: TTypes
			) => FieldSchema<TFieldKinds[Property], TTypes>;
		};
		// this.fieldRecursive = this.field as any;
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

	protected addNodeSchema(schema: TreeSchema): void {
		assert(!this.treeSchema.has(schema.identifier), "Conflicting TreeSchema names");
		this.treeSchema.set(schema.identifier, schema);
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link Struct} node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 */
	public struct<Name extends TName, T extends RestrictiveReadonlyRecord<string, FieldSchema>>(
		name: Name,
		t: T,
	): Holder<{
		identifier: `${TScope}.${Name}` & TreeSchemaIdentifier;
		structFieldsObject: T;
		structFields: ReadonlyMap<FieldKey, FieldSchema>;
	}> {
		const identifier = this.scoped(name);
		const map = objectToMap<FieldKey, FieldSchema>(t);
		const schema = class {
			public static readonly identifier = identifier;
			public static readonly structFieldsObject = t;
			public static readonly structFields = map;
			public readonly identifier = identifier;
			public readonly structFieldsObject = t;
			public readonly structFields = map;
			public constructor(dummy: never) {}
		};
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link MapNode}.
	 */
	public map<Name extends TName, T extends MapFieldSchema>(
		name: Name,
		fieldSchema: T,
	): Holder<{ identifier: `${TScope}.${Name}` & TreeSchemaIdentifier; mapFields: T }> {
		const identifier = this.scoped(name);
		const schema = class {
			public static readonly identifier = identifier;
			public static readonly mapFields = fieldSchema;
			public readonly identifier = identifier;
			public readonly mapFields = fieldSchema;
			public constructor(dummy: never) {}
		};
		this.addNodeSchema(schema);
		return schema;
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
	public fieldNode<Name extends TName, T extends FieldSchema>(
		name: Name,
		fieldSchema: T,
	): Holder<{ identifier: `${TScope}.${Name}` & TreeSchemaIdentifier; fieldSchema: T }> {
		const identifier = this.scoped(name);
		const schema = class {
			public static readonly identifier = identifier;
			public static readonly fieldSchema = fieldSchema;
			public readonly identifier = identifier;
			public readonly fieldSchema = fieldSchema;
			public constructor(dummy: never) {}
		};
		this.addNodeSchema(schema);
		return schema;
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

	// /**
	//  * Produce SchemaLibraries which capture the content added to this builder, as well as any additional SchemaLibraries that were added to it.
	//  * May only be called once after adding content to builder is complete.
	//  */
	// public finalize(): SchemaLibrary {
	// 	this.finalizeCommon();

	// 	// Check for errors:
	// 	const collection = buildViewSchemaCollection(this.lintConfiguration, this.libraries);

	// 	return { ...collection, libraries: this.libraries };
	// }

	// /**
	//  * Produce a TypedSchemaCollection which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	//  * Can be used with schematize to provide schema aware access to document content.
	//  *
	//  * May only be called once after adding content to builder is complete.
	//  */
	// public toDocumentSchema<
	// 	Kind extends TFieldKinds[keyof TFieldKinds] & FieldKind,
	// 	Types extends AllowedTypes,
	// >(root: FieldSchema<Kind, Types>): TypedSchemaCollection<FieldSchema<Kind, Types>> {
	// 	this.finalizeCommon();
	// 	const rootLibrary: SchemaLibraryData = {
	// 		name: this.name,
	// 		rootFieldSchema: root,
	// 		treeSchema: new Map(),
	// 		adapters: {},
	// 	};
	// 	const collection = buildViewSchemaCollection(this.lintConfiguration, [
	// 		rootLibrary,
	// 		...this.libraries,
	// 	]);
	// 	const typed: TypedSchemaCollection<FieldSchema<Kind, Types>> = {
	// 		...collection,
	// 		rootFieldSchema: root,
	// 	};
	// 	return typed;
	// }
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

/**
 * Interface which carries the runtime and compile type data (from the generic type parameter) in a member.
 * This is also a constructor so that instances of it can be extended as classes.
 * Using classes in this way allows introducing a named type and a named value at the same time, helping keep the runtime and compile time information together and easy to refer to un a uniform way.
 * Additionally, this works around https://github.com/microsoft/TypeScript/issues/55832 which causes similar patterns with less explicit types to infer "any" in the d.ts file.
 * @alpha
 */
export type Holder<T> = T & (new (dummy: never) => T);

/**
 * @alpha
 */
export type TreeSchema = MapSchema | FieldNodeSchema | StructSchema | LeafSchema;

/**
 * @alpha
 */
export interface TreeSchemaBase {
	readonly identifier: TreeSchemaIdentifier;
}

/**
 * @alpha
 */
export interface MapSchema extends TreeSchemaBase {
	readonly mapFields: MapFieldSchema;
}

/**
 * @alpha
 */
export interface LeafSchema extends TreeSchemaBase {
	readonly leafValue: ValueSchema;
}

/**
 * @alpha
 */
export interface StructSchema extends TreeSchemaBase {
	readonly structFieldsObject: RestrictiveReadonlyRecord<string, FieldSchema>;
	readonly structFields: ReadonlyMap<FieldKey, FieldSchema>;
}

/**
 * @alpha
 */
export interface FieldNodeSchema extends TreeSchemaBase {
	readonly fieldSchema: FieldSchema;
}

/**
 * Types for use in fields.
 *
 * "Any" is boxed in an array to allow use as variadic parameter.
 * @alpha
 */
export type AllowedTypes = [Any] | readonly LazyItem<TreeSchema>[];

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<Kind extends FieldKind = FieldKind, Types = AllowedTypes> {
	/**
	 * Schema for a field which must always be empty.
	 */
	public static readonly empty = new FieldSchema(FieldKinds.forbidden, []);

	protected _typeCheck?: MakeNominal;

	/**
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of tree nodes are allowed in this field.
	 */
	public constructor(
		public readonly kind: Kind,
		public readonly allowedTypes: Types,
	) {}

	public get types(): TreeTypeSet {
		return allowedTypesToTypeSet(this.allowedTypes as unknown as AllowedTypes);
	}
}

/**
 * Convert {@link AllowedTypes} to {@link TreeTypeSet}.
 * @alpha
 */
export function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	if (allowedTypesIsAny(t)) {
		return undefined;
	}
	const list: readonly (() => TreeSchema)[] = normalizeFlexList(t);
	const names = list.map((f) => f().identifier);
	return new Set(names);
}

/**
 * Schema data that can be be used to view a document.
 * Strongly typed over its rootFieldSchema.
 *
 * @remarks
 * This type is mainly used as a type constraint to mean that the code working with it requires strongly typed schema.
 * The actual type used will include detailed schema information for all the types in the collection.
 * This pattern is used to implement SchemaAware APIs.
 *
 * @alpha
 */

export interface TypedSchemaCollection<T extends FieldSchema = FieldSchema> {
	readonly rootFieldSchema: T;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly policy: FullSchemaPolicy;
	readonly adapters: Adapters;
}

/**
 * Checks if an {@link AllowedTypes} is {@link (Any:type)}.
 * @alpha
 */
export function allowedTypesIsAny(t: AllowedTypes): t is [Any] {
	return t.length === 1 && t[0] === Any;
}

/**
 * Subset of FieldSchema thats legal in maps.
 * This requires empty to be a valid value for the map.
 * @alpha
 */
export type MapFieldSchema = FieldSchema<typeof FieldKinds.optional | typeof FieldKinds.sequence>;

/**
 * Schema data collected by a single SchemaBuilder (does not include referenced libraries).
 * @alpha
 */
export interface SchemaLibraryData {
	readonly name: string;
	readonly rootFieldSchema?: FieldSchema;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly adapters: Adapters;
}

/**
 * Pass recursive {@link AllowedTypes} to this to nudge the compiler into inferring types correctly.
 * This works around a [TypeScript Limitation](https://github.com/microsoft/TypeScript/issues/55758).
 *
 * Usage:
 * ```typescript
 * const childTypes = () => MyNode;
 * fixRecursiveReference(childTypes);
 * export class MyNode extends builder.map("Node", builder.field.optional(childTypes)) {}
 * ```
 *
 * That is the same as the more concise:
 * ```typescript
 * export class MyNode extends builder.map("Node", builder.field.optional(() => MyNode)) {}
 * ```
 *
 * Except that this version fails to compile.
 */
export function fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}
