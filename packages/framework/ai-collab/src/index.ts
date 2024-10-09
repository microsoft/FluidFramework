/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Experimental package for utilities that enable/simplify interaction with LLMs for apps based on SharedTree.
 *
 * See {@link https://github.com/microsoft/FluidFramework/tree/main/packages/framework/ai-collab#readme | README.md }
 * for an overview of the package.
 *
 * @packageDocumentation
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
	SharedTreeBranchManager,
	sharedTreeTraverse,
} from "./shared-tree-diff/index.js";
