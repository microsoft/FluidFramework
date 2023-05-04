/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { SchemaBuilder, TypedViewSchemaCollection } from "./schemaBuilder";

export {
	TreeSchema,
	FieldSchema,
	GlobalFieldSchema,
	Any,
	allowedTypesToTypeSet,
	AllowedTypes,
	FieldKindTypes,
} from "./typedTreeSchema";

// Below here are things that are used by the above, but not part of the desired API surface.
import * as InternalTypedSchemaTypes from "./internal";
export { InternalTypedSchemaTypes };
