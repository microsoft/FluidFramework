/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from '../Identifiers';
import { assert, fail } from '../Common';
import { RevisionView, Side, TransactionView } from '../TreeView';
import { BuildNode, TreeNode } from '../generic';
import { Change, ChangeType, Detach, Insert, SetValue, StableRange, StablePlace } from './PersistedTypes';
import { Transaction } from './Transaction';
import { rangeFromStableRange } from './EditUtilities';

/**
 * Given a sequence of changes, produces an inverse sequence of changes, i.e. the minimal changes required to revert the given changes
 * @param changes - the changes for which to produce an inverse.
 * @param before - a view of the tree state before `changes` are/were applied - used as a basis for generating the inverse.
 * @returns a sequence of changes _r_ that will produce `before` if applied to a view _A_, where _A_ is the result of
 * applying `changes` to `before`. Applying _r_ to views other than _A_ is legal but may cause the changes to fail to apply or may
 * not be a true semantic inverse.
 *
 * TODO: what should this do if `changes` fails to apply to `before`?
 * @public
 */
export function revert(changes: readonly Change[], before: RevisionView): Change[] {
	const result: Change[] = [];

	const builtNodes = new Map<DetachedSequenceId, NodeId[]>();
	const detachedNodes = new Map<DetachedSequenceId, NodeId[]>();

	// Open edit on revision to update it as changes are walked through
	const editor = Transaction.factory(before);
	// Apply `edit`, generating an inverse as we go.
	for (const change of changes) {
		// Generate an inverse of each change
		switch (change.type) {
			case ChangeType.Build: {
				// Save nodes added to the detached state for use in future changes
				const { destination, source } = change;
				assert(!builtNodes.has(destination), `Cannot revert Build: destination is already used by a Build`);
				assert(!detachedNodes.has(destination), `Cannot revert Build: destination is already used by a Detach`);
				builtNodes.set(
					destination,
					source.map((node) => (node as TreeNode<BuildNode>).identifier)
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
				} else if (nodesDetached !== undefined) {
					result.unshift(createInvertedInsert(change, nodesDetached, true));
					detachedNodes.delete(source);
				} else {
					fail('Cannot revert Insert: source has not been built or detached.');
				}

				break;
			}
			case ChangeType.Detach: {
				const { destination } = change;
				const { invertedDetach, detachedNodeIds } = createInvertedDetach(change, editor.view);

				if (destination !== undefined) {
					assert(
						!builtNodes.has(destination),
						`Cannot revert Detach: destination is already used by a Build`
					);
					assert(
						!detachedNodes.has(destination),
						`Cannot revert Detach: destination is already used by a Detach`
					);
					detachedNodes.set(destination, detachedNodeIds);
				}

				result.unshift(...invertedDetach);
				break;
			}
			case ChangeType.SetValue:
				result.unshift(...createInvertedSetValue(change, editor.view));
				break;
			case ChangeType.Constraint:
				// TODO:#46759: Support Constraint in reverts
				fail('Revert currently does not support Constraints');
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
	viewBeforeChange: TransactionView
): { invertedDetach: Change[]; detachedNodeIds: NodeId[] } {
	const { source } = detach;

	const { start, end } = rangeFromStableRange(viewBeforeChange, source);
	const { trait: referenceTrait } = start;
	const nodes = viewBeforeChange.getTrait(referenceTrait);

	const startIndex = viewBeforeChange.findIndexWithinTrait(start);
	const endIndex = viewBeforeChange.findIndexWithinTrait(end);
	const detachedNodeIds: NodeId[] = nodes.slice(startIndex, endIndex);

	const leftOfDetached = nodes.slice(0, startIndex);

	let insertDestination: StablePlace;

	if (start.side === Side.After) {
		insertDestination =
			start.sibling === undefined
				? { side: Side.After, referenceTrait }
				: { side: Side.After, referenceSibling: start.sibling };
	} else if (end.side === Side.Before) {
		insertDestination =
			end.sibling === undefined
				? { side: Side.Before, referenceTrait }
				: { side: Side.Before, referenceSibling: end.sibling };
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
			Change.build(viewBeforeChange.getChangeNodes(detachedNodeIds), detachedSequenceId),
			Change.insert(detachedSequenceId, insertDestination),
		],
		detachedNodeIds,
	};
}

function createInvertedSetValue(setValue: SetValue, revisionBeforeChange: TransactionView): Change[] {
	const { nodeToModify } = setValue;
	const oldPayload = revisionBeforeChange.getViewNode(nodeToModify).payload;

	// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface)
	// eslint-disable-next-line no-null/no-null
	if (oldPayload !== null) {
		return [Change.setPayload(nodeToModify, oldPayload)];
	}
	return [Change.clearPayload(nodeToModify)];
}
