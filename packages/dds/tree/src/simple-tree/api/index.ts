/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ITree,
	type TreeView,
	type TreeViewEvents,
	TreeViewConfiguration,
	type ITreeViewConfiguration,
	type SchemaCompatibilityStatus,
	type ITreeConfigurationOptions,
} from "./tree.js";
export { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
export type {
	ValidateRecursiveSchema,
	FixRecursiveArraySchema,
} from "./schemaFactoryRecursive.js";
export {
	adaptEnum,
	enumFromStrings,
	singletonSchema,
	typedObjectValues,
	type EmptyObject,
} from "./schemaCreationUtilities.js";
export { treeNodeApi, type TreeNodeApi } from "./treeNodeApi.js";

// Exporting the schema (RecursiveObject) to test that recursive types are working correctly.
// These are `@internal` so they can't be included in the `InternalClassTreeTypes` due to https://github.com/microsoft/rushstack/issues/3639
export {
	RecursiveObject as test_RecursiveObject,
	base as test_RecursiveObject_base,
	RecursiveObjectPojoMode as test_RecursiveObjectPojoMode,
} from "./testRecursiveDomain.js";
