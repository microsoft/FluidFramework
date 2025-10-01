/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isTreeNode,
	TreeNodeKernel,
	getKernel,
	tryGetTreeNodeSchema,
	type InnerNode,
	tryDisposeTreeNode,
	getOrCreateInnerNode,
	treeNodeFromAnchor,
	getSimpleNodeSchemaFromInnerNode,
	SimpleContextSlot,
	withBufferedTreeEvents,
} from "./treeNodeKernel.js";
export { type WithType, typeNameSymbol, typeSchemaSymbol } from "./withType.js";
export {
	type Unhydrated,
	type InternalTreeNode,
} from "./types.js";
export {
	TreeNode,
	privateToken,
	inPrototypeChain,
} from "./treeNode.js";
export {
	NodeKind,
	isTreeNodeSchemaClass,
	privateDataSymbol,
	getTreeNodeSchemaPrivateData,
	CompatibilityLevel,
} from "./treeNodeSchema.js";
export type {
	TreeNodeSchema,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	TreeNodeSchemaCore,
	TreeNodeSchemaBoth,
	NodeSchemaMetadata,
	TreeLeafValue,
	InsertableTypedNode,
	NodeBuilderData,
	NodeFromSchema,
	TreeNodeSchemaCorePrivate,
	TreeNodeSchemaPrivateData,
	TreeNodeSchemaInitializedData,
	FlexContent,
} from "./treeNodeSchema.js";
export {
	isAnnotatedAllowedTypes,
	isAnnotatedAllowedType,
	normalizeAllowedTypes,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	normalizeToAnnotatedAllowedType,
	markSchemaMostDerived,
	evaluateLazySchema,
	createSchemaUpgrade,
	AnnotatedAllowedTypesInternal,
	normalizeToAnnotatedAllowedTypes,
} from "./allowedTypes.js";
export type {
	AnnotatedAllowedType,
	NormalizedAnnotatedAllowedTypes,
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	AllowedTypesMetadata,
	AllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromAllowedTypes,
	Input,
	UnannotateAllowedTypes,
	UnannotateAllowedType,
	UnannotateAllowedTypesList,
	AllowedTypeMetadata,
	AnnotatedAllowedTypes,
	AnnotateAllowedType,
	AnnotateAllowedTypesList,
	SchemaUpgrade,
	AllowedTypesFullInternal,
	AllowedTypesFull,
	AllowedTypesFullFromMixed,
} from "./allowedTypes.js";
export { walkAllowedTypes, walkNodeSchema, type SchemaVisitor } from "./walkSchema.js";
export { Context, HydratedContext } from "./context.js";
export {
	getOrCreateNodeFromInnerNode,
	getOrCreateNodeFromInnerUnboxedNode,
} from "./getOrCreateNode.js";
export {
	UnhydratedFlexTreeField,
	UnhydratedFlexTreeNode,
	UnhydratedSequenceField,
	UnhydratedContext,
	createField,
} from "./unhydratedFlexTree.js";
export type {
	LazyItem,
	FlexList,
	FlexListToUnion,
	ExtractItemType,
} from "./flexList.js";
export { isLazy } from "./flexList.js";
export {
	TreeNodeValid,
	type MostDerivedData,
	createTreeNodeSchemaPrivateData,
	isClassBasedSchema,
} from "./treeNodeValid.js";
export type { SimpleNodeSchemaBase } from "./simpleNodeSchemaBase.js";
export {
	type StoredSchemaGenerationOptions,
	convertAllowedTypes,
	allowedTypeFilter,
} from "./toStored.js";
