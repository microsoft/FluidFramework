/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeEntity,
	type FlexTreeTypedField,
	type FlexTreeFieldNode,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type FlexTreeLeafNode,
	type FlexTreeMapNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeObjectNode,
	type FlexTreeObjectNodeTyped,
	type AssignableFieldKinds,
	type FlexTreeTypedNode,
	type FlexTreeTypedNodeUnion,
	type CheckTypesOverlap,
	TreeStatus,
	type FlexTreeUnknownUnboxed,
	type FlexTreeUnboxField,
	flexTreeMarker,
	FlexTreeEntityKind,
	isFlexTreeNode,
	type PropertyNameFromFieldKey,
	type ReservedObjectNodeFieldPropertyNames,
	type ReservedObjectNodeFieldPropertyNamePrefixes,
	reservedObjectNodeFieldPropertyNames,
	reservedObjectNodeFieldPropertyNamePrefixes,
	type FlexTreeObjectNodeFieldsInner,
	flexTreeSlot,
} from "./flexTreeTypes.js";

export {
	visitBipartiteIterableTree,
	Skip,
	visitBipartiteIterableTreeWithState,
	visitIterableTree,
	visitIterableTreeWithState,
} from "./navigation.js";

export { getTreeContext, type FlexTreeContext, Context, ContextSlot } from "./context.js";

export { type FlexTreeNodeEvents } from "./treeEvents.js";

// Below here are things that are used by the above, but not part of the desired API surface.
export type {
	FlexTreeTypedFieldInner,
	FlexTreeUnboxFieldInner,
	FlexTreeObjectNodeFields,
	FlexTreeUnboxNode,
	FlexTreeUnboxNodeUnion,
	IsArrayOfOne,
	FlexibleNodeSubSequence,
} from "./flexTreeTypes.js";

export { assertFlexTreeEntityNotFreed } from "./lazyEntity.js";

export { getSchemaAndPolicy, indexForAt } from "./utilities.js";
