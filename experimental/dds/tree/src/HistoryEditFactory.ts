/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils';
import { DetachedSequenceId, isDetachedSequenceId, NodeId } from './Identifiers.js';
import { fail } from './Common.js';
import { rangeFromStableRange } from './TreeViewUtilities.js';
import {
	ChangeInternal,
	ChangeTypeInternal,
	DetachInternal,
	SetValueInternal,
	InsertInternal,
	BuildNodeInternal,
	Side,
	StableRangeInternal,
	EditStatus,
} from './persisted-types/index.js';
import { TransactionInternal } from './TransactionInternal.js';
import { RangeValidationResultKind, validateStableRange } from './EditUtilities.js';
import { StablePlace } from './ChangeTypes.js';
import { RevisionView } from './RevisionView.js';
import { TreeView } from './TreeView.js';
import { getChangeNodeFromViewNode } from './SerializationUtilities.js';

/**
 * Events emitted from the history edit factory
 */
export enum HistoryEditFactoryEvents {
	MalformedEdit = 'malformedEdit',
	MissingNodes = 'missingNodes',
}

/**
 * Given a sequence of changes, produces an inverse sequence of changes, i.e. the minimal changes required to revert the given changes
 * @param changes - the changes for which to produce an inverse.
 * @param before - a view of the tree state before `changes` are/were applied - used as a basis for generating the inverse.
 * @param logger - an optional logger for logging telemetry coming from the revert operation
 * @param emit - an optional event emitter to emit events from the revert operation and to allow clients to respond to them
 * @returns if the changes could be reverted, a sequence of changes _r_ that will produce `before` if applied to a view _A_, where _A_ is the result of
 * applying `changes` to `before`. Note that the size of the array of reverted changes may not be the same as the input array, and may even be empty in cases where
 * the view did not change. Applying _r_ to views other than _A_ is legal but may cause the changes to fail to apply or may not be a true semantic inverse.
 * If the changes could not be reverted given the state of `before`, returns undefined.
 *
 * TODO: what should this do if `changes` fails to apply to `before`?
 * TODO:#68574: Pass a view that corresponds to the appropriate Fluid reference sequence number rather than the view just before
 * @internal
 */
export function revert(
	changes: readonly ChangeInternal[],
	before: RevisionView,
	logger?: ITelemetryLoggerExt,
	emit?: (event: string, ...args: any[]) => void
): ChangeInternal[] | undefined {
	const result: ChangeInternal[] = [];

	const builtNodes = new Map<DetachedSequenceId, NodeId[]>();
	const detachedNodes = new Map<DetachedSequenceId, NodeId[]>();

	// Open edit on revision to update it as changes are walked through
	const editor = TransactionInternal.factory(before);
	// Apply `edit`, generating an inverse as we go.
	for (const change of changes) {
		// Generate an inverse of each change
		switch (change.type) {
			case ChangeTypeInternal.Build: {
				// Save nodes added to the detached state for use in future changes
				const { destination, source } = change;
				assert(
					!builtNodes.has(destination),
					0x626 /* Cannot revert Build: destination is already used by a Build */
				);
				assert(
					!detachedNodes.has(destination),
					0x627 /* Cannot revert Build: destination is already used by a Detach */
				);
				builtNodes.set(
					destination,
					source.reduce((ids: NodeId[], curr: BuildNodeInternal) => {
						if (isDetachedSequenceId(curr)) {
							const nodesForDetachedSequence =
								builtNodes.get(curr) ?? fail('detached sequence must have associated built nodes');

							ids.push(...nodesForDetachedSequence);
						} else {
							ids.push(curr.identifier);
						}
						return ids;
					}, [])
				);
				break;
			}
			case ChangeTypeInternal.Insert: {
				const { source } = change;
				const nodesBuilt = builtNodes.get(source);
				const nodesDetached = detachedNodes.get(source);

				if (nodesBuilt !== undefined) {
					if (nodesBuilt.length === 0) {
						builtNodes.delete(source);
						logger?.sendTelemetryEvent({ eventName: 'reverting insertion of empty traits' });
						continue;
					}
					result.unshift(createInvertedInsert(change, nodesBuilt));
					builtNodes.delete(source);
				} else if (nodesDetached !== undefined) {
					if (nodesDetached.length === 0) {
						detachedNodes.delete(source);
						logger?.sendTelemetryEvent({ eventName: 'reverting insertion of empty traits' });
						continue;
					}
					result.unshift(createInvertedInsert(change, nodesDetached, true));
					detachedNodes.delete(source);
				} else {
					// Cannot revert an insert whose source is no longer available for inserting (i.e. not just built, and not detached)
					if (emit !== undefined) {
						emit(HistoryEditFactoryEvents.MissingNodes, change, changes);
					}
					return undefined;
				}

				break;
			}
			case ChangeTypeInternal.Detach: {
				const { destination } = change;
				const invert = createInvertedDetach(change, editor.view);
				if (invert === undefined) {
					// Cannot revert a detach whose source does not exist in the tree
					// TODO:68574: May not be possible once associated todo in `createInvertedDetach` is addressed
					if (emit !== undefined) {
						emit(HistoryEditFactoryEvents.MissingNodes, change, changes);
					}
					return undefined;
				}
				const { invertedDetach, detachedNodeIds } = invert;

				if (detachedNodeIds.length === 0) {
					logger?.sendTelemetryEvent({ eventName: 'reverting detachment of empty traits' });
					continue;
				}

				if (destination !== undefined) {
					if (builtNodes.has(destination) || detachedNodes.has(destination)) {
						// Malformed: destination was already used by a prior build or detach
						if (emit !== undefined) {
							emit(HistoryEditFactoryEvents.MalformedEdit, change, changes);
						}
						return undefined;
					}
					detachedNodes.set(destination, detachedNodeIds);
				}

				result.unshift(...invertedDetach);
				break;
			}
			case ChangeTypeInternal.SetValue: {
				const invert = createInvertedSetValue(change, editor.view);
				if (invert === undefined) {
					// Cannot revert a set for a node that does not exist in the tree
					// TODO:68574: May not be possible once associated todo in `createInvertedSetValue` is addressed
					if (emit !== undefined) {
						emit(HistoryEditFactoryEvents.MissingNodes, change, changes);
					}
					return undefined;
				}
				result.unshift(...invert);
				break;
			}
			case ChangeTypeInternal.Constraint:
				// TODO:#46759: Support Constraint in reverts
				fail('Revert currently does not support Constraints');
			default:
				fail('Revert does not support the change type.');
		}

		// Abort the entire revert if this change can't be applied successfully.
		if (editor.applyChange(change).status !== EditStatus.Applied) {
			return undefined;
		}
	}

	editor.close();
	return result;
}

