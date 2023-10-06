/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds } from "./default-field-kinds";
import { SchemaLibraryData, TypedSchemaCollection } from "./typed-schema";
import { SchemaBuilderBase } from "./schemaBuilderBase";

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
 * @sealed @alpha
 */
export class SchemaBuilder2<
	TScope extends string,
	TName extends number | string = string,
> extends SchemaBuilderBase<typeof FieldKinds, TScope, TName> {}
