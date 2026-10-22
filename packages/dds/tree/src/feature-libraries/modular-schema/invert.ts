/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
	revisionMetadataSourceFromInfo,
	type ChangeAtomId,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type TreeChunk,
} from "../../core/index.js";
import { brand, hasSingle, type Mutable, type RangeQueryResult } from "../../util/index.js";
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
	fieldChangeFromId,
	firstAttachIdFromDetachId,
	firstDetachIdFromAttachId,
	getChangeHandler,
	getFirstAttachField,
	getFirstDetachField,
	getFirstFieldForDetach,
	getNewRootIdFromOldRootId,
	getRevInfoFromTaggedChanges,
	hasConflicts,
	makeCrossFieldKeyTable,
	makeModularChangeset,
	newConstraintState,
	newRootTable,
	normalizeFieldId,
	updateConstraints,
	validateChangeset,
} from "./modularChangeUtils.js";
import type { FlexFieldKind } from "./fieldKind.js";
import {
	NodeMoveType,
	setInCrossFieldMap,
	type CrossFieldMap,
	type InvertNodeManager,
} from "./crossFieldQueries.js";
import type { AtomIdAliasAllocator } from "./fieldChangeHandler.js";
import { DefaultAtomIdAliasAllocator } from "./defaultAtomIdAliasAllocator.js";

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

	const revInfos: readonly RevisionInfo[] = isRollback
		? getRevInfosForRollback(change.change.revisions ?? [], revisionForInvert)
		: [{ revision: revisionForInvert }];

	const [noChangeConstraint, noChangeConstraintOnRevert] = isRollback
		? // Rollbacks are not subject to constraints
			[undefined, undefined]
		: [change.change.noChangeConstraintOnRevert, change.change.noChangeConstraint];

	if (hasConflicts(change.change)) {
		return makeModularChangeset({
			rebaseVersion: change.change.rebaseVersion,
			maxId: change.change.maxId as number,
			revisions: revInfos,
			destroys,
		});
	}

	const genId = new DefaultAtomIdAliasAllocator();
	const { revInfos: oldRevInfos } = getRevInfoFromTaggedChanges([change]);
	const revisionMetadata = revisionMetadataSourceFromInfo(oldRevInfos);

	if (change.change.maxId !== undefined) {
		for (const { revision } of oldRevInfos) {
			genId.reserve(revision, change.change.maxId);
		}
	}

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
		genId,
		invertedRoots: invertRootTable(
			change.change,
			invertedNodeToParent,
			isRollback,
			revisionForInvert,
			genId,
		),
	};

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

	const constraintState = newConstraintState(0);
	// Rollbacks are not subject to constraints
	if (!isRollback) {
		updateConstraints(
			invertedFields,
			invertedNodes,
			crossFieldTable.invertedRoots,
			constraintState,
			fieldKinds,
		);
	}

	const inverted = makeModularChangeset({
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

	validateChangeset(inverted, fieldKinds);
	return inverted;
}

function invertFieldMap(
	changes: FieldChangeMap,
	parentId: NodeId | undefined,
	isRollback: boolean,
	genId: AtomIdAliasAllocator,
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
	genId: AtomIdAliasAllocator,
	crossFieldTable: InvertTable,
	revisionMetadata: RevisionMetadataSource,
	revisionForInvert: RevisionTag,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): NodeChangeset {
	const inverse: Mutable<NodeChangeset> = {};

	// Rollbacks are not subject to constraints
	if (!isRollback) {
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
	genId: AtomIdAliasAllocator;
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
		return getInvertedMoveId(
			id,
			this.table.invertRevision,
			this.table.isRollback,
			this.table.genId,
		);
	}
}

function getInvertedMoveId(
	id: ChangeAtomId,
	invertRevision: RevisionTag,
	isRollback: boolean,
	genId: AtomIdAliasAllocator,
): ChangeAtomId {
	return isRollback
		? id
		: { revision: invertRevision, localId: genId.getAlias(id.revision, id.localId) };
}

function invertRootTable(
	change: ModularChangeset,
	invertedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
	isRollback: boolean,
	revisionForInverse: RevisionTag,
	genId: AtomIdAliasAllocator,
): RootNodeTable {
	const invertedRoots: RootNodeTable = newRootTable();

	if (isRollback) {
		invertRenamesForRollback(change, invertedRoots);
	} else {
		invertRenamesForRevert(change, revisionForInverse, invertedRoots, genId);
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

function invertRenamesForRevert(
	change: ModularChangeset,
	revisionForInverse: RevisionTag,
	invertedRoots: RootNodeTable,
	genId: AtomIdAliasAllocator,
): void {
	for (const {
		start: crossFieldKey,
		value: field,
		length,
	} of change.crossFieldKeys.entries()) {
		if (crossFieldKey.target === NodeMoveType.Detach) {
			addRenameForAttachInInverse(
				change,
				revisionForInverse,
				{ revision: crossFieldKey.revision, localId: crossFieldKey.localId },
				field,
				length,
				invertedRoots,
				genId,
			);
		}
	}
}

/**
 * Adds a rename to `invertedRoots` for the nodes moved by `originalDetachId`.
 */
function addRenameForAttachInInverse(
	change: ModularChangeset,
	invertRevision: RevisionTag,
	originalDetachId: ChangeAtomId,
	originalDetachField: FieldId,
	count: number,
	invertedRoots: RootNodeTable,
	genId: AtomIdAliasAllocator,
): void {
	let countProcessed = count;
	const originalAttachIdEntry = getNewRootIdFromOldRootId(
		change.rootNodes,
		originalDetachId,
		count,
	);
	countProcessed = originalAttachIdEntry.length;

	const originalAttachEntry = getFirstAttachField(
		change.crossFieldKeys,
		originalAttachIdEntry.value,
		countProcessed,
	);
	countProcessed = originalAttachEntry.length;

	const invertedAttachId = getInvertedMoveId(originalDetachId, invertRevision, false, genId);
	if (originalAttachEntry.value === undefined) {
		const outputDetachLocationEntry = change.rootNodes.outputDetachLocations.getFirst(
			originalAttachIdEntry.value,
			countProcessed,
		);
		countProcessed = outputDetachLocationEntry.length;

		// The original change had a detach and no reattach,
		// so the inverse will have only an attach reviving the node.
		// The inverse needs a rename from the original output ID to the inverse attach ID.
		const detachLocation = outputDetachLocationEntry.value ?? originalDetachField;
		addNodeRename(
			invertedRoots,
			originalAttachIdEntry.value,
			invertedAttachId,
			countProcessed,
			detachLocation,
		);
	} else {
		// The nodes are moved (in both the original and inverse change).
		// The inverse should have a rename from the inverse's detach ID to the inverse's attach ID,
		// if they are not the same.
		const invertedDetachId = getInvertedMoveId(
			originalAttachIdEntry.value,
			invertRevision,
			false,
			genId,
		);

		addNodeRename(
			invertedRoots,
			invertedDetachId,
			invertedAttachId,
			countProcessed,
			undefined,
		);
	}

	const countRemaining = count - countProcessed;
	if (countRemaining > 0) {
		addRenameForAttachInInverse(
			change,
			invertRevision,
			offsetChangeAtomId(originalDetachId, countProcessed),
			originalDetachField,
			countRemaining,
			invertedRoots,
			genId,
		);
	}
}

function invertRenamesForRollback(
	change: ModularChangeset,
	invertedRoots: RootNodeTable,
): void {
	for (const { start: oldId, value: newId, length } of change.rootNodes.oldToNewId.entries()) {
		invertRename(change, invertedRoots, oldId, newId, length);
	}
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

	const detachEntry = getFirstDetachField(change.crossFieldKeys, oldId, countProcessed);
	const locationWhileDetached =
		outputDetachEntry.value ?? detachEntry.value ?? inputDetachEntry.value;

	// If the node is attached by `change`, then it is attached in the input context of the inverse,
	// so it should not have a detach location.
	const detachLocation = attachEntry.value === undefined ? locationWhileDetached : undefined;
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

function getRevInfosForRollback(
	revisions: readonly RevisionInfo[],
	revisionForInvert: RevisionTag,
): readonly RevisionInfo[] {
	assert(hasSingle(revisions), "Can only roll back a single revision at a time");
	return [{ revision: revisionForInvert, rollbackOf: revisions[0].revision }];
}
