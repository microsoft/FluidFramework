/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeEntity,
	type FlexTreeTypedField,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type FlexTreeLeafNode,
	type FlexTreeMapNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type AssignableFieldKinds,
	type FlexTreeTypedNode,
	type FlexTreeTypedNodeUnion,
	TreeStatus,
	type FlexTreeUnknownUnboxed,
	type FlexTreeUnboxField,
	flexTreeMarker,
	FlexTreeEntityKind,
	isFlexTreeNode,
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

export type { FlexTreeUnboxNodeUnion } from "./flexTreeTypes.js";

export {
	assertFlexTreeEntityNotFreed,
	isFreedSymbol,
	LazyEntity,
} from "./lazyEntity.js";

export { getSchemaAndPolicy, indexForAt } from "./utilities.js";

export { treeStatusFromAnchorCache } from "./utilities.js";
