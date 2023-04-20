/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { UnassignedSequenceNumber } from "./constants";
import { MergeTree } from "./mergeTree";
import { MergeTreeMaintenanceType } from "./mergeTreeDeltaCallback";
import { IMergeBlock, IMergeNode, ISegment, MaxNodesInBlock } from "./mergeTreeNodes";
import { matchProperties } from "./properties";

export const zamboniSegmentsMax = 2;
function underflow(node: IMergeBlock) {
	return node.childCount < MaxNodesInBlock / 2;
}

export function zamboniSegments(
	mergeTree: MergeTree,
	zamboniSegmentsMaxCount = zamboniSegmentsMax,
) {
	if (!mergeTree.collabWindow.collaborating) {
		return;
	}

	for (let i = 0; i < zamboniSegmentsMaxCount; i++) {
		let segmentToScour = mergeTree.segmentsToScour.peek();
		if (!segmentToScour || segmentToScour.maxSeq > mergeTree.collabWindow.minSeq) {
			break;
		}
		segmentToScour = mergeTree.segmentsToScour.get();
		// Only skip scouring if needs scour is explicitly false, not true or undefined
		if (segmentToScour.segment!.parent && segmentToScour.segment!.parent.needsScour !== false) {
			const block = segmentToScour.segment!.parent;
			const childrenCopy: IMergeNode[] = [];
			scourNode(block, childrenCopy, mergeTree);
			// This will avoid the cost of re-scouring nodes
			// that have recently been scoured
			block.needsScour = false;

			const newChildCount = childrenCopy.length;

			if (newChildCount < block.childCount) {
				block.childCount = newChildCount;
				block.children = childrenCopy;
				for (let j = 0; j < newChildCount; j++) {
					block.assignChild(childrenCopy[j], j, false);
				}

				if (underflow(block) && block.parent) {
					packParent(block.parent, mergeTree);
				} else {
					mergeTree.nodeUpdateOrdinals(block);
					mergeTree.blockUpdatePathLengths(block, UnassignedSequenceNumber, -1, true);
				}
			}
		}
	}
}

// Interior node with all node children
export function packParent(parent: IMergeBlock, mergeTree: MergeTree) {
	const children = parent.children;
	let childIndex: number;
	let childBlock: IMergeBlock;
	const holdNodes: IMergeNode[] = [];
	for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
		// Debug assert not isLeaf()
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		childBlock = <IMergeBlock>children[childIndex];
		scourNode(childBlock, holdNodes, mergeTree);
		// Will replace this block with a packed block
		childBlock.parent = undefined;
	}
	if (holdNodes.length > 0) {
		const totalNodeCount = holdNodes.length;
		const halfOfMaxNodeCount = MaxNodesInBlock / 2;
		let childCount = Math.min(
			MaxNodesInBlock - 1,
			Math.floor(totalNodeCount / halfOfMaxNodeCount),
		);
		if (childCount < 1) {
			childCount = 1;
		}
		const baseNodesInBlockCount = Math.floor(totalNodeCount / childCount);
		let remainderCount = totalNodeCount % childCount;
		const packedBlocks = new Array<IMergeBlock>(MaxNodesInBlock);
		let childrenPackedCount = 0;
		for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
			let nodeCount = baseNodesInBlockCount;
			if (remainderCount > 0) {
				nodeCount++;
				remainderCount--;
			}
			const packedBlock = mergeTree.makeBlock(nodeCount);
			for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
				const nodeToPack = holdNodes[childrenPackedCount++];
				packedBlock.assignChild(nodeToPack, packedNodeIndex, false);
			}
			packedBlock.parent = parent;
			packedBlocks[nodeIndex] = packedBlock;
			mergeTree.nodeUpdateLengthNewStructure(packedBlock);
		}
		parent.children = packedBlocks;
		for (let j = 0; j < childCount; j++) {
			parent.assignChild(packedBlocks[j], j, false);
		}
		parent.childCount = childCount;
	} else {
		parent.children = [];
		parent.childCount = 0;
	}
	if (underflow(parent) && parent.parent) {
		packParent(parent.parent, mergeTree);
	} else {
		mergeTree.nodeUpdateOrdinals(parent);
		mergeTree.blockUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
	}
}

function scourNode(node: IMergeBlock, holdNodes: IMergeNode[], mergeTree: MergeTree) {
	let prevSegment: ISegment | undefined;
	for (let k = 0; k < node.childCount; k++) {
		const childNode = node.children[k];
		if (childNode.isLeaf()) {
			const segment = childNode;
			if (segment.segmentGroups.empty) {
				if (segment.removedSeq !== undefined) {
					if (segment.removedSeq > mergeTree.collabWindow.minSeq) {
						holdNodes.push(segment);
					} else if (!segment.trackingCollection.empty) {
						holdNodes.push(segment);
					} else {
						// Notify maintenance event observers that the segment is being unlinked from the MergeTree
						if (mergeTree.mergeTreeMaintenanceCallback) {
							mergeTree.mergeTreeMaintenanceCallback(
								{
									operation: MergeTreeMaintenanceType.UNLINK,
									deltaSegments: [{ segment }],
								},
								undefined,
							);
						}

						segment.parent = undefined;
					}
					prevSegment = undefined;
				} else {
					if (segment.seq! <= mergeTree.collabWindow.minSeq) {
						const canAppend =
							// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
							prevSegment &&
							prevSegment.canAppend(segment) &&
							matchProperties(prevSegment.properties, segment.properties) &&
							prevSegment.trackingCollection.matches(segment.trackingCollection) &&
							(mergeTree.localNetLength(segment) ?? 0) > 0;

						if (canAppend) {
							prevSegment!.append(segment);
							if (mergeTree.mergeTreeMaintenanceCallback) {
								mergeTree.mergeTreeMaintenanceCallback(
									{
										operation: MergeTreeMaintenanceType.APPEND,
										deltaSegments: [{ segment: prevSegment! }, { segment }],
									},
									undefined,
								);
							}
							segment.parent = undefined;
							segment.trackingCollection.trackingGroups.forEach((tg) =>
								tg.unlink(segment),
							);
						} else {
							holdNodes.push(segment);
							prevSegment =
								(mergeTree.localNetLength(segment) ?? 0) > 0 ? segment : undefined;
						}
					} else {
						holdNodes.push(segment);
						prevSegment = undefined;
					}
				}
			} else {
				holdNodes.push(segment);
				prevSegment = undefined;
			}
		} else {
			holdNodes.push(childNode);
			prevSegment = undefined;
		}
	}
}
