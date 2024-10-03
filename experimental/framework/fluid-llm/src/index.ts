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

export {
	branch,
	merge,
} from "./branching/index.js";
