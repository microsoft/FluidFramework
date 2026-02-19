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
	SchemaUpgrade,
	createSchemaUpgrade,
	evaluateLazySchema,
	isAnnotatedAllowedType,
	isAnnotatedAllowedTypes,
	markSchemaMostDerived,
	normalizeAllowedTypes,
	normalizeAllowedTypesInternal,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	normalizeToAnnotatedAllowedType,
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
	TreeNode,
	inPrototypeChain,
	privateToken,
} from "./treeNode.js";
export {
	type InnerNode,
	SimpleContextSlot,
	TreeNodeKernel,
	getInnerNode,
	getKernel,
	getSimpleNodeSchemaFromInnerNode,
	isTreeNode,
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
	NodeKind,
	getTreeNodeSchemaPrivateData,
	isTreeNodeSchemaClass,
	privateDataSymbol,
} from "./treeNodeSchema.js";
export {
	type MostDerivedData,
	TreeNodeValid,
	createTreeNodeSchemaPrivateData,
	isClassBasedSchema,
} from "./treeNodeValid.js";
export {
	type InternalTreeNode,
	type Unhydrated,
} from "./types.js";
export {
	UnhydratedContext,
	UnhydratedFlexTreeField,
	UnhydratedFlexTreeNode,
	UnhydratedSequenceField,
	createField,
} from "./unhydratedFlexTree.js";
export { type SchemaVisitor, walkAllowedTypes, walkNodeSchema } from "./walkSchema.js";
export {
	type WithType,
	contentSchemaSymbol,
	typeNameSymbol,
	typeSchemaSymbol,
} from "./withType.js";
