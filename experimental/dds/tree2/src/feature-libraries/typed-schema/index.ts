/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	TreeNodeSchema,
	TreeFieldSchema,
	Any,
	allowedTypesToTypeSet,
	AllowedTypes,
	LazyTreeNodeSchema,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	FieldNodeSchema,
	TreeSchema,
	Unenforced,
	AllowedTypeSet,
	MapFieldSchema,
	SchemaCollection,
	TreeNodeSchemaBase,
	Fields,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
} from "./typedTreeSchema";

export { ViewSchema } from "./view";

export {
	bannedFieldNames,
	fieldApiPrefixes,
	validateObjectNodeFieldName,
	SchemaLibraryData,
	SchemaLintConfiguration,
	aggregateSchemaLibraries,
	schemaLintDefault,
} from "./schemaCollection";

export { FlexList, markEager, ArrayHasFixedLength } from "./flexList";

// Below here are things that are used by the above, but not part of the desired API surface.
import * as InternalTypedSchemaTypes from "./internal";
export { InternalTypedSchemaTypes };
