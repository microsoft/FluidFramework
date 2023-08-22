/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	SchemaBuilder,
	TypedSchemaCollection,
	SchemaLibrary,
	SchemaLibraryData,
	SchemaLintConfiguration,
} from "./schemaBuilder";

export {
	TreeSchema,
	FieldSchema,
	Any,
	allowedTypesToTypeSet,
	AllowedTypes,
	LazyTreeSchema,
} from "./typedTreeSchema";

export { ViewSchema } from "./view";

// Below here are things that are used by the above, but not part of the desired API surface.
import * as InternalTypedSchemaTypes from "./internal";
export { InternalTypedSchemaTypes };
