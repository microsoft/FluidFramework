/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISharedTree } from "../treeFactory.js";
import {
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type TreeView,
} from "../simple-tree/index.js";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { forestSummaryKey } from "../feature-libraries/forest-summary/forestSummarizer.js";

/**
 * Validates that the data in tree `actualTree` matches the data in the tree with `expectedView`.
 */
export function validateTreesEqual<T extends ImplicitFieldSchema>(
	actualTree: ISharedTree,
	expectedView: TreeView<T>,
	schema: T,
): void {
	const actualView = actualTree.viewWith(
		new TreeViewConfiguration({
			schema,
		}),
	);
	const actualRoot = actualView.root;
	const expectedRoot = expectedView.root;
	if (actualRoot === undefined || expectedRoot === undefined) {
		assert.equal(actualRoot === undefined, expectedRoot === undefined);
		return;
	}

	assert.equal(Tree.schema(actualRoot), Tree.schema(expectedRoot));
	assert.deepEqual(TreeAlpha.exportVerbose(actualRoot), TreeAlpha.exportVerbose(expectedRoot));
	assert.deepEqual(TreeAlpha.exportConcise(actualRoot), TreeAlpha.exportConcise(expectedRoot));
}

/**
 * Finds the forest summary in the given summary tree using breadth-first search.
 * @param summary - The summary tree to search.
 * @returns The forest summary tree, or undefined if not found.
 */
export function findForestSummary(summary: ISummaryTree): ISummaryTree | undefined {
	const queue: ISummaryTree[] = [summary];

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) {
			break;
		}
		for (const [key, summaryObject] of Object.entries(current.tree)) {
			if (summaryObject.type === SummaryType.Tree) {
				if (key === forestSummaryKey) {
					return summaryObject;
				}
				// Add to queue for BFS traversal
				queue.push(summaryObject);
			}
		}
	}
	return undefined;
}

/**
 * Validates that there are handles in the forest summary and for each handle, its path exists in the
 * last summary. This basically validates that the handle paths in the current summary are valid.
 */
export function validateHandlesInForestSummary(
	summary: ISummaryTree,
	lastSummary: ISummaryTree,
) {
	const forestSummary = findForestSummary(summary);
	assert(forestSummary !== undefined, "Forest summary tree not found in summary");

	const validateHandles = (s: ISummaryTree): number => {
		let handleCount = 0;
		for (const [key, summaryObject] of Object.entries(s.tree)) {
			if (summaryObject.type === SummaryType.Handle) {
				// Validate that the handle exists in lastSummary
				validateHandlePathExists(summaryObject.handle, lastSummary);
				handleCount++;
			} else if (summaryObject.type === SummaryType.Tree) {
				// Recursively validate nested trees
				handleCount += validateHandles(summaryObject);
			}
		}
		return handleCount;
	};
	const totalHandles = validateHandles(forestSummary);
	assert(totalHandles > 0, "Expected at least one handle in the forest summary tree");
}

/**
 * Validates that are no handles in the forest's summary tree in the given summary tree.
 */
export function validateNoHandlesInForestSummary(summary: ISummaryTree) {
	const forestSummary = findForestSummary(summary);
	assert(forestSummary !== undefined, "Forest summary tree not found in summary");

	const validateNoHandles = (s: ISummaryTree) => {
		for (const [key, summaryObject] of Object.entries(s.tree)) {
			assert(
				summaryObject.type !== SummaryType.Handle,
				`Unexpected handle in summary tree at key: ${key}`,
			);
			if (summaryObject.type === SummaryType.Tree) {
				// Recursively validate nested trees
				validateNoHandles(summaryObject);
			}
		}
	};
	validateNoHandles(forestSummary);
}

/**
 * Validates that the handle exists in `summaryTree`.
 */
function validateHandlePathExists(handle: string, summaryTree: ISummaryTree) {
	/**
	 * The handle path is split by "/" into pathParts where the first element should exist in the root
	 * of the summary tree, the second element in the first element's subtree, and so on.
	 */
	const pathParts = handle.split("/").slice(1);
	const currentPath = pathParts[0];
	let found = false;
	for (const [key, summaryObject] of Object.entries(summaryTree.tree)) {
		if (key === currentPath) {
			found = true;
			if (pathParts.length > 1) {
				assert(
					summaryObject.type === SummaryType.Tree || summaryObject.type === SummaryType.Handle,
					`Handle path ${currentPath} should be for a subtree or a handle`,
				);
				if (summaryObject.type === SummaryType.Tree) {
					validateHandlePathExists(`/${pathParts.slice(1).join("/")}`, summaryObject);
				}
			}
			break;
		}
	}
	assert(found, `Handle path ${currentPath} not found in summary tree`);
}
