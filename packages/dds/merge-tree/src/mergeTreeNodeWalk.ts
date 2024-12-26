/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISegmentPrivate, type MergeBlock, IMergeNode } from "./mergeTreeNodes.js";
import { isLeafInfo } from "./segmentInfos.js";

export const LeafAction = {
	Exit: false,
} as const;

export type LeafAction = boolean | undefined | void;

export const NodeAction = {
	Continue: undefined,
	// exit is false to unify with leafActionOverride
	Exit: LeafAction.Exit,
	Skip: 2,
} as const;

// we exclude true from, as we only want one continue value, undefined
export type NodeAction =
	| (typeof NodeAction)[keyof typeof NodeAction]
	| Exclude<LeafAction, true>;

/**
 * Does a depth first walk of the tree from the specific start.
 *
 * @param startBlock - The block of the tree to start the walk from
 * @param startChild - The child of that block to start from
 * @param downAction - Called as we walk down the tree to the leaves.
 * @param leafActionOverride - Overrides downAction for leaves, generally used without downAction
 * @param upAction - Called after all the children of a block are walked.
 * @param forward - whether to walk forward or backward
 * @returns true if we naturally exit, false if exiting due to Exit action result
 */
export function depthFirstNodeWalk(
	startBlock: MergeBlock,
	startChild: IMergeNode | undefined,
	downAction?: (node: IMergeNode) => NodeAction,
	leafActionOverride?: (seg: ISegmentPrivate) => LeafAction,
	upAction?: (block: MergeBlock) => void,
	forward: boolean = true,
): boolean {
	const increment = forward ? 1 : -1;
	const leafAction = leafActionOverride ?? downAction;
	if (leafAction === undefined) {
		return true;
	}

	let block = startBlock;
	let childCount = block.childCount;
	let start: IMergeNode | undefined = startChild;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		// go down to the leaf level
		let blockResult: NodeAction;
		while (start?.isLeaf() === false) {
			// cast is safe due to isLeaf === false in while above
			block = start as MergeBlock;
			childCount = block.childCount;
			blockResult = downAction?.(block);
			// setting start undefined will skip the leaf walk
			// so if the block result isn't continue, set it
			// undefined
			start =
				blockResult === NodeAction.Continue
					? block.children[forward ? 0 : childCount - 1]
					: undefined;
		}

		let exit = blockResult === NodeAction.Exit;

		// walk the leaves if we reached them
		if (start !== undefined) {
			for (let i = start.index; i !== -1 && i !== childCount; i += increment) {
				// the above loop ensures start is a leaf or undefined, so all children
				// will be leaves if start exits, so the cast is safe
				if (leafAction(block.children[i] as ISegmentPrivate) === LeafAction.Exit) {
					exit = true;
					break;
				}
			}
		}

		// if there is no upAction, we don't need to walk up before exiting
		if (upAction === undefined && exit) {
			return false;
		}

		// since we already enumerated the children
		// we walk up to the next level until there is a sibling
		// or all the way up if exit is true
		let nextIndex = -1;
		do {
			// if the blockAction was exit or skip
			// we shouldn't process that block again,
			// if there are subsequent parents while walking up
			// we will process those.
			if (blockResult === NodeAction.Continue) {
				upAction?.(block);
			} else {
				blockResult = NodeAction.Continue;
			}
			if (block.parent === undefined) {
				return !exit;
			}
			start = block;
			block = block.parent;
			childCount = block.childCount;
			nextIndex = start.index + increment;
		} while (exit || nextIndex === -1 || nextIndex === childCount);
		// the above loop ensured that siblings are possible
		start = block.children[nextIndex];
	}
}

/**
 * Visit segments starting from node's right/far/forward siblings, then up to node's parent.
 * All segments past `node` are visited, regardless of their visibility.
 */
export function forwardExcursion(
	startNode: IMergeNode,
	leafAction: (seg: ISegmentPrivate) => boolean | undefined,
): boolean {
	if (!isLeafInfo(startNode)) {
		return true;
	}

	return depthFirstNodeWalk(
		startNode.parent,
		// this will either be the sibling, or undefined
		// either is fine, and will result in skipping
		// the startNode only
		startNode.parent.children[startNode.index + 1],
		undefined /* downAction */,
		leafAction,
	);
}

/**
 * Visit segments starting from node's left/near/backwards siblings, then up to node's parent.
 * All segments past `node` are visited, regardless of their visibility.
 */
export function backwardExcursion(
	startNode: IMergeNode,
	leafAction: (seg: ISegmentPrivate) => boolean | undefined,
): boolean {
	if (!isLeafInfo(startNode)) {
		return true;
	}
	return depthFirstNodeWalk(
		startNode.parent,
		// this will either be the sibling, or undefined
		// either is fine, and will result in skipping
		// the startNode only
		startNode.parent.children[startNode.index - 1],
		undefined /* downAction */,
		leafAction,
		undefined /* upAction */,
		false /* forward */,
	);
}

/**
 * Walks all segments below the specific start block
 * @param startBlock - The block to start the walk at
 * @param leafAction - The action to perform on the leaves
 * @returns true if we naturally exit, false if exiting due to leaf action result
 */
export function walkAllChildSegments(
	startBlock: MergeBlock,
	leafAction: (segment: ISegmentPrivate) => boolean | undefined | void,
): boolean {
	if (startBlock.childCount === 0) {
		return true;
	}

	// undefined shouldn't actually be added, but this allows subsequent check for `node.parent` to typecheck
	// without further runtime work.
	const ancestors = new Set<MergeBlock | undefined>();
	for (let cur = startBlock.parent; cur !== undefined; cur = cur.parent) {
		ancestors.add(cur);
	}

	return depthFirstNodeWalk(
		startBlock,
		startBlock.children[0],
		ancestors.size === 0
			? undefined
			: (node): false | undefined =>
					ancestors.has(node.parent) ? NodeAction.Exit : NodeAction.Continue,
		leafAction,
	);
}
