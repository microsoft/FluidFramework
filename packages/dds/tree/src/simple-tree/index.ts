/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ITree, TreeView, TreeViewEvents, TreeConfiguration, SchemaIncompatible } from "./tree.js";
export {
	TreeNodeSchema,
	NodeFromSchema,
	NodeKind,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	TreeNodeSchemaCore,
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	ImplicitAllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	TreeMapNode,
	TreeLeafValue,
	type,
	WithType,
	AllowedTypes,
	ApplyKind,
	FieldKind,
	FieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeFieldFromImplicitField,
	InsertableTypedNode,
	NodeBuilderData,
	ObjectFromSchemaRecord,
} from "./schemaTypes.js";
export { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
export { nodeApi as Tree, TreeApi, TreeNodeEvents } from "./treeApi.js";
export { toFlexConfig } from "./toFlexSchema.js";
export {
	SchemaFactoryRecursive,
	ObjectFromSchemaRecordUnsafe,
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
} from "./schemaFactoryRecursive.js";
export { getProxyForField } from "./proxies.js";

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

export { TreeNode, Unhydrated, TreeArrayNodeBase } from "./types.js";
export { TreeArrayNode, IterableTreeArrayContent } from "./treeArrayNode.js";
