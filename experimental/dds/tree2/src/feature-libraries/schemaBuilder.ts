/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../core";
import { RestrictiveReadonlyRecord } from "../util";
import { SchemaBuilderBase } from "./schemaBuilderBase";
import { FieldKinds } from "./default-field-kinds";
import { AllowedTypes, TreeSchema, FieldSchema } from "./typed-schema";

// TODO: tests and examples for this file

/**
 * Builds schema libraries, and the schema within them.
 *
 * @remarks
 * This type has some built in defaults which impact compatibility.
 * This includes which {@link FieldKind}s it uses.
 * To ensure that these defaults can be updated without compatibility issues,
 * this class is versioned: the number in its name indicates its compatibility,
 * and if its defaults are changed to ones that would not be compatible with a version of the application using the previous versions,
 * this number will be updated to make it impossible for an app to implicitly do a compatibility breaking change by updating this package.
 * Major package version updates are allowed to break API compatibility, but must not break content compatibility unless a corresponding code change is made in the app to opt in.
 *
 * @privateRemarks
 * // TODO: Maybe rename to SchemaBuilder1 because of the versioning implications above.
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
	public struct<Name extends TName, T extends RestrictiveReadonlyRecord<string, FieldSchema>>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { structFields: T }> {
		const schema = new TreeSchema(this, this.scoped(name), { structFields: t });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `struct` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public structRecursive<Name extends TName, T>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { structFields: T }> {
		return this.struct(
			name,
			t as unknown as RestrictiveReadonlyRecord<string, FieldSchema>,
		) as unknown as TreeSchema<`${TScope}.${Name}`, { structFields: T }>;
	}

	/**
	 * Define (and add to this library) a {@link TreeSchema} for a {@link MapNode}.
	 */
	public map<Name extends TName, T extends FieldSchema>(
		name: Name,
		fieldSchema: T,
	): TreeSchema<`${TScope}.${Name}`, { mapFields: T }> {
		const schema = new TreeSchema(this, this.scoped(name), { mapFields: fieldSchema });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `map` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public mapRecursive<Name extends TName, T>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { mapFields: T }> {
		return this.map(name, t as unknown as FieldSchema) as unknown as TreeSchema<
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
	public fieldNode<Name extends TName, T extends FieldSchema>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { structFields: { [""]: T } }> {
		const schema = new TreeSchema(this, this.scoped(name), { structFields: { [""]: t } });
		this.addNodeSchema(schema);
		return schema;
	}

	/**
	 * Same as `fieldNode` but with less type safety and works for recursive objects.
	 * Reduced type safety is a side effect of a workaround for a TypeScript limitation.
	 *
	 * See note on RecursiveTreeSchema for details.
	 */
	public fieldNodeRecursive<Name extends TName, T>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { structFields: { [""]: T } }> {
		return this.fieldNode(name, t as unknown as FieldSchema) as unknown as TreeSchema<
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
	public leaf<Name extends TName, T extends ValueSchema>(
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
	public static fieldOptional<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.optional, T> {
		return new FieldSchema(FieldKinds.optional, allowedTypes);
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
	public static fieldRequired<T extends AllowedTypes>(
		...allowedTypes: T
	): FieldSchema<typeof FieldKinds.required, T> {
		return new FieldSchema(FieldKinds.required, allowedTypes);
	}

	/**
	 * Define a schema for a {@link Sequence} field.
	 */
	public static fieldSequence<T extends AllowedTypes>(
		...t: T
	): FieldSchema<typeof FieldKinds.sequence, T> {
		return new FieldSchema(FieldKinds.sequence, t);
	}
}

/**
 * Extends {@link SchemaBuilder1} with functionality only used to create built in special libraries.
 * Should not be package exported.
 */
export class SchemaBuilderInternal<
	TScope extends `com.fluidframework.${string}`,
> extends SchemaBuilder<TScope> {}
