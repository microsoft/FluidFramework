/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeEntity,
	type FlexTreeTypedField,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	TreeStatus,
	type FlexTreeUnknownUnboxed,
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

export {
	getTreeContext,
	type FlexTreeContext,
	type FlexTreeHydratedContext,
	Context,
	ContextSlot,
} from "./context.js";

export { type FlexTreeNodeEvents } from "./treeEvents.js";

export {
	assertFlexTreeEntityNotFreed,
	isFreedSymbol,
	LazyEntity,
} from "./lazyEntity.js";

export { getSchemaAndPolicy, indexForAt } from "./utilities.js";

export { treeStatusFromAnchorCache } from "./utilities.js";
