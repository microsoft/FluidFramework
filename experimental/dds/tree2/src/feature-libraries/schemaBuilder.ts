/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ValueSchema } from "../core";
import { Assume, RestrictiveReadonlyRecord, transformObjectMap } from "../util";
import { SchemaBuilderBase } from "./schemaBuilderBase";
import { FieldKinds } from "./default-field-kinds";
import {
	AllowedTypes,
	TreeSchema,
	FieldSchema,
	Any,
	TypedSchemaCollection,
	Unenforced,
} from "./typed-schema";
import { FieldKind } from "./modular-schema";

// TODO: tests and examples for this file

/**
 * Builds schema libraries, and the schema within them.
 *
 * @remarks
 * Fields, when inferred from {@link ImplicitFieldSchema}, default to the `Required` {@link FieldKind}.
 *
 * This type has some built in defaults which impact compatibility.
 * This includes which {@link FieldKind}s it uses.
 * To ensure that these defaults can be updated without compatibility issues,
 * this class is versioned: the number in its name indicates its compatibility,
 * and if its defaults are changed to ones that would not be compatible with a version of the application using the previous versions,
 * this number will be updated to make it impossible for an app to implicitly do a compatibility breaking change by updating this package.
 * Major package version updates are allowed to break API compatibility, but must not break content compatibility unless a corresponding code change is made in the app to opt in.
 *
 * @privateRemarks
 * TODO: Maybe rename to SchemaBuilder1 because of the versioning implications above.
 * @sealed @alpha
 */
export class SchemaBuilder<
	TScope extends string = string,
	TName extends number | string = string,
> extends SchemaBuilderBase<TScope, TName> {
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
		{ structFields: { [key in keyof T]: NormalizeField<T[key], DefaultFieldKind> } }
	> {
		const schema = new TreeSchema(this, this.scoped(name), {
			structFields: transformObjectMap(
				t,
				(field): FieldSchema => normalizeField(field, DefaultFieldKind),
			) as {
				[key in keyof T]: NormalizeField<T[key], DefaultFieldKind>;
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
	): TreeSchema<`${TScope}.${Name}`, { mapFields: NormalizeField<T, DefaultFieldKind> }> {
		const schema = new TreeSchema(this, this.scoped(name), {
			mapFields: normalizeField(fieldSchema, DefaultFieldKind),
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
		{ structFields: { [""]: NormalizeField<T, DefaultFieldKind> } }
	> {
		const schema = new TreeSchema(this, this.scoped(name), {
			structFields: { [""]: normalizeField(fieldSchema, DefaultFieldKind) },
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

	// TODO: move this to SchemaBuilderInternal once usages of it have been replaces with use of the leaf domain.
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
	public leaf<Name extends TName, const T extends ValueSchema>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { leafValue: T }> {
		const schema = new TreeSchema(this, this.scoped(name), { leafValue: t });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Define a schema for an {@link OptionalField}.
	 * Shorthand or passing `FieldKinds.optional` to {@link FieldSchema}.
	 */
	public static fieldOptional<const T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.optional, T> {
		return FieldSchema.create(FieldKinds.optional, allowedTypes);
	}

	/**
	 * Define a schema for a {@link RequiredField}.
	 * Shorthand or passing `FieldKinds.required` to {@link FieldSchema}.
	 *
	 * @privateRemarks
	 * TODO: Consider adding even shorter syntax where:
	 * - AllowedTypes can be used as a FieldSchema (Or SchemaBuilder takes a default field kind).
	 * - A TreeSchema can be used as AllowedTypes in the non-polymorphic case.
	 */
	public static fieldRequired<const T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.required, T> {
		return FieldSchema.create(FieldKinds.required, allowedTypes);
	}

	/**
	 * Define a schema for a {@link Sequence} field.
	 */
	public static fieldSequence<const T extends AllowedTypes>(
		...t: T
	): FieldSchema<typeof FieldKinds.sequence, T> {
		return FieldSchema.create(FieldKinds.sequence, t);
	}

	/**
	 * Produce a TypedSchemaCollection which captures the content added to this builder, any additional SchemaLibraries that were added to it and a root field.
	 * Can be used with schematize to provide schema aware access to document content.
	 *
	 * @remarks
	 *
	 * May only be called once after adding content to builder is complete.
	 */
	public toDocumentSchema<const TSchema extends ImplicitFieldSchema>(
		root: TSchema,
	): TypedSchemaCollection<NormalizeField<TSchema, DefaultFieldKind>> {
		return this.toDocumentSchemaInternal(normalizeField(root, DefaultFieldKind));
	}
}

const DefaultFieldKind = FieldKinds.required;

/**
 * Default field kind {@link SchemaBuilder} uses with {@link ImplicitFieldSchema}.
 * @alpha
 */
export type DefaultFieldKind = typeof FieldKinds.required;

/**
 * Extends {@link SchemaBuilder1} with functionality only used to create built in special libraries.
 * @privateRemarks Should not be package exported.
 */
export class SchemaBuilderInternal<
	TScope extends `com.fluidframework.${string}`,
> extends SchemaBuilder<TScope> {}

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
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 * @alpha
 */
export type NormalizeAllowedTypes<TSchema extends ImplicitAllowedTypes> = TSchema extends TreeSchema
	? readonly [TSchema]
	: TSchema extends Any
	? readonly [Any]
	: TSchema;

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
	assert(Array.isArray(schema), "invalid ImplicitAllowedTypes");
	return schema as unknown as NormalizeAllowedTypes<TSchema>;
}

/**
 * Type that when combined with a default {@link FieldKind} can be normalized into a {@link FieldSchema}.
 * @alpha
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

/**
 * Generalized version of AllowedTypes allowing for more concise expressions in some cases.
 * @alpha
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeSchema | Any;