/**
 * The inverse of an Insert is a Detach that starts before the leftmost node inserted and ends after the rightmost.
 */
function createInvertedInsert(
	insert: InsertInternal,
	nodesInserted: readonly NodeId[],
	saveDetached = false
): ChangeInternal {
	const leftmostNode = nodesInserted[0];
	const rightmostNode = nodesInserted[nodesInserted.length - 1];

	const source: StableRangeInternal = {
		start: {
			referenceSibling: leftmostNode,
			side: Side.Before,
		},
		end: {
			referenceSibling: rightmostNode,
			side: Side.After,
		},
	};

	return ChangeInternal.detach(source, saveDetached ? insert.source : undefined);
}

/**
 * If a detach does not include a destination, its inverse is a build and insert. Otherwise, it is just an insert.
 * Information on the nodes that were detached is obtained by going to the revision before the detach.
 *
 * The anchor for the resulting Insert is chosen in the following order:
 *
 * ```markdown
 *     1. If detach.source.start.side is After: detach.source.start
 *
 *        ex: For nodes A B [C..F] G H where [C..F] represents the detached nodes,
 *            if detach.source.start is "After B", the anchor for the resulting Insert will also be "After B".
 *
 *            For nodes [A..F] G H where [A..F] represents the detached nodes,
 *            if detach.source.start is "After start of trait", the anchor for the resulting Insert will also be
 *            "After start of trait".
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
 * ```
 *
 * When choosing the anchor, the existing anchors on detach.source are preferred when they have a valid sibling.
 * Otherwise, the valid anchor to the left of the originally detached nodes is chosen.
 */
function createInvertedDetach(
	detach: DetachInternal,
	viewBeforeChange: TreeView
): { invertedDetach: ChangeInternal[]; detachedNodeIds: NodeId[] } | undefined {
	const validatedSource = validateStableRange(viewBeforeChange, detach.source);
	if (validatedSource.result !== RangeValidationResultKind.Valid) {
		// TODO:#68574: having the reference view would potentially allow us to revert some detaches that currently conflict
		return undefined;
	}

	const { start, end } = rangeFromStableRange(viewBeforeChange, validatedSource);
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
			invertedDetach: [ChangeInternal.insert(detach.destination, insertDestination)],
			detachedNodeIds,
		};
	}

	const detachedSequenceId = 0 as DetachedSequenceId;
	return {
		invertedDetach: [
			ChangeInternal.build(
				detachedNodeIds.map((id) => getChangeNodeFromViewNode(viewBeforeChange, id)),
				detachedSequenceId
			),
			ChangeInternal.insert(detachedSequenceId, insertDestination),
		],
		detachedNodeIds,
	};
}

/**
 * The inverse of a SetValue is a SetValue that sets the value to what it was prior to the change.
 */
function createInvertedSetValue(setValue: SetValueInternal, viewBeforeChange: TreeView): ChangeInternal[] | undefined {
	const { nodeToModify } = setValue;
	const node = viewBeforeChange.tryGetViewNode(nodeToModify);
	if (node === undefined) {
		// TODO:68574: With a reference view, may be able to better resolve conflicting sets
		return undefined;
	}

	// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface)
	if (node.payload !== null) {
		return [ChangeInternal.setPayload(nodeToModify, node.payload)];
	}
	return [ChangeInternal.clearPayload(nodeToModify)];
}
