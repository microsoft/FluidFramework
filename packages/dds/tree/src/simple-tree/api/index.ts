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
export {
	eraseSchemaDetails,
	eraseSchemaDetailsSubclassable,
} from "./eraseSchemaDetails.js";
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
export {
	type JsonArrayNodeSchema,
	type JsonFieldSchema,
	type JsonLeafNodeSchema,
	type JsonLeafSchemaType,
	type JsonMapNodeSchema,
	type JsonNodeSchema,
	type JsonNodeSchemaBase,
	type JsonObjectNodeSchema,
	type JsonRecordNodeSchema,
	type JsonRefPath,
	type JsonSchemaId,
	type JsonSchemaRef,
	type JsonSchemaType,
	type JsonStringKeyPatternProperties,
	type JsonTreeSchema,
} from "./jsonSchema.js";
export { SchemaCompatibilityTester } from "./schemaCompatibilityTester.js";
export {
	adaptEnum,
	createCustomizedFluidFrameworkScopedFactory,
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
	scoped,
} from "./schemaFactory.js";
export { SchemaFactoryAlpha } from "./schemaFactoryAlpha.js";
export { SchemaFactoryBeta, type SchemaStaticsBeta } from "./schemaFactoryBeta.js";
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
	decodeSchemaCompatibilitySnapshot,
	encodeSchemaCompatibilitySnapshot,
} from "./simpleSchemaCodec.js";
export { createTreeIndex, type TreeIndexKey } from "./simpleTreeIndex.js";
export {
	checkCompatibility,
	exportCompatibilitySchemaSnapshot,
	importCompatibilitySchemaSnapshot,
	type SnapshotFileSystem,
	type SnapshotSchemaCompatibilityOptions,
	snapshotSchemaCompatibility,
} from "./snapshotCompatibilityChecker.js";
export {
	comparePersistedSchema,
	extractPersistedSchema,
} from "./storedSchema.js";
export {
	type NoChangeConstraint,
	type NodeInDocumentConstraint,
	type RunTransactionParams,
	rollback,
	type TransactionCallbackStatus,
	type TransactionConstraint,
	type TransactionConstraintAlpha,
	type TransactionResult,
	type TransactionResultExt,
	type TransactionResultFailed,
	type TransactionResultSuccess,
	type VoidTransactionCallbackStatus,
	type WithValue,
} from "./transactionTypes.js";
export type {
	ITree,
	ITreeAlpha,
	SchemaCompatibilityStatus,
	TreeBranch,
	TreeBranchAlpha,
	TreeBranchEvents,
	TreeContextAlpha,
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
