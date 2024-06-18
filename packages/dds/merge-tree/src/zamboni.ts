/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { UnassignedSequenceNumber } from "./constants.js";
import { MergeTree } from "./mergeTree.js";
import { MergeTreeMaintenanceType } from "./mergeTreeDeltaCallback.js";
import {
	type MergeBlock,
	IMergeNode,
	ISegment,
	Marker,
	MaxNodesInBlock,
	seqLTE,
	toMoveInfo,
	toRemovalInfo,
} from "./mergeTreeNodes.js";
import { matchProperties } from "./properties.js";

export const zamboniSegmentsMax = 2;
function underflow(node: MergeBlock) {
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
		let segmentToScour = mergeTree.segmentsToScour.peek()?.value;
		if (!segmentToScour || segmentToScour.maxSeq > mergeTree.collabWindow.minSeq) {
			break;
		}
		segmentToScour = mergeTree.segmentsToScour.get()!;
		// Only skip scouring if needs scour is explicitly false, not true or undefined
		if (
			segmentToScour?.segment?.parent &&
			segmentToScour.segment.parent.needsScour !== false
		) {
			const block = segmentToScour.segment.parent;
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
export function packParent(parent: MergeBlock, mergeTree: MergeTree) {
	const children = parent.children;
	let childIndex: number;
	let childBlock: MergeBlock;
	const holdNodes: IMergeNode[] = [];
	for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
		// Debug assert not isLeaf()
		childBlock = children[childIndex] as MergeBlock;
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
		const packedBlocks = new Array<MergeBlock>(MaxNodesInBlock);
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

function scourNode(node: MergeBlock, holdNodes: IMergeNode[], mergeTree: MergeTree) {
	// The previous segment is tracked while scouring for the purposes of merging adjacent segments
	// when possible.
	let prevSegment: ISegment | undefined;
	for (let k = 0; k < node.childCount; k++) {
		const childNode = node.children[k];
		if (!childNode.isLeaf() || !childNode.segmentGroups.empty) {
			holdNodes.push(childNode);
			prevSegment = undefined;
			continue;
		}

		const segment = childNode;
		const removalInfo = toRemovalInfo(segment);
		const moveInfo = toMoveInfo(segment);
		if (removalInfo !== undefined || moveInfo !== undefined) {
			// If the segment's removal is below the MSN and it's not being held onto by a tracking group,
			// it can be unlinked (i.e. removed from the merge-tree)
			if (
				((!!removalInfo && seqLTE(removalInfo.removedSeq, mergeTree.collabWindow.minSeq)) ||
					(!!moveInfo && seqLTE(moveInfo.movedSeq, mergeTree.collabWindow.minSeq))) &&
				segment.trackingCollection.empty
			) {
				mergeTree.mergeTreeMaintenanceCallback?.(
					{
						operation: MergeTreeMaintenanceType.UNLINK,
						deltaSegments: [{ segment }],
					},
					undefined,
				);

				segment.parent = undefined;

				if (Marker.is(segment)) {
					mergeTree.unlinkMarker(segment);
				}
			} else {
				holdNodes.push(segment);
			}

			prevSegment = undefined;
		} else {
			if (segment.seq! <= mergeTree.collabWindow.minSeq) {
				const segmentHasPositiveLength = (mergeTree.localNetLength(segment) ?? 0) > 0;
				const canAppend =
					prevSegment?.canAppend(segment) &&
					matchProperties(prevSegment.properties, segment.properties) &&
					prevSegment.trackingCollection.matches(segment.trackingCollection) &&
					segmentHasPositiveLength;

				if (canAppend) {
					prevSegment!.append(segment);
					mergeTree.mergeTreeMaintenanceCallback?.(
						{
							operation: MergeTreeMaintenanceType.APPEND,
							deltaSegments: [{ segment: prevSegment! }, { segment }],
						},
						undefined,
					);

					segment.parent = undefined;
					segment.trackingCollection.trackingGroups.forEach((tg) => tg.unlink(segment));
				} else {
					holdNodes.push(segment);
					prevSegment = segmentHasPositiveLength ? segment : undefined;
				}
			} else {
				holdNodes.push(segment);
				prevSegment = undefined;
			}
		}
	}
}
