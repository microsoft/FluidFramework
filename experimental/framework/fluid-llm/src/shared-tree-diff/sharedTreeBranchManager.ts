import { type TreeArrayNode } from "@fluidframework/tree";
import type * as z from "zod";

import {
	sharedTreeDiff,
	type Difference,
	type DifferenceChange,
	type DifferenceCreate,
	type DifferenceMove,
	type DifferenceRemove,
	type ObjectPath,
} from "./sharedTreeDiff.js";
import { isTreeMapNode, isTreeArrayNode, sharedTreeTraverse } from "./utils.js";

/**
 * Manages determining the differences between two branches of a SharedTree represented as an actual tree node or a plain javascript object
 * and applies said differences to the original SharedTree branch.
 */
export class SharedTreeBranchManager {
	private readonly objectSchema?: z.Schema;

	public constructor(params?: { objectSchema?: z.Schema }) {
		this.objectSchema = params?.objectSchema;
	}

	public compare(
		obj: Record<string, unknown> | TreeArrayNode,
		newObj: Record<string, unknown> | unknown[],
	): Difference[] {
		// By validating that the incoming object matches the schema, we can confirm that any property
		// deletions/updates/additions are valid.
		if (this.objectSchema !== undefined) {
			const res = this.objectSchema.safeParse(newObj);
			if (res.success === false) {
				throw new TypeError("Invalid data");
			}
		}

		return sharedTreeDiff(obj as Record<string, unknown> | unknown[], newObj, {
			useObjectIds: { idAttributeName: "id" },
			cyclesFix: true,
		});
	}

	/**
	 * produces a diff between two objects and merges the differences.
	 */
	public merge(
		obj: Record<string, unknown> | TreeArrayNode,
		newObj: Record<string, unknown> | unknown[],
	): void {
		const differences = this.compare(obj, newObj);
		this.mergeDiffs(differences, obj);
	}

	/**
	 * Handles applying an array of differences to an object in the proper order and making any necessary adjustments as each diff
	 * is applied.
	 *
	 * @returns an array of differences that were not applied due to some kind of conflict or error.
	 */
	public mergeDiffs(
		diffs: Difference[],
		objectToUpdate: Record<string, unknown> | TreeArrayNode,
	): Set<Difference> {
		if (diffs === undefined) {
			return new Set();
		}

		const changeDiffs: DifferenceChange[] = [];
		const moveDiffs: DifferenceMove[] = [];
		const removeDiffs: DifferenceRemove[] = [];
		const createDiffs: DifferenceCreate[] = [];

		for (const diff of diffs) {
			switch (diff.type) {
				case "CHANGE": {
					changeDiffs.push({ ...diff });
					break;
				}
				case "MOVE": {
					moveDiffs.push({ ...diff });
					break;
				}
				case "REMOVE": {
					removeDiffs.push({ ...diff });
					break;
				}
				case "CREATE": {
					createDiffs.push({ ...diff });
					break;
				}
				default: {
					throw new TypeError("Unsupported diff type");
				}
			}
		}

		const unappliedDiffs = new Set<Difference>();

		// 1. We apply all change diffs before handling more complex diff types.
		for (const changeDiff of changeDiffs) {
			const isDiffApplied = this.applyDiff(changeDiff, objectToUpdate);

			if (isDiffApplied === false) {
				unappliedDiffs.add(changeDiff);
				continue;
			}
		}

		for (const moveDiff of moveDiffs) {
			const isDiffApplied = this.applyDiff(moveDiff, objectToUpdate);

			if (isDiffApplied === false) {
				unappliedDiffs.add(moveDiff);
				continue;
			}

			// If we moved a node within an array, we need to update all other applicable diffs that were pointing that this index to point to the new index.
			if (this.isDiffOnArray(moveDiff)) {
				const swappedIndex = moveDiff.newIndex;
				// Update remove diffs reffering to the node at the old index to point to the new noved index.
				for (const removeDiff of removeDiffs) {
					const removalIndex = removeDiff.path[removeDiff.path.length - 1] as number;
					if (this.isDiffOnArray(removeDiff) && removalIndex === swappedIndex) {
						removeDiff.path[removeDiff.path.length - 1] = moveDiff.path[
							moveDiff.path.length - 1
						] as number;
					}
				}
			}
		}

		for (const removeDiff of removeDiffs) {
			const isDiffApplied = this.applyDiff(removeDiff, objectToUpdate);

			if (isDiffApplied === false) {
				unappliedDiffs.add(removeDiff);
				continue;
			}
		}

		for (const createDiff of createDiffs) {
			const isDiffApplied = this.applyDiff(createDiff, objectToUpdate);

			if (isDiffApplied === false) {
				unappliedDiffs.add(createDiff);
				continue;
			}
		}

		return unappliedDiffs;
	}

