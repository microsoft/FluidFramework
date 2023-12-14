/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ITree, TreeView, TreeConfiguration, WrapperTreeView } from "./tree";
export {
	TreeNodeSchema,
	NodeFromSchema,
	NodeKind,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	TreeNodeSchemaCore,
	NodeBase,
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	ImplicitAllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	TreeMapNode,
} from "./schemaTypes";
export { SchemaFactory } from "./schemaFactory";
export { nodeApi as Tree, TreeApi, TreeNodeEvents } from "./treeApi";
export { toFlexConfig } from "./toFlexSchema";
export { SchemaFactoryRecursive } from "./schemaFactoryRecursive";

export {
	adaptEnum,
	enumFromStrings,
	singletonSchema,
	typedObjectValues,
} from "./schemaCreationUtilities";

// Below here are things that are used by the above, but not part of the desired API surface.
import * as InternalClassTreeTypes from "./internal";
export { InternalClassTreeTypes };

// Exporting the schema (RecursiveObject) to test that recursive types are working correctly.
// These are `@alpha` so they can't be included in the `InternalClassTreeTypes` due to https://github.com/microsoft/rushstack/issues/3639
export {
	RecursiveObject as test_RecursiveObject,
	base as test_RecursiveObject_base,
} from "./testRecursiveDomain";
