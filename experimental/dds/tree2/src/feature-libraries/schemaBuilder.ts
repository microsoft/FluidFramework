/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../core";
import { SchemaBuilderBase, SchemaBuilderOptions } from "./schemaBuilderBase";
import { FieldKinds } from "./default-field-kinds";
import { TreeSchema } from "./typed-schema";

/**
 * Extends {@link SchemaBuilderBase} with functionality only used to create built in special libraries.
 * Defaults to "required" fields.
 * @privateRemarks Should not be package exported.
 */
export class SchemaBuilderInternal<
	TScope extends `com.fluidframework.${string}`,
> extends SchemaBuilderBase<TScope, typeof FieldKinds.required> {
	public constructor(options: SchemaBuilderOptions<TScope>) {
		super(FieldKinds.required, options);
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
	public leaf<Name extends string, const T extends ValueSchema>(
		name: Name,
		t: T,
	): TreeSchema<`${TScope}.${Name}`, { leafValue: T }> {
		const schema = new TreeSchema(this, this.scoped(name), { leafValue: t });
		this.addNodeSchema(schema);
		return schema;
	}
}
