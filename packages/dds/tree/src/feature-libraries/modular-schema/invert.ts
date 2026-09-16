/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	areEqualChangeAtomIds,
	newChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	offsetChangeAtomId,
	revisionMetadataSourceFromInfo,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type TreeChunk,
} from "../../core/index.js";
import {
	brand,
	idAllocatorFromMaxId,
	type IdAllocator,
	type Mutable,
	type RangeQueryResult,
} from "../../util/index.js";
import {
	newChangeAtomIdBTree,
	rangeQueryChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import type {
	FieldChange,
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
	NodeLocation,
	RootNodeTable,
} from "./modularChangeTypes.js";
import {
	addNodeRename,
	areEqualFieldIds,
	assignRootChange,
	doesChangeAttachNodes,
	fieldChangeFromId,
	firstAttachIdFromDetachId,
	firstDetachIdFromAttachId,
	getChangeHandler,
	getFirstAttachField,
	getFirstFieldForDetach,
	getRevInfoFromTaggedChanges,
	hasConflicts,
	makeCrossFieldKeyTable,
	makeModularChangeset,
	newConstraintState,
	newRootTable,
	normalizeFieldId,
	updateConstraints,
} from "./modularChangeUtils.js";
import type { FlexFieldKind } from "./fieldKind.js";
import {
	NodeMoveType,
	setInCrossFieldMap,
	type CrossFieldMap,
	type InvertNodeManager,
} from "./crossFieldQueries.js";

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
			rebaseVersion: change.change.rebaseVersion,
			maxId: change.change.maxId as number,
			revisions: revInfos,
			destroys,
		});
	}

	const genId: IdAllocator = idAllocatorFromMaxId(change.change.maxId ?? -1);

	const invertedNodeToParent: ChangeAtomIdBTree<NodeLocation> = brand(
		change.change.nodeToParent.clone(),
	);

	const crossFieldTable: InvertTable = {
		change: change.change,
		isRollback,
		entries: newChangeAtomIdRangeMap(),
		originalFieldToContext: new Map(),
		invertRevision: revisionForInvert,
		invertedNodeToParent,
		invalidatedFields: new Set(),
		invertedRoots: invertRootTable(change.change, invertedNodeToParent, isRollback),
		attachToDetachId: newChangeAtomIdTransform(),
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
			const { invertedField } = context;

			const amendedChange = getChangeHandler(fieldKinds, fieldChange.fieldKind).rebaser.invert(
				originalFieldChange,
				isRollback,
				genId,
				revisionForInvert,
				new InvertNodeManagerI(crossFieldTable, context.fieldId),
				revisionMetadata,
			);
			invertedField.change = brand(amendedChange);
		}
	}

	const crossFieldKeys = makeCrossFieldKeyTable(invertedFields, invertedNodes, fieldKinds);
	processInvertRenames(crossFieldTable);

	const constraintState = newConstraintState(0);
	updateConstraints(
		invertedFields,
		invertedNodes,
		crossFieldTable.invertedRoots,
		constraintState,
		fieldKinds,
	);

	return makeModularChangeset({
		rebaseVersion: change.change.rebaseVersion,
		fieldChanges: invertedFields,
		nodeChanges: invertedNodes,
		nodeToParent: crossFieldTable.invertedNodeToParent,
		rootNodes: crossFieldTable.invertedRoots,
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
		const manager = new InvertNodeManagerI(crossFieldTable, fieldId);
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
	const inverse: Mutable<NodeChangeset> = {};

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

function processInvertRenames(table: InvertTable): void {
	for (const {
		start: newAttachId,
		value: originalDetachId,
		length,
	} of table.attachToDetachId.entries()) {
		// Note that the detach location is already set in `invertDetach`.
		addNodeRename(table.invertedRoots, originalDetachId, newAttachId, length, undefined);
	}
}

interface InvertTable {
	change: ModularChangeset;
	isRollback: boolean;

	// Entries are keyed on attach ID
	entries: CrossFieldMap<NodeId>;
	originalFieldToContext: Map<FieldChange, InvertContext>;
	invertedNodeToParent: ChangeAtomIdBTree<NodeLocation>;
	invertRevision: RevisionTag;
	invalidatedFields: Set<FieldChange>;
	invertedRoots: RootNodeTable;

	/**
	 * Maps from attach ID in the inverted changeset to the corresponding detach ID in the base changeset.
	 */
	attachToDetachId: ChangeAtomIdRangeMap<ChangeAtomId>;
}

interface InvertContext {
	fieldId: FieldId;
	invertedField: FieldChange;
}

class InvertNodeManagerI implements InvertNodeManager {
	public constructor(
		private readonly table: InvertTable,
		private readonly fieldId: FieldId,
	) {}

	public invertDetach(
		detachId: ChangeAtomId,
		count: number,
		nodeChange: NodeId | undefined,
	): void {
		let countProcessed = count;
		const attachIdEntry = firstAttachIdFromDetachId(
			this.table.change.rootNodes,
			detachId,
			countProcessed,
		);
		countProcessed = attachIdEntry.length;

		if (nodeChange !== undefined) {
			assert(count === 1, "A node change should only affect one node");

			const attachFieldEntry = getFirstAttachField(
				this.table.change.crossFieldKeys,
				attachIdEntry.value,
				count,
			);

			if (attachFieldEntry.value === undefined) {
				assignRootChange(
					this.table.invertedRoots,
					this.table.invertedNodeToParent,
					attachIdEntry.value,
					nodeChange,
					this.fieldId,
					this.table.change.rebaseVersion,
				);
			} else {
				setInCrossFieldMap(this.table.entries, attachIdEntry.value, count, nodeChange);
				this.table.invalidatedFields.add(
					fieldChangeFromId(this.table.change, attachFieldEntry.value),
				);
			}
		}

		const newAttachId = this.getInvertedMoveId(detachId);
		const newDetachId = this.getInvertedMoveId(attachIdEntry.value);
		for (const entry of doesChangeAttachNodes(
			this.table.change.crossFieldKeys,
			attachIdEntry.value,
			countProcessed,
		)) {
			const offsetNewDetachId = offsetChangeAtomId(newDetachId, entry.offset);
			const offsetNewAttachId = offsetChangeAtomId(newAttachId, entry.offset);
			if (entry.value) {
				if (!areEqualChangeAtomIds(offsetNewDetachId, offsetNewAttachId)) {
					// We are inverting a detach is part of a move, where the detach and attach IDs of the move are different.
					// We need to create a rename from the new detach ID to the new attach ID.
					this.table.attachToDetachId.set(offsetNewAttachId, entry.length, offsetNewDetachId);
				}
			} else {
				const offsetOriginalAttachId = offsetChangeAtomId(attachIdEntry.value, entry.offset);
				if (!areEqualChangeAtomIds(offsetOriginalAttachId, offsetNewAttachId)) {
					// We are inverting a detach which is not part of a move.
					// The inverted changeset needs to have a rename from the existing root ID (`offsetOriginalAttachId`)
					// to the new attach ID (`offsetAttachId`).
					this.table.attachToDetachId.set(
						offsetNewAttachId,
						entry.length,
						offsetOriginalAttachId,
					);

					// We also need to set the detach location for the above rename.
					this.table.invertedRoots.detachLocations.set(
						offsetOriginalAttachId,
						entry.length,
						this.fieldId,
					);
				}
			}
		}
	}

	public invertAttach(
		attachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<NodeId | undefined> {
		let countToProcess = count;

		const detachIdEntry = firstDetachIdFromAttachId(
			this.table.change.rootNodes,
			attachId,
			countToProcess,
		);

		countToProcess = detachIdEntry.length;

		const detachEntry = getFirstFieldForDetach(
			this.table.change,
			detachIdEntry.value,
			countToProcess,
		);
		countToProcess = detachEntry.length;

		let result: RangeQueryResult<NodeId | undefined>;
		if (detachEntry.value === undefined) {
			// This node is detached in the input context of the original change.
			result = rangeQueryChangeAtomIdMap(
				this.table.change.rootNodes.nodeChanges,
				detachIdEntry.value,
				countToProcess,
			);
			countToProcess = result.length;

			const detachLocationEntry = this.table.change.rootNodes.detachLocations.getFirst(
				detachIdEntry.value,
				countToProcess,
			);
			countToProcess = detachLocationEntry.length;

			if (
				this.table.isRollback &&
				detachLocationEntry.value !== undefined &&
				!areEqualFieldIds(
					normalizeFieldId(detachLocationEntry.value, this.table.change.nodeAliases),
					this.fieldId,
				)
			) {
				// These nodes are detached in the input context of the original change,
				// and the change attaches these nodes in a different location from their detach location.
				// The rollback change should send them back to that prior detach location.
				this.table.invertedRoots.outputDetachLocations.set(
					detachIdEntry.value,
					countToProcess,
					detachLocationEntry.value,
				);
			}

			result = { ...result, length: countToProcess };
		} else {
			result = this.table.entries.getFirst(attachId, countToProcess);
		}

		if (result.value !== undefined) {
			setInChangeAtomIdMap(this.table.invertedNodeToParent, result.value, {
				field: this.fieldId,
			});
		}
		return result;
	}

	public getInvertedMoveId(id: ChangeAtomId): ChangeAtomId {
		return this.table.isRollback
			? id
			: { revision: this.table.invertRevision, localId: id.localId };
	}
}

function invertRootTable(
	change: ModularChangeset,
	invertedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
	isRollback: boolean,
): RootNodeTable {
	const invertedRoots: RootNodeTable = newRootTable();

	if (isRollback) {
		// We only invert renames of nodes which are not attached or detached by this changeset.
		// When we invert an attach we will create a detach which incorporates the rename.
		for (const {
			start: oldId,
			value: newId,
			length,
		} of change.rootNodes.oldToNewId.entries()) {
			invertRename(change, invertedRoots, oldId, newId, length);
		}
	}

	for (const [[revision, localId], nodeId] of change.rootNodes.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision, localId };
		const renamedId = firstAttachIdFromDetachId(change.rootNodes, detachId, 1).value;

		// This checks whether `change` attaches this node.
		// If it does, the node is not detached in the input context of the inverse, and so should not be included in the root table.
		if (
			change.crossFieldKeys.getFirst({ ...renamedId, target: NodeMoveType.Attach }, 1)
				.value === undefined
		) {
			assignRootChange(
				invertedRoots,
				invertedNodeToParent,
				renamedId,
				nodeId,
				change.rootNodes.detachLocations.getFirst(detachId, 1).value,
				change.rebaseVersion,
			);
		}
	}

	return invertedRoots;
}

function invertRename(
	change: ModularChangeset,
	invertedRoots: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	length: number,
): void {
	let countProcessed = length;
	const outputDetachEntry = change.rootNodes.outputDetachLocations.getFirst(
		newId,
		countProcessed,
	);
	countProcessed = outputDetachEntry.length;

	const inputDetachEntry = change.rootNodes.detachLocations.getFirst(oldId, countProcessed);
	countProcessed = inputDetachEntry.length;

	const attachEntry = getFirstAttachField(change.crossFieldKeys, newId, countProcessed);
	countProcessed = attachEntry.length;
	if (
		attachEntry.value === undefined &&
		outputDetachEntry.value !== undefined &&
		inputDetachEntry.value !== undefined
	) {
		// The original change moves the detached node, so the inverse should also record a move back to the original location.
		invertedRoots.outputDetachLocations.set(oldId, countProcessed, inputDetachEntry.value);
	}

	// If the node is attached by `change`, then it is attached in the input context of the inverse,
	// so it should not have a detach location.
	const detachLocation = attachEntry.value === undefined ? outputDetachEntry.value : undefined;
	addNodeRename(invertedRoots, newId, oldId, countProcessed, detachLocation);

	if (countProcessed < length) {
		invertRename(
			change,
			invertedRoots,
			offsetChangeAtomId(oldId, countProcessed),
			offsetChangeAtomId(newId, countProcessed),
			length - countProcessed,
		);
	}
}

function invertBuilds(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
): ChangeAtomIdBTree<number> | undefined {
	if (builds !== undefined) {
		return brand(builds.mapValues((chunk) => chunk.topLevelLength));
	}
	return undefined;
}
