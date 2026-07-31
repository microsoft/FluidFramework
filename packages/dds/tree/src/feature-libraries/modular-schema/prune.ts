/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKindIdentifier } from "../../core/index.js";
import { brand } from "../../util/index.js";
import { setInChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type { FieldChangeMap, NodeChangeset, NodeId } from "./modularChangeTypes.js";
import { getChangeHandler, nodeChangeFromId } from "./modularChangeUtils.js";

export function pruneFieldMap(
	changeset: FieldChangeMap | undefined,
	nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): FieldChangeMap | undefined {
	if (changeset === undefined) {
		return undefined;
	}

	const prunedChangeset: FieldChangeMap = new Map();
	for (const [field, fieldChange] of changeset) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);

		const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
			pruneNodeChange(nodeId, nodeMap, fieldKinds),
		);

		if (!handler.isEmpty(prunedFieldChangeset)) {
			prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
		}
	}

	return prunedChangeset.size > 0 ? prunedChangeset : undefined;
}

function pruneNodeChange(
	nodeId: NodeId,
	nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): NodeId | undefined {
	const changeset = nodeChangeFromId(nodeMap, nodeId);
	const prunedFields =
		changeset.fieldChanges === undefined
			? undefined
			: pruneFieldMap(changeset.fieldChanges, nodeMap, fieldKinds);

	const prunedChange = { ...changeset, fieldChanges: prunedFields };
	if (prunedChange.fieldChanges === undefined) {
		delete prunedChange.fieldChanges;
	}

	if (isEmptyNodeChangeset(prunedChange)) {
		nodeMap.delete([nodeId.revision, nodeId.localId]);
		return undefined;
	} else {
		setInChangeAtomIdMap(nodeMap, nodeId, prunedChange);
		return nodeId;
	}
}

function isEmptyNodeChangeset(change: NodeChangeset): boolean {
	return (
		change.fieldChanges === undefined &&
		change.nodeExistsConstraint === undefined &&
		change.nodeExistsConstraintOnRevert === undefined
	);
}