	/**
	 * Applies an individual diff to the objectToUpdate.
	 */
	public applyDiff(
		diff: Difference,
		objectToUpdate: Record<string, unknown> | TreeArrayNode,
	): boolean {
		const targetObject: unknown = getTargetObjectFromPath(diff.path, objectToUpdate);

		if (isTreeMapNode(targetObject)) {
			switch (diff.type) {
				case "CHANGE":
				case "CREATE": {
					targetObject.set(diff.path[diff.path.length - 1] as string, diff.value);
					return true;
				}
				case "REMOVE": {
					targetObject.delete(diff.path[diff.path.length - 1] as string);
					return true;
				}
				default: {
					throw new TypeError("Unsupported diff type for Map Tree Node");
				}
			}
		} else if (isTreeArrayNode(targetObject)) {
			const targetIndex = diff.path[diff.path.length - 1] as number;
			const isTargetIndexValid = targetIndex >= 0 && targetIndex <= targetObject.length - 1;
			switch (diff.type) {
				case "CHANGE":
				case "CREATE": {
					if (isTargetIndexValid) {
						targetObject.insertAt(targetIndex, diff.value);
						return true;
					} else {
						targetObject.insertAtEnd(diff.value);
						console.warn(
							"CREATE diff specified an invalid index, defaulting to pushing to end of array",
						);
						return false;
					}
				}
				case "MOVE": {
					if (isTargetIndexValid) {
						targetObject.moveToIndex(targetIndex, diff.newIndex);
						return true;
					} else {
						console.warn("MOVE diff specified an invalid index, ignoring.");
						return false;
					}
				}
				case "REMOVE": {
					if (isTargetIndexValid) {
						targetObject.removeAt(targetIndex);
						return true;
					} else {
						console.warn("REMOVE diff specified an invalid index, ignoring.");
						return false;
					}
				}
				default: {
					throw new TypeError("Unsupported diff type for Array Tree Node");
				}
			}
		} else if (typeof targetObject === "object" && targetObject !== null) {
			switch (diff.type) {
				case "CHANGE":
				case "CREATE": {
					targetObject[diff.path[diff.path.length - 1] as string] = diff.value;
					return true;
				}
				case "REMOVE": {
					// We can't use the delete keyword on a tree node.
					targetObject[diff.path[diff.path.length - 1] as string] = undefined;
					return false;
				}
				default: {
					throw new TypeError("Unsupported diff type for Object Tree Node");
				}
			}
		} else {
			throw new TypeError("Unsupported object type for diff application");
		}
	}

	public isDiffOnArray(diff: Difference): boolean {
		return typeof diff.path[diff.path.length - 1] === "number";
	}
}

/**
 * Returns the target object that the given diff should be applied to.
 */
function getTargetObjectFromPath(
	path: ObjectPath,
	object: Record<string, unknown> | TreeArrayNode,
): unknown {
	let targetObject: unknown = object;
	if (path.length > 1) {
		targetObject = sharedTreeTraverse(object, path.slice(0, -1));
	}
	return targetObject;
}
