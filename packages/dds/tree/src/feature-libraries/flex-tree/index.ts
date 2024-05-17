/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	FlexTreeField,
	FlexTreeNode,
	FlexTreeEntity,
	FlexTreeTypedField,
	FlexTreeFieldNode,
	FlexibleFieldContent,
	FlexibleNodeContent,
	FlexTreeLeafNode,
	FlexTreeMapNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeObjectNode,
	FlexTreeObjectNodeTyped,
	AssignableFieldKinds,
	FlexTreeTypedNode,
	FlexTreeTypedNodeUnion,
	CheckTypesOverlap,
	TreeStatus,
	FlexTreeUnknownUnboxed,
	FlexTreeUnboxField,
	flexTreeMarker,
	FlexTreeEntityKind,
	isFlexTreeNode,
	PropertyNameFromFieldKey,
	ReservedObjectNodeFieldPropertyNames,
	ReservedObjectNodeFieldPropertyNamePrefixes,
	reservedObjectNodeFieldPropertyNames,
	reservedObjectNodeFieldPropertyNamePrefixes,
	FlexTreeObjectNodeFieldsInner,
	flexTreeSlot,
} from "./flexTreeTypes.js";

export {
	visitBipartiteIterableTree,
	Skip,
	visitBipartiteIterableTreeWithState,
	visitIterableTree,
	visitIterableTreeWithState,
} from "./navigation.js";

export { getTreeContext, FlexTreeContext, Context, ContextSlot } from "./context.js";

export { FlexTreeNodeEvents } from "./treeEvents.js";

// Below here are things that are used by the above, but not part of the desired API surface.
export {
	FlexTreeTypedFieldInner,
	FlexTreeUnboxFieldInner,
	FlexTreeObjectNodeFields,
	FlexTreeUnboxNode,
	FlexTreeUnboxNodeUnion,
	FlexTreeNodeKeyField,
	IsArrayOfOne,
	FlexibleNodeSubSequence,
} from "./flexTreeTypes.js";

export { assertFlexTreeEntityNotFreed } from "./lazyEntity.js";

export { getSchemaAndPolicy } from "./utilities.js";
