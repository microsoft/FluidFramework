/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	makeChangeAtomId,
	offsetChangeAtomId,
	type ChangeAtomId,
	type FieldKindIdentifier,
} from "../../core/index.js";
import { brand, type RangeQueryResult } from "../../util/index.js";
import { setInChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import { EditFilterStatus } from "./fieldChangeHandler.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type {
	FieldChange,
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { addNodeRename, makeChangesetInversions, newRootTable } from "./modularChangeUtils.js";
import { pruneChangeset } from "./prune.js";

export function removeAllDetachesFilter(
	_id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return {
		value: EditFilterStatus.Remove,
		length: count,
	};
}

export function removeAllAttachesFilter(
	_id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return { value: EditFilterStatus.Remove, length: count };
}

/**
 * Returns a modified copy of the given changeset with field edits and renames filtered according to the provided functions.
 * Note that the caller is responsible for ensuring that all removed detaches also have any associated renames removed,
 * that preserved attaches of existing roots do not lose their associated renames.
 */
export function filterEdits(
	change: ModularChangeset,
	filterFieldEdits: (fieldChange: FieldChange, fieldId: FieldId) => FieldChange,
	filterRename: (
		oldId: ChangeAtomId,
		newId: ChangeAtomId,
		count: number,
	) => RangeQueryResult<EditFilterStatus>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	const filteredFieldChanges = filterFieldMapEdits(
		change.fieldChanges,
		undefined,
		filterFieldEdits,
	);

	const filteredNodeChanges: ChangeAtomIdBTree<NodeChangeset> = brand(
		change.nodeChanges.mapValues((v, k) =>
			filterNodeEdits(makeChangeAtomId(k[1], k[0]), v, filterFieldEdits),
		),
	);

	// XXX: Handle outputDetachLocations.
	const filteredRoots = newRootTable();
	for (const {
		start: oldIdFirst,
		value: newIdFirst,
		length,
	} of change.rootNodes.oldToNewId.entries()) {
		let remainingLength = length;
		let oldId = oldIdFirst;
		let newId = newIdFirst;
		while (remainingLength > 0) {
			const filterResult = filterRename(oldId, newId, remainingLength);
			if (filterResult.value === EditFilterStatus.Preserve) {
				const detachLocationEntry = change.rootNodes.detachLocations.getFirst(
					oldId,
					filterResult.length,
				);

				assert(detachLocationEntry.length === filterResult.length, "XXX");
				addNodeRename(
					filteredRoots,
					oldId,
					newId,
					filterResult.length,
					detachLocationEntry.value,
				);
			}

			oldId = offsetChangeAtomId(oldId, filterResult.length);
			newId = offsetChangeAtomId(newId, filterResult.length);
			remainingLength -= filterResult.length;
		}
	}

	for (const [rootIdKey, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const rootId = makeChangeAtomId(rootIdKey[1], rootIdKey[0]);
		setInChangeAtomIdMap(filteredRoots.nodeChanges, rootId, nodeId);

		const detachLocation = change.rootNodes.detachLocations.getFirst(rootId, 1).value;
		if (detachLocation !== undefined) {
			filteredRoots.detachLocations.set(rootId, 1, detachLocation);
		}
	}

	const { crossFieldKeys: filteredCrossFieldKeys, nodeToParent: filteredNodeToParent } =
		makeChangesetInversions(
			filteredFieldChanges,
			filteredRoots,
			filteredNodeChanges,
			change.nodeAliases,
			fieldKinds,
		);

	return pruneChangeset(
		{
			...change,
			fieldChanges: filteredFieldChanges,
			nodeChanges: filteredNodeChanges,
			rootNodes: filteredRoots,
			crossFieldKeys: filteredCrossFieldKeys,
			nodeToParent: filteredNodeToParent,
		},
		fieldKinds,
	);
}

function filterFieldMapEdits(
	change: FieldChangeMap,
	nodeId: NodeId | undefined,
	filterFieldEdits: (fieldChange: FieldChange, fieldId: FieldId) => FieldChange,
): FieldChangeMap {
	return new Map(
		Array.from(change.entries(), ([field, fieldChange]) => [
			field,
			filterFieldEdits(fieldChange, { nodeId, field }),
		]),
	);
}

function filterNodeEdits(
	nodeId: NodeId,
	change: NodeChangeset,
	filterFieldEdits: (fieldChange: FieldChange, fieldId: FieldId) => FieldChange,
): NodeChangeset {
	if (change.fieldChanges === undefined) {
		return change;
	}
	return {
		...change,
		fieldChanges: filterFieldMapEdits(change.fieldChanges, nodeId, filterFieldEdits),
	};
}
