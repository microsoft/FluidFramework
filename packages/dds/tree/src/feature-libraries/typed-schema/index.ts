/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeNodeSchema,
	FlexFieldSchema,
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
	schemaIsLeaf,
	intoStoredSchema,
	intoStoredSchemaCollection,
} from "./typedTreeSchema.js";

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
