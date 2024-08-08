/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeNodeSchema,
	FlexFieldSchema,
	Any,
	allowedTypesToTypeSet,
	type FlexAllowedTypes,
	type LazyTreeNodeSchema,
	LeafNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	FlexFieldNodeSchema,
	type FlexTreeSchema,
	type Unenforced,
	type AllowedTypeSet,
	type FlexMapFieldSchema,
	type SchemaCollection,
	TreeNodeSchemaBase,
	type FlexObjectNodeFields,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	type NormalizeObjectNodeFields,
	type NormalizeField,
	intoStoredSchema,
	allowedTypesSchemaSet,
	intoStoredSchemaCollection,
} from "./typedTreeSchema.js";

export { ViewSchema } from "./view.js";

export {
	type SchemaLibraryData,
	type SchemaLintConfiguration,
	aggregateSchemaLibraries,
	schemaLintDefault,
} from "./schemaCollection.js";

export {
	type FlexList,
	markEager,
	type LazyItem,
	isLazy,
	type NormalizeLazyItem,
	type FlexListToUnion,
	type ExtractItemType,
} from "./flexList.js";
