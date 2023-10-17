/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	TreeSchema,
	FieldSchema,
	Any,
	allowedTypesToTypeSet,
	AllowedTypes,
	LazyTreeSchema,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	StructSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	DocumentSchema,
	Unenforced,
	AllowedTypeSet,
	MapFieldSchema,
	SchemaCollection,
} from "./typedTreeSchema";

export { ViewSchema } from "./view";

export {
	bannedFieldNames,
	fieldApiPrefixes,
	validateStructFieldName,
	SchemaLibraryData,
	SchemaLintConfiguration,
	aggregateSchemaLibraries,
	schemaLintDefault,
} from "./schemaCollection";

export { FlexList } from "./flexList";

// Below here are things that are used by the above, but not part of the desired API surface.
import * as InternalTypedSchemaTypes from "./internal";
export { InternalTypedSchemaTypes };
