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
	FlexTreeSchema,
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
	NormalizeObjectNodeFields,
	NormalizeField,
	intoStoredSchema,
	allowedTypesSchemaSet,
	intoStoredSchemaCollection,
} from "./typedTreeSchema.js";

export { ViewSchema } from "./view.js";

export {
	bannedFieldNames,
	fieldApiPrefixes,
	validateObjectNodeFieldName,
	SchemaLibraryData,
	SchemaLintConfiguration,
	aggregateSchemaLibraries,
	schemaLintDefault,
} from "./schemaCollection.js";

export {
	FlexList,
	markEager,
	FlexListToUnion,
	LazyItem,
	isLazy,
	ExtractItemType,
	NormalizeLazyItem,
} from "./flexList.js";

export { ArrayToUnion } from "./typeUtils.js";
