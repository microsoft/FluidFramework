/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { SharedTreeBranchManager } from "./sharedTreeBranchManager.js";
export {
	createMergableDiffSeries,
	createMergableIdDiffSeries,
	type Difference,
	type DifferenceChange,
	type DifferenceCreate,
	type DifferenceMove,
	type DifferenceRemove,
	type ObjectPath,
	type Options,
	sharedTreeDiff,
} from "./sharedTreeDiff.js";

export { isTreeArrayNode, isTreeMapNode, sharedTreeTraverse } from "./utils.js";
