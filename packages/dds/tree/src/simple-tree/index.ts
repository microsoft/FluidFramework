/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	typeNameSymbol,
	type WithType,
	type TreeNodeSchema,
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaNonClass,
	type TreeNodeSchemaCore,
	type TreeChangeEvents,
	// TreeNode is only type exported, which prevents use of the class object for unsupported use-cases like direct sub-classing and instanceof.
	// See docs on TreeNode for more details.
	type TreeNode,
	type Unhydrated,
	type InternalTreeNode,
	isTreeNode,
} from "./core/index.js";
export {
	type ITree,
	type TreeView,
	type TreeViewEvents,
	TreeViewConfiguration,
	type ITreeViewConfiguration,
	type SchemaCompatibilityStatus,
	type ITreeConfigurationOptions,
	SchemaFactory,
	type ScopedSchemaName,
	type ValidateRecursiveSchema,
	type FixRecursiveArraySchema,
	adaptEnum,
	enumFromStrings,
	singletonSchema,
	typedObjectValues,
	type EmptyObject,
	test_RecursiveObject,
	test_RecursiveObject_base,
	test_RecursiveObjectPojoMode,
	treeNodeApi,
	type TreeNodeApi,
} from "./api/index.js";
export {
	type NodeFromSchema,
	isTreeNodeSchemaClass,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type ImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeLeafValue,
	type AllowedTypes,
	FieldKind,
	FieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type NodeBuilderData,
	type DefaultProvider,
	type FieldProps,
	normalizeFieldSchema,
	type ApplyKind,
} from "./schemaTypes.js";
export { getOrCreateInnerNode, tryDisposeTreeNode } from "./proxyBinding.js";
export { toFlexSchema } from "./toFlexSchema.js";
export type {
	FieldHasDefaultUnsafe,
	ObjectFromSchemaRecordUnsafe,
	TreeObjectNodeUnsafe,
	TreeFieldFromImplicitFieldUnsafe,
	TreeNodeFromImplicitAllowedTypesUnsafe,
	FieldSchemaUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeArrayNodeUnsafe,
	TreeMapNodeUnsafe,
	InsertableObjectFromSchemaRecordUnsafe,
	InsertableTreeFieldFromImplicitFieldUnsafe,
	InsertableTypedNodeUnsafe,
	NodeBuilderDataUnsafe,
	NodeFromSchemaUnsafe,
	ReadonlyMapInlined,
} from "./typesUnsafe.js";
export {
	getTreeNodeForField,
	type InsertableContent,
	prepareContentForHydration,
} from "./proxies.js";

export {
	TreeArrayNode,
	IterableTreeArrayContent,
	type TreeArrayNodeBase,
} from "./arrayNode.js";
export {
	type FieldHasDefault,
	type InsertableObjectFromSchemaRecord,
	type ObjectFromSchemaRecord,
	type TreeObjectNode,
	setField,
} from "./objectNode.js";
export type { TreeMapNode, MapNodeInsertableData } from "./mapNode.js";
export { mapTreeFromNodeData } from "./toMapTree.js";
export type { SimpleTreeSchema } from "./simpleSchema.js";
export {
	type JsonSchemaId,
	type JsonSchemaType,
	type JsonObjectNodeSchema,
	type JsonArrayNodeSchema,
	type JsonMapNodeSchema,
	type JsonLeafNodeSchema,
	type JsonSchemaRef,
	type JsonRefPath,
	type JsonNodeSchema,
	type JsonNodeSchemaBase,
	type JsonTreeSchema,
	type JsonFieldSchema,
	type JsonLeafSchemaType,
} from "./jsonSchema.js";
export { getJsonSchema } from "./getJsonSchema.js";
export { getSimpleSchema } from "./getSimpleSchema.js";
