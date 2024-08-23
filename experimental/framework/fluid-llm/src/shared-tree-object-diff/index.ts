export {
	type DifferenceCreate,
	type DifferenceChange,
	type DifferenceMove,
	type DifferenceRemove,
	type Difference,
	sharedTreeObjectDiff
} from "./sharedTreeObjectDiff.js";

export { SharedTreeObjectIdDiffManager, traversePath } from "./SharedTreeObjectIdDiffManager.js";
export { SharedTreeSimpleObjectDiffManager } from "./SharedTreeSimpleObjectDiffManager.js";

export { sharedTreeTraverse, isTreeArrayNode, isTreeMapNode } from "./utils.js";
