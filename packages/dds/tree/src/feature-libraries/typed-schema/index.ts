/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeNodeSchema,
	FlexFieldSchema,
	allowedTypesToTypeSet,
	type FlexAllowedTypes,
	type LazyTreeNodeSchema,
	LeafNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeSchema,
	type Unenforced,
	type AllowedTypeSet,
	type FlexMapFieldSchema,
	type SchemaCollection,
	TreeNodeSchemaBase,
	type FlexObjectNodeFields,
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
	normalizeFlexListEager,
} from "./flexList.js";
