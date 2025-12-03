/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ConciseTree,
	conciseFromCursor,
	replaceConciseTreeHandles,
} from "./conciseTree.js";
export type {
	ITreeConfigurationOptions,
	ITreeViewConfiguration,
	TreeSchema,
} from "./configuration.js";
export {
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "./configuration.js";
export { createFromCursor } from "./create.js";
export {
	type CustomTreeNode,
	type CustomTreeValue,
	customFromCursorStored,
	type HandleConverter,
	KeyEncodingOptions,
	replaceHandles,
	type TreeEncodingOptions,
	type TreeParsingOptions,
	tryStoredSchemaAsArray,
} from "./customTree.js";
export {
	type DirtyTreeMap,
	type DirtyTreeStatus,
	trackDirtyNodes,
} from "./dirtyIndex.js";
export type { TreeSchemaEncodingOptions } from "./getJsonSchema.js";
export { getJsonSchema } from "./getJsonSchema.js";
export { getSimpleSchema } from "./getSimpleSchema.js";
export {
	createIdentifierIndex,
	type IdentifierIndex,
} from "./identifierIndex.js";
export {
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
} from "./incrementalAllowedTypes.js";
export type {
	JsonArrayNodeSchema,
	JsonFieldSchema,
	JsonLeafNodeSchema,
	JsonLeafSchemaType,
	JsonMapNodeSchema,
	JsonNodeSchema,
	JsonNodeSchemaBase,
	JsonObjectNodeSchema,
	JsonRecordNodeSchema,
	JsonRefPath,
	JsonSchemaId,
	JsonSchemaRef,
	JsonSchemaType,
	JsonStringKeyPatternProperties,
	JsonTreeSchema,
} from "./jsonSchema.js";
export { SchemaCompatibilityTester } from "./schemaCompatibilityTester.js";
export {
	adaptEnum,
	enumFromStrings,
	singletonSchema,
} from "./schemaCreationUtilities.js";
export {
	type NodeSchemaOptions,
	type NodeSchemaOptionsAlpha,
	type ObjectSchemaOptions,
	type ObjectSchemaOptionsAlpha,
	SchemaFactory,
	type SchemaFactory_base,
	type ScopedSchemaName,
} from "./schemaFactory.js";
export { SchemaFactoryAlpha } from "./schemaFactoryAlpha.js";
export {
	SchemaFactoryBeta,
	type SchemaStaticsBeta,
} from "./schemaFactoryBeta.js";
export type {
	FixRecursiveArraySchema,
	FixRecursiveRecursionLimit,
	ValidateRecursiveSchema,
	ValidateRecursiveSchemaTemplate,
} from "./schemaFactoryRecursive.js";
export { allowUnused } from "./schemaFactoryRecursive.js";
export { generateSchemaFromSimpleSchema } from "./schemaFromSimple.js";
export { type SchemaStatics, schemaStatics } from "./schemaStatics.js";
export {
	decodeSimpleSchema,
	encodeSimpleSchema,
} from "./simpleSchemaCodec.js";
export {
	createSimpleTreeIndex,
	type SimpleTreeIndex,
} from "./simpleTreeIndex.js";
export {
	checkCompatibility,
	exportCompatibilitySchemaSnapshot,
	importCompatibilitySchemaSnapshot,
} from "./snapshotCompatibilityChecker.js";
export {
	comparePersistedSchema,
	extractPersistedSchema,
} from "./storedSchema.js";
export {
	type NodeInDocumentConstraint,
	type RunTransactionParams,
	rollback,
	type TransactionCallbackStatus,
	type TransactionConstraint,
	type TransactionResult,
	type TransactionResultExt,
	type TransactionResultFailed,
	type TransactionResultSuccess,
	type VoidTransactionCallbackStatus,
} from "./transactionTypes.js";
export type {
	ITree,
	ITreeAlpha,
	SchemaCompatibilityStatus,
	TreeBranch,
	TreeBranchAlpha,
	TreeBranchEvents,
	TreeView,
	TreeViewAlpha,
	TreeViewBeta,
	TreeViewEvents,
	ViewableTree,
} from "./tree.js";
export { asTreeViewAlpha } from "./tree.js";
export {
	borrowCursorFromTreeNodeOrValue,
	exportConcise,
	importConcise,
	type NodeChangedData,
	TreeBeta,
	type TreeChangeEventsBeta,
} from "./treeBeta.js";
export type { TreeChangeEvents } from "./treeChangeEvents.js";
export {
	getIdentifierFromNode,
	getPropertyKeyFromStoredKey,
	getStoredKey,
	type TreeNodeApi,
	treeNodeApi,
	tryGetSchema,
} from "./treeNodeApi.js";
export type {
	AllowedTypesFullFromMixedUnsafe,
	AllowedTypesFullUnsafe,
	AnnotateAllowedTypesListUnsafe,
	AnnotatedAllowedTypesUnsafe,
	AnnotatedAllowedTypeUnsafe,
	ArrayNodeCustomizableSchemaUnsafe,
	FieldSchemaAlphaUnsafe,
	MapNodeCustomizableSchemaUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
	UnannotateAllowedTypesListUnsafe,
	UnannotateAllowedTypeUnsafe,
	Unenforced,
} from "./typesUnsafe.js";
export {
	applySchemaToParserOptions,
	cursorFromVerbose,
	replaceVerboseTreeHandles,
	type VerboseTree,
	type VerboseTreeNode,
	verboseFromCursor,
} from "./verboseTree.js";
export { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";
