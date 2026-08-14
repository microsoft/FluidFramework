/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import {
	revisionMetadataSourceFromInfo,
	type ChangeAtomId,
	type ChangesetLocalId,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type TreeChunk,
} from "../../core/index.js";
import { brand, idAllocatorFromMaxId, type IdAllocator } from "../../util/index.js";
import {
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import {
	newCrossFieldKeyTable,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldChangeMap,
	type FieldId,
	type ModularChangeset,
	type NodeChangeset,
	type NodeId,
} from "./modularChangeTypes.js";
import {
	CrossFieldManagerI,
	getChangeHandler,
	getRevInfoFromTaggedChanges,
	hasConflicts,
	makeModularChangeset,
	newConstraintState,
	newCrossFieldTable,
	updateConstraintsForFields,
	type CrossFieldTable,
} from "./modularChangeUtils.js";
import type { CrossFieldTarget } from "./crossFieldQueries.js";
import type { FlexFieldKind } from "./fieldKind.js";
import { NodeAttachState } from "./fieldChangeHandler.js";

/**
 * @param change - The change to invert.
 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
 * performing a sandwich rebase.
 * @param revisionForInvert - The revision for the invert changeset.
 */
export function invertModularChange(
	change: TaggedChange<ModularChangeset>,
	isRollback: boolean,
	revisionForInvert: RevisionTag,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	// Rollback changesets destroy the nodes created by the change being rolled back.
	const destroys = isRollback ? invertBuilds(change.change.builds) : undefined;

	// Destroys only occur in rollback changesets, which are never inverted.
	assert(
		change.change.destroys === undefined,
		0x89a /* Unexpected destroys in change to invert */,
	);

	const revInfos: RevisionInfo[] = isRollback
		? [{ revision: revisionForInvert, rollbackOf: change.revision }]
		: [{ revision: revisionForInvert }];

	const noChangeConstraint = change.change.noChangeConstraintOnRevert;
	const noChangeConstraintOnRevert = change.change.noChangeConstraint;

	if (hasConflicts(change.change)) {
		return makeModularChangeset({
			maxId: change.change.maxId as number,
			revisions: revInfos,
			destroys,
		});
	}

	const genId: IdAllocator = idAllocatorFromMaxId(change.change.maxId ?? -1);

	const crossFieldTable: InvertTable = {
		...newCrossFieldTable<FieldChange>(),
		originalFieldToContext: new Map(),
		invertedNodeToParent: brand(change.change.nodeToParent.clone()),
	};
	const { revInfos: oldRevInfos } = getRevInfoFromTaggedChanges([change]);
	const revisionMetadata = revisionMetadataSourceFromInfo(oldRevInfos);

	const invertedFields = invertFieldMap(
		change.change.fieldChanges,
		undefined,
		isRollback,
		genId,
		crossFieldTable,
		revisionMetadata,
		revisionForInvert,
		fieldKinds,
	);

	const invertedNodes = newChangeAtomIdBTree<NodeChangeset>();
	change.change.nodeChanges.forEachPair(([revision, localId], nodeChangeset) => {
		invertedNodes.set(
			[revision, localId],
			invertNodeChange(
				nodeChangeset,
				{ revision, localId },
				isRollback,
				genId,
				crossFieldTable,
				revisionMetadata,
				revisionForInvert,
				fieldKinds,
			),
		);
	});

	if (crossFieldTable.invalidatedFields.size > 0) {
		const fieldsToUpdate = crossFieldTable.invalidatedFields;
		crossFieldTable.invalidatedFields = new Set();
		for (const fieldChange of fieldsToUpdate) {
			const originalFieldChange = fieldChange.change;
			const context = crossFieldTable.originalFieldToContext.get(fieldChange);
			assert(
				context !== undefined,
				0x851 /* Should have context for every invalidated field */,
			);
			const { invertedField, fieldId } = context;

			const amendedChange = getChangeHandler(fieldKinds, fieldChange.fieldKind).rebaser.invert(
				originalFieldChange,
				isRollback,
				genId,
				revisionForInvert,
				new InvertManager(crossFieldTable, fieldChange, fieldId),
				revisionMetadata,
			);
			invertedField.change = brand(amendedChange);
		}
	}

	const crossFieldKeys = makeCrossFieldKeyTable(invertedFields, invertedNodes, fieldKinds);

	const constraintState = newConstraintState(0);
	updateConstraintsForFields(
		invertedFields,
		NodeAttachState.Attached,
		constraintState,
		invertedNodes,
		fieldKinds,
	);

	return makeModularChangeset({
		fieldChanges: invertedFields,
		nodeChanges: invertedNodes,
		nodeToParent: crossFieldTable.invertedNodeToParent,
		nodeAliases: change.change.nodeAliases,
		crossFieldKeys,
		maxId: genId.getMaxId(),
		revisions: revInfos,
		constraintViolationCount: constraintState.violationCount,
		noChangeConstraint,
		noChangeConstraintOnRevert,
		destroys,
	});
}

function invertFieldMap(
	changes: FieldChangeMap,
	parentId: NodeId | undefined,
	isRollback: boolean,
	genId: IdAllocator,
	crossFieldTable: InvertTable,
	revisionMetadata: RevisionMetadataSource,
	revisionForInvert: RevisionTag,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): FieldChangeMap {
	const invertedFields: FieldChangeMap = new Map();

	for (const [field, fieldChange] of changes) {
		const fieldId = { nodeId: parentId, field };
		const manager = new InvertManager(crossFieldTable, fieldChange, fieldId);
		const invertedChange = getChangeHandler(fieldKinds, fieldChange.fieldKind).rebaser.invert(
			fieldChange.change,
			isRollback,
			genId,
			revisionForInvert,
			manager,
			revisionMetadata,
		);

		const invertedFieldChange: FieldChange = {
			...fieldChange,
			change: brand(invertedChange),
		};
		invertedFields.set(field, invertedFieldChange);

		crossFieldTable.originalFieldToContext.set(fieldChange, {
			fieldId,
			invertedField: invertedFieldChange,
		});
	}

	return invertedFields;
}

function invertNodeChange(
	change: NodeChangeset,
	id: NodeId,
	isRollback: boolean,
	genId: IdAllocator,
	crossFieldTable: InvertTable,
	revisionMetadata: RevisionMetadataSource,
	revisionForInvert: RevisionTag,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): NodeChangeset {
	const inverse: NodeChangeset = {};

	// If the node has a constraint, it should be inverted to a node-exist-on-revert constraint. This ensure that if
	// the inverse is inverted again, the original input constraint will be restored.
	if (change.nodeExistsConstraint !== undefined) {
		inverse.nodeExistsConstraintOnRevert = change.nodeExistsConstraint;
	}

	// The node-exist-on-revert constraint of a node is the constraint that should apply when the a change is reverted.
	// So, it should become the constraint in the inverse. If this constraint is violated when applying the inverse,
	// it will be discarded.
	if (change.nodeExistsConstraintOnRevert !== undefined) {
		inverse.nodeExistsConstraint = change.nodeExistsConstraintOnRevert;
	}

	if (change.fieldChanges !== undefined) {
		inverse.fieldChanges = invertFieldMap(
			change.fieldChanges,
			id,
			isRollback,
			genId,
			crossFieldTable,
			revisionMetadata,
			revisionForInvert,
			fieldKinds,
		);
	}

	return inverse;
}

function invertBuilds(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
): ChangeAtomIdBTree<number> | undefined {
	if (builds !== undefined) {
		return brand(builds.mapValues((chunk) => chunk.topLevelLength));
	}
	return undefined;
}

interface InvertTable extends CrossFieldTable<FieldChange> {
	originalFieldToContext: Map<FieldChange, InvertContext>;
	invertedNodeToParent: ChangeAtomIdBTree<FieldId>;
}

interface InvertContext {
	fieldId: FieldId;
	invertedField: FieldChange;
}

class InvertManager extends CrossFieldManagerI<FieldChange> {
	public constructor(
		table: InvertTable,
		field: FieldChange,
		private readonly fieldId: FieldId,
		allowInval = true,
	) {
		super(table, field, allowInval);
	}

	public override onMoveIn(id: ChangeAtomId): void {
		setInChangeAtomIdMap(this.table.invertedNodeToParent, id, this.fieldId);
	}

	public override moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {
		fail(0x9c5 /* Keys should not be moved manually during invert */);
	}

	private get table(): InvertTable {
		return this.crossFieldTable as InvertTable;
	}
}

function makeCrossFieldKeyTable(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): CrossFieldKeyTable {
	const keys: CrossFieldKeyTable = newCrossFieldKeyTable();
	populateCrossFieldKeyTableForFieldMap(keys, fields, undefined, fieldKinds);
	nodes.forEachPair(([revision, localId], node) => {
		if (node.fieldChanges !== undefined) {
			populateCrossFieldKeyTableForFieldMap(
				keys,
				node.fieldChanges,
				{
					revision,
					localId,
				},
				fieldKinds,
			);
		}
	});

	return keys;
}

function populateCrossFieldKeyTableForFieldMap(
	table: CrossFieldKeyTable,
	fields: FieldChangeMap,
	parent: NodeId | undefined,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	for (const [fieldKey, fieldChange] of fields) {
		const keys = getChangeHandler(fieldKinds, fieldChange.fieldKind).getCrossFieldKeys(
			fieldChange.change,
		);
		for (const { key, count } of keys) {
			table.set(key, count, { nodeId: parent, field: fieldKey });
		}
	}
}
