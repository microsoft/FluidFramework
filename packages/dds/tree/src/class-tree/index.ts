/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ITree, TreeView, TreeConfiguration, WrapperTreeView } from "./tree.js";
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
export { SchemaFactory } from "./schemaFactory.js";
export { nodeApi as Tree, TreeApi, TreeNodeEvents } from "./treeApi.js";
export { toFlexConfig } from "./toFlexSchema.js";
export { SchemaFactoryRecursive } from "./schemaFactoryRecursive.js";

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
} from "./testRecursiveDomain.js";
