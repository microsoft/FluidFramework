/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	AllowedTypeMetadata,
	AllowedTypes,
	AllowedTypesFull,
	AllowedTypesFullEvaluated,
	AllowedTypesFullFromMixed,
	AllowedTypesFullInternal,
	AllowedTypesMetadata,
	AnnotateAllowedTypesList,
	AnnotatedAllowedType,
	AnnotatedAllowedTypes,
	ImplicitAllowedTypes,
	Input,
	InsertableTreeNodeFromAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NumberKeys,
	TreeNodeFromImplicitAllowedTypes,
	UnannotateAllowedTypesList,
} from "./allowedTypes.js";
export {
	AnnotatedAllowedTypesInternal,
	createSchemaUpgrade,
	evaluateLazySchema,
	isAnnotatedAllowedType,
	isAnnotatedAllowedTypes,
	markSchemaMostDerived,
	normalizeAllowedTypes,
	normalizeAllowedTypesInternal,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	normalizeToAnnotatedAllowedType,
	SchemaUpgrade,
} from "./allowedTypes.js";
export { Context, HydratedContext } from "./context.js";
export type {
	ExtractItemType,
	FlexList,
	FlexListToUnion,
	LazyItem,
} from "./flexList.js";
export { isLazy } from "./flexList.js";
export {
	getOrCreateNodeFromInnerNode,
	getOrCreateNodeFromInnerUnboxedNode,
} from "./getOrCreateNode.js";
export type { SimpleNodeSchemaBase } from "./simpleNodeSchemaBase.js";
export {
	ExpectStored,
	type SimpleSchemaTransformationOptions,
	type StoredFromViewSchemaGenerationOptions,
	type StoredSchemaGenerationOptions,
	Unchanged,
} from "./toStored.js";
export {
	inPrototypeChain,
	privateToken,
	TreeNode,
} from "./treeNode.js";
export {
	getInnerNode,
	getKernel,
	getSimpleNodeSchemaFromInnerNode,
	type InnerNode,
	isTreeNode,
	SimpleContextSlot,
	TreeNodeKernel,
	treeNodeFromAnchor,
	tryDisposeTreeNode,
	tryGetTreeNodeSchema,
	withBufferedTreeEvents,
} from "./treeNodeKernel.js";
export type {
	FlexContent,
	InsertableTypedNode,
	NodeBuilderData,
	NodeFromSchema,
	NodeSchemaMetadata,
	TreeLeafValue,
	TreeNodeSchema,
	TreeNodeSchemaBoth,
	TreeNodeSchemaClass,
	TreeNodeSchemaCore,
	TreeNodeSchemaCorePrivate,
	TreeNodeSchemaInitializedData,
	TreeNodeSchemaNonClass,
	TreeNodeSchemaPrivateData,
} from "./treeNodeSchema.js";
export {
	CompatibilityLevel,
	getTreeNodeSchemaPrivateData,
	isTreeNodeSchemaClass,
	NodeKind,
	privateDataSymbol,
} from "./treeNodeSchema.js";
export {
	createTreeNodeSchemaPrivateData,
	isClassBasedSchema,
	type MostDerivedData,
	TreeNodeValid,
} from "./treeNodeValid.js";
export {
	type InternalTreeNode,
	type Unhydrated,
} from "./types.js";
export {
	createField,
	UnhydratedContext,
	UnhydratedFlexTreeField,
	UnhydratedFlexTreeNode,
	UnhydratedSequenceField,
} from "./unhydratedFlexTree.js";
export { type SchemaVisitor, walkAllowedTypes, walkNodeSchema } from "./walkSchema.js";
export {
	contentSchemaSymbol,
	typeNameSymbol,
	typeSchemaSymbol,
	type WithType,
} from "./withType.js";
