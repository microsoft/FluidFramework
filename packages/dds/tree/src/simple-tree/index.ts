/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ITree,
	type TreeView,
	type TreeViewEvents,
	TreeConfiguration,
	TreeViewConfiguration,
	type ITreeViewConfiguration,
	type SchemaCompatibilityStatus,
	type ITreeConfigurationOptions,
} from "./tree.js";
export {
	type TreeNodeSchema,
	type NodeFromSchema,
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaNonClass,
	type TreeNodeSchemaCore,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type ImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeLeafValue,
	type,
	type WithType,
	type AllowedTypes,
	FieldKind,
	FieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type NodeBuilderData,
	type DefaultProvider,
	type FieldProps,
	normalizeFieldSchema,
} from "./schemaTypes.js";
import * as InternalSimpleTreeTypes from "./internalTypes.js";
export { InternalSimpleTreeTypes };
export { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
export { getFlexNode } from "./proxyBinding.js";
export { treeNodeApi, type TreeNodeApi, type TreeChangeEvents } from "./treeNodeApi.js";
export { toFlexConfig, cursorFromUnhydratedRoot } from "./toFlexSchema.js";
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
} from "./typesUnsafe.js";
export type { ValidateRecursiveSchema } from "./schemaFactoryRecursive.js";
export { getProxyForField, type InsertableContent } from "./proxies.js";

export {
	adaptEnum,
	enumFromStrings,
	singletonSchema,
	typedObjectValues,
} from "./schemaCreationUtilities.js";

// Exporting the schema (RecursiveObject) to test that recursive types are working correctly.
// These are `@internal` so they can't be included in the `InternalClassTreeTypes` due to https://github.com/microsoft/rushstack/issues/3639
export {
	RecursiveObject as test_RecursiveObject,
	base as test_RecursiveObject_base,
	RecursiveObjectPojoMode as test_RecursiveObjectPojoMode,
} from "./testRecursiveDomain.js";

// TreeNode is only type exported, which prevents use of the class object for unsupported use-cases like direct sub-classing and instancof.
// See docs on TreeNode for more details.
export type { TreeNode, Unhydrated, InternalTreeNode } from "./types.js";
export { TreeArrayNode, IterableTreeArrayContent, type TreeArrayNodeBase } from "./arrayNode.js";
export {
	type FieldHasDefault,
	type InsertableObjectFromSchemaRecord,
	type ObjectFromSchemaRecord,
	type TreeObjectNode,
	setField,
} from "./objectNode.js";
export type { TreeMapNode } from "./mapNode.js";
