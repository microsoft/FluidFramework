/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, fail, Mutable, ReplaceRecursive } from './Common';
import { convertTreeNodes } from './EditUtilities';
import { DetachedSequenceId, isDetachedSequenceId, NodeId } from './Identifiers';
import {
	BuildNodeInternal,
	ChangeInternal,
	ChangeTypeInternal,
	ConstraintInternal,
	DetachInternal,
	Edit,
	NodeData,
	StablePlaceInternal,
	StableRangeInternal,
	TreeNode,
} from './persisted-types';

export function convertEditIds<IdFrom, IdTo>(
	edit: ReplaceRecursive<Edit<ChangeInternal>, NodeId, IdFrom>,
	convert: (id: IdFrom) => IdTo
): Edit<ReplaceRecursive<ChangeInternal, NodeId, IdTo>> {
	const changes = edit.changes.map((change): ReplaceRecursive<ChangeInternal, NodeId, IdTo> => {
		switch (change.type) {
			case ChangeTypeInternal.Build:
				return {
					type: ChangeTypeInternal.Build,
					destination: change.destination,
					source: change.source.map((tree) => {
						return convertTreeNodes<
							TreeNode<ReplaceRecursive<BuildNodeInternal, NodeId, IdFrom>, IdFrom>,
							TreeNode<ReplaceRecursive<BuildNodeInternal, NodeId, IdTo>, IdTo>,
							DetachedSequenceId
						>(tree, (node) => convertNodeDataIds(node, convert), isDetachedSequenceId);
					}),
				};
			case ChangeTypeInternal.Insert:
				return {
					type: ChangeTypeInternal.Insert,
					source: change.source,
					destination: convertStablePlaceIds(change.destination, convert),
				};
			case ChangeTypeInternal.Detach: {
				const detach: ReplaceRecursive<DetachInternal, NodeId, IdTo> = {
					type: ChangeTypeInternal.Detach,
					source: convertStableRangeIds(change.source, convert),
				};
				copyPropertyIfDefined(change, detach, 'destination');
				return detach;
			}
			case ChangeTypeInternal.SetValue:
				return {
					type: ChangeTypeInternal.SetValue,
					nodeToModify: convert(change.nodeToModify),
					payload: change.payload,
				};
			case ChangeTypeInternal.Constraint: {
				const constraint: Mutable<ReplaceRecursive<ConstraintInternal, NodeId, IdTo>> = {
					type: ChangeTypeInternal.Constraint,
					effect: change.effect,
					toConstrain: convertStableRangeIds(change.toConstrain, convert),
				};
				copyPropertyIfDefined(change, constraint, 'identityHash');
				copyPropertyIfDefined(change, constraint, 'label');
				copyPropertyIfDefined(change, constraint, 'length');
				copyPropertyIfDefined(change, constraint, 'contentHash');
				if (change.parentNode !== undefined) {
					constraint.parentNode = convert(change.parentNode);
				}
				return constraint;
			}
			default:
				fail('Unknown change type.');
		}
	});
	const newEdit = { id: edit.id, changes };
	copyPropertyIfDefined(edit, newEdit, 'pastAttemptCount');
	return newEdit;
}

export function convertNodeDataIds<IdFrom, IdTo>(
	nodeData: NodeData<IdFrom>,
	convert: (id: IdFrom) => IdTo
): NodeData<IdTo> {
	const identifier = convert(nodeData.identifier);
	const output = { definition: nodeData.definition, identifier };
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

export function convertStableRangeIds<IdFrom, IdTo>(
	range: ReplaceRecursive<StableRangeInternal, NodeId, IdFrom>,
	convert: (id: IdFrom) => IdTo
): ReplaceRecursive<StableRangeInternal, NodeId, IdTo> {
	const start = convertStablePlaceIds(range.start, convert);
	const end = convertStablePlaceIds(range.end, convert);
	return { start, end };
}

export function convertStablePlaceIds<IdFrom, IdTo>(
	{ side, referenceSibling, referenceTrait }: ReplaceRecursive<StablePlaceInternal, NodeId, IdFrom>,
	convert: (id: IdFrom) => IdTo
): ReplaceRecursive<StablePlaceInternal, NodeId, IdTo> {
	const stablePlaceNew: Mutable<ReplaceRecursive<StablePlaceInternal, NodeId, IdTo>> = {
		side,
	};

	if (referenceSibling !== undefined) {
		const nodeId = convert(referenceSibling);
		stablePlaceNew.referenceSibling = nodeId;
	}

	if (referenceTrait !== undefined) {
		const parent = convert(referenceTrait.parent);
		stablePlaceNew.referenceTrait = {
			label: referenceTrait.label,
			parent,
		};
	}

	return stablePlaceNew;
}
