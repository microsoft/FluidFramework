/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilderBase, SchemaBuilderOptions } from "./schemaBuilderBase";
import { FieldKinds } from "./default-field-kinds";

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
}
