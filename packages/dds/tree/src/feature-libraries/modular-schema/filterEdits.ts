/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	makeChangeAtomId,
	type ChangeAtomId,
	type FieldKindIdentifier,
} from "../../core/index.js";
import { brand, type RangeQueryResult } from "../../util/index.js";
import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import {
	EditFilterStatus,
	type FilterAttachResult,
	type FilterDetachResult,
} from "./fieldChangeHandler.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type {
	FieldChange,
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { makeChangesetInversions } from "./modularChangeUtils.js";
import { pruneChangeset } from "./prune.js";

export function removeAllDetachesFilter(
	_id: ChangeAtomId,
	count: number,
	_rootId: ChangeAtomId | undefined,
	_endpointId?: ChangeAtomId,
): RangeQueryResult<FilterDetachResult> {
	return {
		value: { action: EditFilterStatus.Remove, shouldRemoveChild: false },
		length: count,
	};
}

export function removeAllAttachesFilter(
	_id: ChangeAtomId,
	count: number,
	_rootId: ChangeAtomId | undefined,
	_endpointId?: ChangeAtomId,
): RangeQueryResult<FilterAttachResult> {
	return { value: { action: EditFilterStatus.Remove }, length: count };
}

export function filterEdits(
	change: ModularChangeset,
	filterFieldEdits: (fieldChange: FieldChange, fieldId: FieldId) => FieldChange,
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

	const { crossFieldKeys: filteredCrossFieldKeys, nodeToParent: filteredNodeToParent } =
		makeChangesetInversions(filteredFieldChanges, filteredNodeChanges, fieldKinds);

	return pruneChangeset(
		{
			...change,
			fieldChanges: filteredFieldChanges,
			nodeChanges: filteredNodeChanges,
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
