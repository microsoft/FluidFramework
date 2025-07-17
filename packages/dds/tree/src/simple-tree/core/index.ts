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
	asTreeNodeSchemaCorePrivate,
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
} from "./treeNodeSchema.js";
export {
	isAnnotatedAllowedTypes,
	isAnnotatedAllowedType,
	normalizeAllowedTypes,
	normalizeAnnotatedAllowedTypes,
	unannotateImplicitAllowedTypes,
	markSchemaMostDerived,
	evaluateLazySchema,
} from "./allowedTypes.js";
export type {
	AnnotatedAllowedType,
	NormalizedAnnotatedAllowedTypes,
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	UnannotateImplicitAllowedTypes,
	AllowedTypesMetadata,
	AllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromAllowedTypes,
	Input,
	UnannotateAllowedTypes,
	UnannotateAllowedType,
	UnannotateAllowedTypesList,
	UnannotateAllowedTypeOrLazyItem,
	AllowedTypeMetadata,
	AnnotatedAllowedTypes,
} from "./allowedTypes.js";
export { walkAllowedTypes, type SchemaVisitor } from "./walkSchema.js";
export { Context, HydratedContext, SimpleContextSlot } from "./context.js";
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
export { TreeNodeValid, type MostDerivedData } from "./treeNodeValid.js";
