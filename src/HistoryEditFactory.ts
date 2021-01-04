/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from './Identifiers';
import { fail } from './Common';
import {
	Change,
	ChangeType,
	Detach,
	EditNode,
	Insert,
	Node,
	Edit,
	SetValue,
	StableRange,
	StablePlace,
	Side,
} from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { Transaction } from './Transaction';

/**
 * Creates the changes required to revert the given edit associated with respect to the supplied view.
 * @public
 */
export function revert(edit: Edit, view: Snapshot): Change[] {
	const result: Change[] = [];

	const builtNodes = new Map<DetachedSequenceId, NodeId[]>();
	const detachedNodes = new Map<DetachedSequenceId, NodeId[]>();
	const insertSources = new Set<DetachedSequenceId>();

	// Open edit on revision to update it as changes are walked through
	const editor = new Transaction(view);
	// Roll back target edit
	for (const change of edit.changes) {
		switch (change.type) {
			case ChangeType.Build: {
				// Save nodes added to the detached state for use in future changes
				const { destination, source } = change;
				builtNodes.set(
					destination,
					source.map((node) => (node as Node<EditNode>).identifier)
				);
				break;
			}
			case ChangeType.Insert: {
				const { source } = change;
				const nodesBuilt = builtNodes.get(source);
				const nodesDetached = detachedNodes.get(source);

				if (nodesBuilt !== undefined) {
					result.unshift(createInvertedInsert(change, nodesBuilt));
					builtNodes.delete(source);

					// Save source ids of inserts for use in future changes
					insertSources.add(source);
				}

				if (nodesDetached !== undefined) {
					result.unshift(createInvertedInsert(change, nodesDetached, true));
					builtNodes.delete(source);

					// Save source ids of inserts for use in future changes
					insertSources.add(source);
				}

				break;
			}
			case ChangeType.Detach: {
				const { destination: source } = change;

				const { invertedDetach, detachedNodeIds } = createInvertedDetach(
					source !== undefined && insertSources.has(source) ? change : { ...change, destination: undefined },
					editor.view
				);

				const { destination } = change;
				if (destination !== undefined) {
					detachedNodes.set(destination, detachedNodeIds);
				}

				result.unshift(...invertedDetach);
				if (source !== undefined) {
					insertSources.delete(source);
				}
				break;
			}
			case ChangeType.SetValue:
				result.unshift(...createInvertedSetValue(change, editor.view));
				break;
			case ChangeType.Constraint:
				// TODO:#46759: Support Constraint in reverts
				fail('Revert currently does not support Constraints');
				break;
			default:
				fail('Revert does not support the change type.');
		}

		// Update the revision
		editor.applyChange(change);
	}

	editor.close();
	return result;
}

/**
 * Inverse of an Insert is a Detach that starts before the leftmost node inserted and ends after the rightmost.
 */
function createInvertedInsert(insert: Insert, nodesInserted: readonly NodeId[], saveDetached = false): Change {
	const leftmostNode = nodesInserted[0];
	const rightmostNode = nodesInserted[nodesInserted.length - 1];

	const source: StableRange = {
		start: {
			referenceSibling: leftmostNode,
			side: Side.Before,
		},
		end: {
			referenceSibling: rightmostNode,
			side: Side.After,
		},
	};

	return Change.detach(source, saveDetached ? insert.source : undefined);
}

/**
 * If a detach does not include a destination, its inverse is a build and insert. Otherwise, it is just an insert.
 * Information on the nodes that were detached is obtained by going to the revision before the detach.
 *
 * The anchor for the resulting Insert is chosen in the following order:
 *     1. If detach.source.start.side is After: detach.source.start
 *
 *        ex: For nodes A B [C..F] G H where [C..F] represents the detached nodes,
 *            if detach.source.start is "After B", the anchor for the resulting Insert will also be "After B".
 *
 *            For nodes [A..F] G H where [A..F] represents the detached nodes,
 *            if detach.source.start is "After start of trait", the anchor for the resulting Insert will also be "After start of trait".
 *
 *     2. Else if detach.source.end.side is Before: detach.source.end
 *
 *        ex: For nodes A B [C..F] G H where [C..F] represents the detached nodes,
 *            if detach.source.start is "Before C" and detach.source.end is "Before G",
 *            the anchor for the resulting Insert will be "Before G".
 *
 *     3. Else: After the node directly to the left of the originally detached nodes
 *
 *        ex: For nodes A B [C..F] G H where [C..F] represents the detached nodes,
 *            if detach.source.start is "Before C" and detach.source.end is "After F",
 *            the anchor for the resulting Insert will be "After B".
 *
 *  When choosing the anchor, the existing anchors on detach.source are preferred when they have a valid sibling. Otherwise, the valid
 *  anchor to the left of the originally detached nodes is chosen.
 */
function createInvertedDetach(
	detach: Detach,
	snapshotBeforeEdit: Snapshot
): { invertedDetach: Change[]; detachedNodeIds: NodeId[] } {
	const { source } = detach;

	const { start, end } = snapshotBeforeEdit.rangeFromStableRange(source);
	const { trait: referenceTrait } = start;
	const nodes = snapshotBeforeEdit.getTrait(referenceTrait);

	const startIndex = snapshotBeforeEdit.findIndexWithinTrait(start);
	const endIndex = snapshotBeforeEdit.findIndexWithinTrait(end);
	const detachedNodeIds: NodeId[] = nodes.slice(startIndex, endIndex);

	const leftOfDetached = nodes.slice(0, startIndex);

	let insertDestination: StablePlace;

	if (start.side === Side.After) {
		insertDestination = start;
	} else if (end.side === Side.Before) {
		insertDestination = end;
	} else {
		const referenceSibling = leftOfDetached.pop();
		insertDestination = {
			side: Side.After,
			referenceSibling,
			referenceTrait: referenceSibling === undefined ? referenceTrait : undefined,
		};
	}

	if (detach.destination !== undefined) {
		return {
			invertedDetach: [Change.insert(detach.destination, insertDestination)],
			detachedNodeIds,
		};
	}

	const detachedSequenceId = 0 as DetachedSequenceId;
	return {
		invertedDetach: [
			Change.build(snapshotBeforeEdit.getChangeNodes(detachedNodeIds), detachedSequenceId),
			Change.insert(detachedSequenceId, insertDestination),
		],
		detachedNodeIds,
	};
}

function createInvertedSetValue(setValue: SetValue, revisionBeforeEdit: Snapshot): Change[] {
	const { nodeToModify } = setValue;
	const oldPayload = revisionBeforeEdit.getSnapshotNode(nodeToModify).payload;

	if (oldPayload) {
		return [Change.setPayload(nodeToModify, oldPayload)];
	}
	return [Change.clearPayload(nodeToModify)];
}
