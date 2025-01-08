/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitFieldSchema,
	TreeArrayNode,
	TreeMapNode,
	TreeViewConfiguration,
} from "@fluidframework/tree";
import {
	// TODO: Migrate to newer branching API (`TreeContext`)
	// eslint-disable-next-line import/no-deprecated
	getBranch,
	type BranchableTree,
	type TreeBranchFork,
	type TreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules -- This package depends on the branching APIs in Tree which are currently alpha
} from "@fluidframework/tree/alpha";
import type { z } from "zod";

import {
	createMergableDiffSeries,
	createMergableIdDiffSeries,
	sharedTreeDiff,
	type Difference,
	type ObjectPath,
} from "./sharedTreeDiff.js";
import { isTreeMapNode, isTreeArrayNode, sharedTreeTraverse } from "./utils.js";

/**
 * Manages determining the differences between two branches of a SharedTree represented as an actual tree node or a plain javascript object
 * and applies said differences to the original SharedTree branch.
 *
 * @alpha
 */
export class SharedTreeBranchManager {
	private readonly objectSchema?: z.Schema | undefined;
	private readonly nodeIdAttributeName?: string | undefined;

	public constructor(params?: { objectSchema?: z.Schema; nodeIdAttributeName?: string }) {
		this.objectSchema = params?.objectSchema;
		this.nodeIdAttributeName = params?.nodeIdAttributeName;
	}

	/**
	 * Compares the differences between either two objects or a TreeNode and a plain object.
	 * TODO: Should allow comparing two tree nodes? Should we allow comparing two plain objects? Or just leave as tree node vs object?
	 */
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

		const diffTotality = sharedTreeDiff(obj as Record<string, unknown> | unknown[], newObj, {
			useObjectIds:
				this.nodeIdAttributeName === undefined
					? undefined
					: { idAttributeName: this.nodeIdAttributeName },
			cyclesFix: true,
		});

		if (this.nodeIdAttributeName !== undefined) {
			return createMergableIdDiffSeries(obj, diffTotality, this.nodeIdAttributeName);
		}

		return createMergableDiffSeries(diffTotality);
	}

	/**
	 * Produces a set of differences based on two versions of an object, applies the changes to the first one,
	 * and returns the set of differences.
	 */
	public mergeObject(
		obj: Record<string, unknown> | TreeArrayNode,
		llmResponse: Record<string, unknown> | unknown[],
	): Difference[] {
		const differences = this.compare(obj, llmResponse);
		this.mergeDiffs(differences, obj);
		return differences;
	}

	/**
	 * produces a diff between two objects and merges the differences.
	 */
	public checkoutNewMergedBranch<T extends ImplicitFieldSchema>(
		treeView: TreeViewAlpha<T>,
		treeViewConfiguration: TreeViewConfiguration<T>,
		absolutePathToObjectNode: ObjectPath,
		llmResponse: Record<string, unknown> | unknown[],
	): {
		differences: Difference[];
		originalBranch: BranchableTree;
		forkBranch: TreeBranchFork;
		forkView: TreeViewAlpha<T>;
		newBranchTargetNode: Record<string, unknown> | TreeArrayNode;
	} {
		// eslint-disable-next-line import/no-deprecated
		const originalBranch = getBranch(treeView);
		const forkBranch = originalBranch.branch();
		const forkView = forkBranch.viewWith(treeViewConfiguration) as TreeViewAlpha<T>;

		console.log("traveling to absolute path from root:", absolutePathToObjectNode);
		const newBranchTargetNode = sharedTreeTraverse(
			forkView.root as unknown as TreeMapNode | TreeArrayNode | Record<string, unknown>,
			absolutePathToObjectNode,
		) as Record<string, unknown> | TreeArrayNode;

		console.log(
			"initiating compare between old and new branch target nodes",
			{ ...newBranchTargetNode },
			{ ...llmResponse },
		);
		console.log("newBranchTargetNode", { ...newBranchTargetNode });
		console.log("llmResponse", { ...llmResponse });

		const differences = this.compare(newBranchTargetNode, llmResponse);
		// const differences = [];
		this.mergeDiffs(differences, newBranchTargetNode);

		return { differences, originalBranch, forkBranch, forkView, newBranchTargetNode };
	}

	/**
	 * Creates a forked branch of a tree view.
	 */
	public checkoutNewMergedBranchV2<T extends ImplicitFieldSchema>(
		treeView: TreeViewAlpha<T>,
		treeViewConfiguration: TreeViewConfiguration<T>,
		absolutePathToObjectNode: ObjectPath,
		// differences: Difference[],
	): {
		originalBranch: BranchableTree;
		forkBranch: TreeBranchFork;
		forkView: TreeViewAlpha<T>;
		newBranchTargetNode: Record<string, unknown> | TreeArrayNode;
	} {
		// eslint-disable-next-line import/no-deprecated
		const originalBranch = getBranch(treeView);
		const forkBranch = originalBranch.branch();
		const forkView = forkBranch.viewWith(treeViewConfiguration) as TreeViewAlpha<T>;
		const newBranchTargetNode = sharedTreeTraverse(
			forkView.root as TreeMapNode | TreeArrayNode | Record<string, unknown>,
			absolutePathToObjectNode,
		) as Record<string, unknown> | TreeArrayNode;
		// this.mergeDiffs(differences, newBranchTargetNode);
		return { originalBranch, forkBranch, forkView, newBranchTargetNode };
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
		const unappliedDiffs = new Set<Difference>();

		for (const diff of diffs) {
			const isDiffApplied = this.applyDiff(diff, objectToUpdate);

			if (isDiffApplied === false) {
				unappliedDiffs.add(diff);
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
					// This code is doing non-schema aware editing, which is not a supported feature of this API.
					// Casting to any is a way to get this unsupported and rather unsafe operation to compile.
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
					targetObject.set(diff.path[diff.path.length - 1] as string, diff.value as any);
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
						// This code is doing non-schema aware editing, which is not a supported feature of this API.
						// Casting to any is a way to get this unsupported and rather unsafe operation to compile.
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
						targetObject.insertAt(targetIndex, diff.value as any);
						return true;
					} else {
						// This code is doing non-schema aware editing, which is not a supported feature of this API.
						// Casting to any is a way to get this unsupported and rather unsafe operation to compile.
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
						targetObject.insertAtEnd(diff.value as any);
						console.warn(
							"CREATE diff specified an invalid index, defaulting to pushing to end of array",
						);
						return false;
					}
				}
				case "MOVE": {
					if (isTargetIndexValid) {
						if (diff.newIndex > targetIndex) {
							// forward move must use i + 1
							targetObject.moveToIndex(diff.newIndex + 1, targetIndex);
						} else if (diff.newIndex < targetIndex) {
							// backwards move, using i directly is fine
							targetObject.moveToIndex(diff.newIndex, targetIndex);
						}
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
