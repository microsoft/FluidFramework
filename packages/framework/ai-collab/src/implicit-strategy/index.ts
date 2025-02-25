/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type DifferenceCreate,
	type DifferenceChange,
	type DifferenceMove,
	type DifferenceRemove,
	type Difference,
	type ObjectPath,
	type Options,
	sharedTreeDiff,
	createMergableIdDiffSeries,
	createMergableDiffSeries,
} from "./sharedTreeDiff.js";

export { SharedTreeBranchManager } from "./sharedTreeBranchManager.js";

export { sharedTreeTraverse, isTreeArrayNode, isTreeMapNode } from "./utils.js";
