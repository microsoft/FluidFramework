/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type ChangesetLocalId,
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaRoot,
	EditBuilder,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	makeDetachedNodeId,
	replaceAtomRevisions,
	revisionMetadataSourceFromInfo,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	areEqualChangeAtomIdOpts,
	tagChange,
	makeAnonChange,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeRename,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
	type ChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	subtractChangeAtomIds,
	makeChangeAtomId,
	type NormalizedFieldUpPath,
	type NormalizedUpPath,
	isDetachedUpPathRoot,
} from "../../core/index.js";
import {
	type IdAllocationState,
	type IdAllocator,
	type Mutable,
	brand,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	type RangeQueryResult,
	getOrCreate,
	newTupleBTree,
	mergeTupleBTrees,
	type TupleBTree,
	RangeMap,
	balancedReduce,
	type RangeQueryEntry,
} from "../../util/index.js";
import type { TreeChunk } from "../chunked-forest/index.js";

import {
	type ComposeNodeManager,
	type CrossFieldMap,
	CrossFieldTarget,
	type DetachedNodeEntry,
	type InvertNodeManager,
	type RebaseNodeManager,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
import {
	type ContextualizedFieldChange,
	type FieldChangeHandler,
	NodeAttachState,
	type RebaseRevisionMetadata,
} from "./fieldChangeHandler.js";
import { type FieldKindWithEditor, withEditor } from "./fieldKindWithEditor.js";
import { convertGenericChange, genericFieldKind } from "./genericFieldKind.js";
import type { GenericChangeset } from "./genericFieldKindTypes.js";
import {
	type ChangeAtomIdBTree,
	type CrossFieldKey,
	type CrossFieldKeyRange,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldChangeMap,
	type FieldChangeset,
	type FieldId,
	type ModularChangeset,
	newCrossFieldRangeTable,
	type NodeChangeset,
	type NodeId,
	type NodeLocation,
	type RootNodeTable,
} from "./modularChangeTypes.js";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 */
export class ModularChangeFamily
	implements
		ChangeFamily<ModularEditBuilder, ModularChangeset>,
		ChangeRebaser<ModularChangeset>
{
	public static readonly emptyChange: ModularChangeset = makeModularChangeset();

	public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>;

	public constructor(
		fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		public readonly codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>,
	) {
		this.fieldKinds = fieldKinds;
	}

	public get rebaser(): ChangeRebaser<ModularChangeset> {
		return this;
	}

	/**
	 * Produces an equivalent list of `FieldChangeset`s that all target the same {@link FlexFieldKind}.
	 * @param changes - The list of `FieldChange`s whose `FieldChangeset`s needs to be normalized.
	 * @returns An object that contains both the equivalent list of `FieldChangeset`s that all
	 * target the same {@link FlexFieldKind}, and the `FieldKind` that they target.
	 * The returned `FieldChangeset`s may be a shallow copy of the input `FieldChange`s.
	 */
	private normalizeFieldChanges(
		change1: FieldChange,
		change2: FieldChange,
	): {
		fieldKind: FieldKindIdentifier;
		changeHandler: FieldChangeHandler<unknown>;
		change1: FieldChangeset;
		change2: FieldChangeset;
	} {
		// TODO: Handle the case where changes have conflicting field kinds
		const kind =
			change1.fieldKind !== genericFieldKind.identifier
				? change1.fieldKind
				: change2.fieldKind;

		if (kind === genericFieldKind.identifier) {
			// Both changes are generic
			return {
				fieldKind: genericFieldKind.identifier,
				changeHandler: genericFieldKind.changeHandler,
				change1: change1.change,
				change2: change2.change,
			};
		}
		const fieldKind = getFieldKind(this.fieldKinds, kind);
		const changeHandler = fieldKind.changeHandler;
		const normalizedChange1 = this.normalizeFieldChange(change1, changeHandler);
		const normalizedChange2 = this.normalizeFieldChange(change2, changeHandler);
		return {
			fieldKind: kind,
			changeHandler,
			change1: normalizedChange1,
			change2: normalizedChange2,
		};
	}

	private normalizeFieldChange<T>(
		fieldChange: FieldChange,
		handler: FieldChangeHandler<T>,
	): FieldChangeset {
		if (fieldChange.fieldKind !== genericFieldKind.identifier) {
			return fieldChange.change;
		}

		// The cast is based on the `fieldKind` check above
		const genericChange = fieldChange.change as unknown as GenericChangeset;
		const convertedChange = convertGenericChange(genericChange, handler) as FieldChangeset;

		return convertedChange;
	}

	public compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		const { revInfos, maxId } = getRevInfoFromTaggedChanges(changes);
		const idState: IdAllocationState = { maxId };

		const pairwiseDelegate = (
			left: ModularChangeset,
			right: ModularChangeset,
		): ModularChangeset => {
			return this.composePair(left, right, revInfos, idState);
		};

		const innerChanges = changes.map((change) => change.change);
		return balancedReduce(innerChanges, pairwiseDelegate, makeModularChangeset);
	}

	private composePair(
		change1: ModularChangeset,
		change2: ModularChangeset,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangeset {
		const { fieldChanges, nodeChanges, nodeToParent, nodeAliases, crossFieldKeys, rootNodes } =
			this.composeAllFields(change1, change2, revInfos, idState);

		const { allBuilds, allDestroys, allRefreshers } = composeBuildsDestroysAndRefreshers(
			change1,
			change2,
		);

		return makeModularChangeset({
			fieldChanges,
			nodeChanges,
			nodeToParent,
			nodeAliases,
			crossFieldKeys,
			maxId: idState.maxId,
			revisions: revInfos,
			rootNodes,
			builds: allBuilds,
			destroys: allDestroys,
			refreshers: allRefreshers,
		});
	}

	private composeAllFields(
		change1: ModularChangeset,
		change2: ModularChangeset,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangesetContent {
		if (hasConflicts(change1) && hasConflicts(change2)) {
			return {
				fieldChanges: new Map(),
				nodeChanges: newTupleBTree(),
				nodeToParent: newTupleBTree(),
				nodeAliases: newTupleBTree(),
				crossFieldKeys: newCrossFieldRangeTable(),
				rootNodes: newRootTable(),
			};
		} else if (hasConflicts(change1)) {
			return change2;
		} else if (hasConflicts(change2)) {
			return change1;
		}

		const genId: IdAllocator = idAllocatorFromState(idState);
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);

		// We merge nodeChanges, nodeToParent, and nodeAliases from the two changesets.
		// The merged tables will have correct entries for all nodes which are only referenced in one of the input changesets.
		// During composeFieldMaps and composeInvalidatedElements we will find all nodes referenced in both input changesets
		// and adjust these tables as necessary.
		// Note that when merging these tables we may encounter key collisions and will arbitrarily drop values in that case.
		// A collision for a node ID means that that node is referenced in both changesets
		// (since we assume that if two changesets use the same node ID they are referring to the same node),
		// therefore all collisions will be addressed when processing the intersection of the changesets.
		const composedNodeChanges: ChangeAtomIdBTree<NodeChangeset> = brand(
			mergeTupleBTrees(change1.nodeChanges, change2.nodeChanges),
		);

		const composedNodeToParent: ChangeAtomIdBTree<NodeLocation> = brand(
			mergeTupleBTrees(change1.nodeToParent, change2.nodeToParent),
		);
		const composedNodeAliases: ChangeAtomIdBTree<NodeId> = brand(
			mergeTupleBTrees(change1.nodeAliases, change2.nodeAliases),
		);

		const pendingCompositions: PendingCompositions = {
			nodeIdsToCompose: [],
			affectedBaseFields: newTupleBTree(),
		};

		const composedRoots = composeRootTables(change1, change2, pendingCompositions);

		const composedCrossFieldKeys = RangeMap.union(
			change1.crossFieldKeys,
			change2.crossFieldKeys,
		);

		const crossFieldTable = newComposeTable(
			change1,
			change2,
			composedRoots,
			composedCrossFieldKeys,
			pendingCompositions,
		);

		const composedFields = this.composeFieldMaps(
			change1.fieldChanges,
			change2.fieldChanges,
			undefined,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		this.composeInvalidatedElements(
			crossFieldTable,
			composedFields,
			composedNodeChanges,
			composedNodeToParent,
			composedNodeAliases,
			genId,
			revisionMetadata,
		);

		for (const entry of crossFieldTable.renamesToDelete.entries()) {
			deleteNodeRename(crossFieldTable.composedRootNodes, entry.start, entry.length);
		}

		for (const [nodeId, location] of crossFieldTable.movedNodeToParent.entries()) {
			// Moved nodes are from change2.
			// If there is a corresponding node in change1, then composedNodeToParent will already have the correct entry,
			// because the location of the node is the same in change1 and the composed change
			// (since they have the same input context).
			if (crossFieldTable.newToBaseNodeId.get(nodeId) === undefined) {
				composedNodeToParent.set(nodeId, location);
			}
		}

		return {
			fieldChanges: composedFields,
			nodeChanges: composedNodeChanges,
			nodeToParent: composedNodeToParent,
			nodeAliases: composedNodeAliases,
			crossFieldKeys: composedCrossFieldKeys,
			rootNodes: composedRoots,
		};
	}

	private composeInvalidatedField(
		fieldChange: FieldChange,
		crossFieldTable: ComposeTable,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const context = crossFieldTable.fieldToContext.get(fieldChange);
		assert(context !== undefined, 0x8cc /* Should have context for every invalidated field */);
		const { change1: fieldChange1, change2: fieldChange2, composedChange } = context;

		crossFieldTable.pendingCompositions.affectedBaseFields.delete(
			fieldIdKeyFromFieldId(context.fieldId),
		);

		const rebaser = getChangeHandler(this.fieldKinds, composedChange.fieldKind).rebaser;
		const composeNodes = (child1: NodeId | undefined, child2: NodeId | undefined): NodeId => {
			if (
				child1 !== undefined &&
				child2 !== undefined &&
				getFromChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2) === undefined
			) {
				setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
				crossFieldTable.pendingCompositions.nodeIdsToCompose.push([child1, child2]);
			}

			return child1 ?? child2 ?? fail(0xb22 /* Should not compose two undefined nodes */);
		};

		const contextualizedFieldChange1 = contextualizeFieldChangeset(
			fieldChange1,
			crossFieldTable.baseChange,
		);
		const contextualizedFieldChange2 = contextualizeFieldChangeset(
			fieldChange2,
			crossFieldTable.newChange,
		);
		const amendedChange = rebaser.compose(
			contextualizedFieldChange1,
			contextualizedFieldChange2,
			composeNodes,
			genId,
			new ComposeNodeManagerI(crossFieldTable, context.fieldId, false),
			revisionMetadata,
		);
		composedChange.change = brand(amendedChange);
	}

	/**
	 * Updates everything in the composed output which may no longer be valid.
	 * This could be due to
	 * - discovering that two node changesets refer to the same node (`nodeIdsToCompose`)
	 * - a previously composed field being invalidated by a cross field effect (`invalidatedFields`)
	 * - a field which was copied directly from an input changeset being invalidated by a cross field effect
	 * (`affectedBaseFields`)
	 *
	 * Updating an element may invalidate further elements. This function runs until there is no more invalidation.
	 */
	private composeInvalidatedElements(
		table: ComposeTable,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const pending = table.pendingCompositions;
		while (pending.nodeIdsToCompose.length > 0 || pending.affectedBaseFields.length > 0) {
			this.processPendingNodeCompositions(
				table,
				composedNodes,
				composedNodeToParent,
				nodeAliases,
				genId,
				metadata,
			);

			this.composeAffectedFields(
				table,
				table.baseChange,
				pending.affectedBaseFields,
				composedFields,
				composedNodes,
				genId,
				metadata,
			);
		}
	}

	private processPendingNodeCompositions(
		table: ComposeTable,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		// Note that the call to `composeNodesById` can add entries to `crossFieldTable.nodeIdPairs`.
		for (const [id1, id2] of table.pendingCompositions.nodeIdsToCompose) {
			this.composeNodesById(
				table.baseChange.nodeChanges,
				table.newChange.nodeChanges,
				composedNodes,
				composedNodeToParent,
				nodeAliases,
				id1,
				id2,
				genId,
				table,
				metadata,
			);
		}

		table.pendingCompositions.nodeIdsToCompose.length = 0;
	}

	/**
	 * Ensures that each field in `affectedFields` has been updated in the composition output.
	 * Any field which has already been composed is ignored.
	 * All other fields are optimistically assumed to not have any changes in the other input changeset.
	 *
	 * @param change - The changeset which contains the affected fields.
	 * This should be one of the two changesets being composed.
	 * @param areBaseFields - Whether the affected fields are part of the base changeset.
	 * If not, they are assumed to be part of the new changeset.
	 * @param affectedFields - The set of fields to process.
	 */
	private composeAffectedFields(
		table: ComposeTable,
		change: ModularChangeset,
		affectedFields: BTree<FieldIdKey, true>,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const fieldsToProcess = affectedFields.clone();
		affectedFields.clear();

		for (const fieldIdKey of fieldsToProcess.keys()) {
			const fieldId = fieldIdFromFieldIdKey(fieldIdKey);
			const fieldChange = fieldChangeFromId(change, fieldId);

			if (
				table.fieldToContext.has(fieldChange) ||
				table.newFieldToBaseField.has(fieldChange)
			) {
				this.composeInvalidatedField(fieldChange, table, genId, metadata);
			} else {
				this.composeFieldWithNoNewChange(
					table,
					fieldChange,
					fieldId,
					composedFields,
					composedNodes,
					genId,
					metadata,
				);
			}
		}
	}

	private composeFieldWithNoNewChange(
		table: ComposeTable,
		baseFieldChange: FieldChange,
		fieldId: FieldId,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const emptyChange = this.createEmptyFieldChange(baseFieldChange.fieldKind);

		const composedField = this.composeFieldChanges(
			fieldId,
			baseFieldChange,
			emptyChange,
			genId,
			table,
			metadata,
		);

		if (fieldId.nodeId === undefined) {
			composedFields.set(fieldId.field, composedField);
			return;
		}

		const nodeId =
			getFromChangeAtomIdMap(table.newToBaseNodeId, fieldId.nodeId) ?? fieldId.nodeId;

		let nodeChangeset = nodeChangeFromId(composedNodes, nodeId);
		if (!table.composedNodes.has(nodeChangeset)) {
			nodeChangeset = cloneNodeChangeset(nodeChangeset);
			setInChangeAtomIdMap(composedNodes, nodeId, nodeChangeset);
		}

		if (nodeChangeset.fieldChanges === undefined) {
			nodeChangeset.fieldChanges = new Map();
		}

		nodeChangeset.fieldChanges.set(fieldId.field, composedField);
	}

	private composeFieldMaps(
		change1: FieldChangeMap | undefined,
		change2: FieldChangeMap | undefined,
		parentId: NodeId | undefined,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const composedFields: FieldChangeMap = new Map();
		if (change1 === undefined || change2 === undefined) {
			return change1 ?? change2 ?? composedFields;
		}

		for (const [field, fieldChange1] of change1) {
			const fieldId: FieldId = { nodeId: parentId, field };
			const fieldChange2 = change2.get(field);
			const composedField =
				fieldChange2 !== undefined
					? this.composeFieldChanges(
							fieldId,
							fieldChange1,
							fieldChange2,
							genId,
							crossFieldTable,
							revisionMetadata,
						)
					: fieldChange1;

			composedFields.set(field, composedField);
		}

		for (const [field, fieldChange2] of change2) {
			if (change1 === undefined || !change1.has(field)) {
				composedFields.set(field, fieldChange2);
			}
		}

		return composedFields;
	}

	/**
	 * Returns the composition of the two input fields.
	 *
	 * Any nodes in this field which were modified by both changesets
	 * will be added to `crossFieldTable.pendingCompositions.nodeIdsToCompose`.
	 *
	 * Any fields which had cross-field information sent to them as part of this field composition
	 * will be added to `affectedBaseFields` in `crossFieldTable.pendingCompositions`.
	 *
	 * Any composed `FieldChange` which is invalidated by new cross-field information will be added to `crossFieldTable.invalidatedFields`.
	 */
	private composeFieldChanges(
		fieldId: FieldId,
		change1: FieldChange,
		change2: FieldChange,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChange {
		const {
			fieldKind,
			changeHandler,
			change1: change1Normalized,
			change2: change2Normalized,
		} = this.normalizeFieldChanges(change1, change2);

		const manager = new ComposeNodeManagerI(crossFieldTable, fieldId);

		const composedChange = changeHandler.rebaser.compose(
			contextualizeFieldChangeset(change1Normalized, crossFieldTable.baseChange),
			contextualizeFieldChangeset(change2Normalized, crossFieldTable.newChange),
			(child1, child2) => {
				if (child1 !== undefined && child2 !== undefined) {
					setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
					crossFieldTable.pendingCompositions.nodeIdsToCompose.push([child1, child2]);
				}
				return child1 ?? child2 ?? fail(0xb23 /* Should not compose two undefined nodes */);
			},
			idAllocator,
			manager,
			revisionMetadata,
		);

		const composedField: FieldChange = {
			fieldKind,
			change: brand(composedChange),
		};

		crossFieldTable.fieldToContext.set(change1, {
			fieldId,
			change1: change1Normalized,
			change2: change2Normalized,
			composedChange: composedField,
		});

		crossFieldTable.newFieldToBaseField.set(change2, change1);
		return composedField;
	}

	private composeNodesById(
		nodeChanges1: ChangeAtomIdBTree<NodeChangeset>,
		nodeChanges2: ChangeAtomIdBTree<NodeChangeset>,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		id1: NodeId,
		id2: NodeId,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const nodeChangeset1 = nodeChangeFromId(nodeChanges1, id1);
		const nodeChangeset2 = nodeChangeFromId(nodeChanges2, id2);
		const composedNodeChangeset = this.composeNodeChanges(
			id1,
			nodeChangeset1,
			nodeChangeset2,
			idAllocator,
			crossFieldTable,
			revisionMetadata,
		);

		setInChangeAtomIdMap(composedNodes, id1, composedNodeChangeset);

		if (!areEqualChangeAtomIds(id1, id2)) {
			composedNodes.delete([id2.revision, id2.localId]);
			composedNodeToParent.delete([id2.revision, id2.localId]);
			setInChangeAtomIdMap(nodeAliases, id2, id1);

			// We need to delete id1 to avoid forming a cycle in case id1 already had an alias.
			nodeAliases.delete([id1.revision, id1.localId]);
		}

		crossFieldTable.composedNodes.add(composedNodeChangeset);
	}

	private composeNodeChanges(
		nodeId: NodeId,
		change1: NodeChangeset,
		change2: NodeChangeset,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		// WARNING: this composition logic assumes that we never make compositions of the following form:
		// change1: a changeset that impact the existence of a node
		// change2: a node-exists constraint on that node.
		// This is currently enforced by the fact that constraints which apply to the input context are included first in the composition.
		// If that weren't the case, we would need to rebase the status of the constraint backward over the changes from change1.
		const nodeExistsConstraint = change1.nodeExistsConstraint ?? change2.nodeExistsConstraint;

		// WARNING: this composition logic assumes that we never make compositions of the following form:
		// change1: a node-exists-on-revert constraint on a node
		// change2: a changeset that impacts the existence of that node
		// This is currently enforced by the fact that constraints which apply to the revert are included last in the composition.
		// If that weren't the case, we would need to rebase the status of the constraint forward over the changes from change2.
		const nodeExistsConstraintOnRevert =
			change1.nodeExistsConstraintOnRevert ?? change2.nodeExistsConstraintOnRevert;

		const composedFieldChanges = this.composeFieldMaps(
			change1.fieldChanges,
			change2.fieldChanges,
			nodeId,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const composedNodeChange: NodeChangeset = {};

		if (composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		if (nodeExistsConstraint !== undefined) {
			composedNodeChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		if (nodeExistsConstraintOnRevert !== undefined) {
			composedNodeChange.nodeExistsConstraintOnRevert = nodeExistsConstraintOnRevert;
		}

		return composedNodeChange;
	}

	/**
	 * @param change - The change to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * @param revisionForInvert - The revision for the invert changeset.
	 * performing a sandwich rebase.
	 */
	public invert(
		change: TaggedChange<ModularChangeset>,
		isRollback: boolean,
		revisionForInvert: RevisionTag,
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

		if (hasConflicts(change.change)) {
			return makeModularChangeset({
				maxId: change.change.maxId as number,
				revisions: revInfos,
				destroys,
			});
		}

		const genId: IdAllocator = idAllocatorFromMaxId(change.change.maxId ?? -1);

		const crossFieldTable: InvertTable = {
			change: change.change,
			entries: newChangeAtomIdRangeMap(),
			originalFieldToContext: new Map(),
			invertRevision: revisionForInvert,
			invertedNodeToParent: brand(change.change.nodeToParent.clone()),
			invalidatedFields: new Set(),
			invertedRoots: invertRootTable(change.change),
			attachToDetachId: newChangeAtomIdTransform(),
			detachToAttachId: newChangeAtomIdTransform(),
		};
		const { revInfos: oldRevInfos } = getRevInfoFromTaggedChanges([change]);
		const revisionMetadata = revisionMetadataSourceFromInfo(oldRevInfos);

		const invertedFields = this.invertFieldMap(
			change.change.fieldChanges,
			undefined,
			isRollback,
			genId,
			crossFieldTable,
			revisionMetadata,
			revisionForInvert,
		);

		const invertedNodes: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
		change.change.nodeChanges.forEachPair(([revision, localId], nodeChangeset) => {
			invertedNodes.set(
				[revision, localId],
				this.invertNodeChange(
					nodeChangeset,
					{ revision, localId },
					isRollback,
					genId,
					crossFieldTable,
					revisionMetadata,
					revisionForInvert,
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

				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.invert(
					contextualizeFieldChangeset(originalFieldChange, change.change),
					isRollback,
					genId,
					revisionForInvert,
					new InvertNodeManagerI(crossFieldTable, context.fieldId),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		const crossFieldKeys = this.makeCrossFieldKeyTable(invertedFields, invertedNodes);

		this.processInvertRenames(crossFieldTable);

		return makeModularChangeset({
			fieldChanges: invertedFields,
			nodeChanges: invertedNodes,
			nodeToParent: crossFieldTable.invertedNodeToParent,
			rootNodes: crossFieldTable.invertedRoots,
			nodeAliases: change.change.nodeAliases,
			crossFieldKeys,
			maxId: genId.getMaxId(),
			revisions: revInfos,
			constraintViolationCount: change.change.constraintViolationCountOnRevert,
			constraintViolationCountOnRevert: change.change.constraintViolationCount,
			destroys,
		});
	}

	private invertFieldMap(
		changes: FieldChangeMap,
		parentId: NodeId | undefined,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
		revisionForInvert: RevisionTag,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes) {
			const fieldId = { nodeId: parentId, field };
			const manager = new InvertNodeManagerI(crossFieldTable, fieldId);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(
				contextualizeFieldChangeset(fieldChange.change, crossFieldTable.change),
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

	private invertNodeChange(
		change: NodeChangeset,
		id: NodeId,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
		revisionForInvert: RevisionTag,
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
			inverse.fieldChanges = this.invertFieldMap(
				change.fieldChanges,
				id,
				isRollback,
				genId,
				crossFieldTable,
				revisionMetadata,
				revisionForInvert,
			);
		}

		return inverse;
	}

	private processInvertRenames(table: InvertTable): void {
		for (const {
			start: newAttachId,
			value: originalDetachId,
			length,
		} of table.attachToDetachId.entries()) {
			renameNodes(
				table.invertedRoots,
				originalDetachId,
				newAttachId,
				length,
				table.invertedRoots.newToOldId,
			);
		}

		for (const {
			start: newDetachId,
			value: originalAttachId,
			length,
		} of table.detachToAttachId.entries()) {
			renameNodes(
				table.invertedRoots,
				newDetachId,
				originalAttachId,
				length,
				undefined,
				table.invertedRoots.oldToNewId,
			);
		}
	}

	public rebase(
		taggedChange: TaggedChange<ModularChangeset>,
		over: TaggedChange<ModularChangeset>,
		revisionMetadata: RevisionMetadataSource,
	): ModularChangeset {
		if (hasConflicts(over.change)) {
			return taggedChange.change;
		}

		const change = taggedChange.change;
		const maxId = Math.max(change.maxId ?? -1, over.change.maxId ?? -1);
		const idState: IdAllocationState = { maxId };
		const genId: IdAllocator = idAllocatorFromState(idState);

		const affectedBaseFields: TupleBTree<FieldIdKey, boolean> = newTupleBTree();
		const nodesToRebase: [newChangeset: NodeId, baseChangeset: NodeId][] = [];
		const rebasedRootNodes = rebaseRoots(
			change,
			over.change,
			affectedBaseFields,
			nodesToRebase,
		);
		const crossFieldTable: RebaseTable = {
			entries: newDetachedEntryMap(),
			newChange: change,
			baseChange: over.change,
			baseFieldToContext: new Map(),
			baseRoots: over.change.rootNodes,
			rebasedRootNodes,
			baseToRebasedNodeId: newTupleBTree(),
			rebasedFields: new Set(),
			rebasedNodeToParent: brand(change.nodeToParent.clone()),
			rebasedDetachLocations: newChangeAtomIdRangeMap(),
			movedDetaches: newChangeAtomIdRangeMap(),
			nodeIdPairs: [],
			affectedBaseFields,
			fieldsWithUnattachedChild: new Set(),
		};

		const getBaseRevisions = (): RevisionTag[] =>
			revisionInfoFromTaggedChange(over).map((info) => info.revision);

		const rebaseMetadata: RebaseRevisionMetadata = {
			...revisionMetadata,
			getRevisionToRebase: () => taggedChange.revision,
			getBaseRevisions,
		};

		const rebasedNodes: ChangeAtomIdBTree<NodeChangeset> = brand(change.nodeChanges.clone());

		const rebasedFields = this.rebaseIntersectingFields(
			nodesToRebase,
			crossFieldTable,
			rebasedNodes,
			genId,
			rebaseMetadata,
		);

		this.rebaseInvalidatedElements(
			rebasedFields,
			rebasedNodes,
			crossFieldTable,
			rebaseMetadata,
			genId,
		);

		const constraintState = newConstraintState(change.constraintViolationCount ?? 0);
		const revertConstraintState = newConstraintState(
			change.constraintViolationCountOnRevert ?? 0,
		);

		this.updateConstraints(
			rebasedFields,
			rebasedNodes,
			rebasedRootNodes,
			constraintState,
			revertConstraintState,
		);

		const rebased = makeModularChangeset({
			fieldChanges: this.pruneFieldMap(
				rebasedFields,
				rebasedNodes,
				crossFieldTable.rebasedNodeToParent,
			),
			nodeChanges: rebasedNodes,
			nodeToParent: crossFieldTable.rebasedNodeToParent,
			rootNodes: this.pruneRoots(
				crossFieldTable.rebasedRootNodes,
				rebasedNodes,
				crossFieldTable.rebasedNodeToParent,
			),
			nodeAliases: change.nodeAliases,
			crossFieldKeys: rebaseCrossFieldKeys(
				change.crossFieldKeys,
				crossFieldTable.movedDetaches,
				crossFieldTable.rebasedDetachLocations,
			),
			maxId: idState.maxId,
			revisions: change.revisions,
			constraintViolationCount: constraintState.violationCount,
			constraintViolationCountOnRevert: revertConstraintState.violationCount,
			builds: change.builds,
			destroys: change.destroys,
			refreshers: change.refreshers,
		});

		return rebased;
	}

	// This performs a first pass on all fields which have both new and base changes.
	// TODO: Can we also handle additional passes in this method?
	private rebaseIntersectingFields(
		rootsChanges: [newChangeset: NodeId, baseChangeset: NodeId][],
		crossFieldTable: RebaseTable,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): FieldChangeMap {
		const change = crossFieldTable.newChange;
		const baseChange = crossFieldTable.baseChange;
		const rebasedFields = this.rebaseFieldMap(
			change.fieldChanges,
			baseChange.fieldChanges,
			undefined,
			genId,
			crossFieldTable,
			metadata,
		);

		// This loop processes all fields which have both base and new changes.
		// Note that the call to `rebaseNodeChange` can add entries to `crossFieldTable.nodeIdPairs`.
		for (const [newId, baseId, _attachState] of crossFieldTable.nodeIdPairs) {
			const rebasedNode = this.rebaseNodeChange(
				newId,
				baseId,
				genId,
				crossFieldTable,
				metadata,
			);

			setInChangeAtomIdMap(rebasedNodes, newId, rebasedNode);
		}

		for (const [newChildChange, baseChildChange] of rootsChanges) {
			const rebasedNode = this.rebaseNodeChange(
				newChildChange,
				baseChildChange,
				genId,
				crossFieldTable,
				metadata,
			);

			setInChangeAtomIdMap(rebasedNodes, newChildChange, rebasedNode);
		}
		return rebasedFields;
	}

	// This processes fields which have no new changes but have been invalidated by another field.
	private rebaseFieldsWithoutNewChanges(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		crossFieldTable: RebaseTable,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseChange = crossFieldTable.baseChange;
		const baseFields = crossFieldTable.affectedBaseFields.clone();
		crossFieldTable.affectedBaseFields.clear();

		for (const fieldIdKey of baseFields.keys()) {
			const [revision, localId, fieldKey] = fieldIdKey;
			const baseNodeId =
				localId !== undefined
					? normalizeNodeId({ revision, localId }, baseChange.nodeAliases)
					: undefined;

			const baseFieldChange = fieldMapFromNodeId(
				baseChange.fieldChanges,
				baseChange.nodeChanges,
				baseNodeId,
			).get(fieldKey);

			assert(
				baseFieldChange !== undefined,
				0x9c2 /* Cross field key registered for empty field */,
			);

			if (crossFieldTable.baseFieldToContext.has(baseFieldChange)) {
				crossFieldTable.affectedBaseFields.set(fieldIdKey, true);
				continue;
			}

			// This field has no changes in the new changeset, otherwise it would have been added to
			// `crossFieldTable.baseFieldToContext` when processing fields with both base and new changes.
			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				stateChange: NodeAttachState | undefined,
			): NodeId | undefined => {
				assert(child === undefined, 0x9c3 /* There should be no new changes in this field */);
				return undefined;
			};

			const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);
			const fieldChange: FieldChange = {
				...baseFieldChange,
				change: brand(handler.createEmpty()),
			};

			const rebasedNodeId =
				baseNodeId !== undefined
					? rebasedNodeIdFromBaseNodeId(crossFieldTable, baseNodeId)
					: undefined;

			const fieldId: FieldId = { nodeId: rebasedNodeId, field: fieldKey };

			const rebasedField: unknown = handler.rebaser.rebase(
				contextualizeFieldChangeset(fieldChange.change, crossFieldTable.newChange),
				contextualizeFieldChangeset(baseFieldChange.change, crossFieldTable.baseChange),
				rebaseChild,
				genId,
				new RebaseNodeManagerI(crossFieldTable, fieldId),
				metadata,
			);

			const rebasedFieldChange: FieldChange = {
				...baseFieldChange,
				change: brand(rebasedField),
			};

			// TODO: Deduplicate
			crossFieldTable.baseFieldToContext.set(baseFieldChange, {
				newChange: fieldChange,
				baseChange: baseFieldChange,
				rebasedChange: rebasedFieldChange,
				fieldId,
				baseNodeIds: [],
			});
			crossFieldTable.rebasedFields.add(rebasedFieldChange);

			this.attachRebasedField(
				rebasedFields,
				rebasedNodes,
				crossFieldTable,
				rebasedFieldChange,
				fieldId,
				genId,
				metadata,
			);
		}
	}

	private rebaseInvalidatedElements(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		metadata: RebaseRevisionMetadata,
		idAllocator: IdAllocator,
	): void {
		this.rebaseFieldsWithoutNewChanges(
			rebasedFields,
			rebasedNodes,
			table,
			idAllocator,
			metadata,
		);

		this.rebaseFieldsWithUnattachedChild(table, metadata, idAllocator);
		this.rebaseInvalidatedFields(table, metadata, idAllocator);
	}

	private rebaseInvalidatedFields(
		crossFieldTable: RebaseTable,
		rebaseMetadata: RebaseRevisionMetadata,
		genId: IdAllocator,
	): void {
		const baseFields = crossFieldTable.affectedBaseFields.clone();
		crossFieldTable.affectedBaseFields.clear();
		for (const baseFieldId of baseFields.keys()) {
			const baseFieldChange = fieldChangeFromId(
				crossFieldTable.baseChange,
				fieldIdFromFieldIdKey(baseFieldId),
			);

			assert(
				baseFieldChange !== undefined,
				0x9c2 /* Cross field key registered for empty field */,
			);

			assert(
				crossFieldTable.baseFieldToContext.has(baseFieldChange),
				"Fields with no new change should already have been processed",
			);

			this.rebaseInvalidatedField(baseFieldChange, crossFieldTable, rebaseMetadata, genId);
		}
	}

	private rebaseFieldsWithUnattachedChild(
		table: RebaseTable,
		metadata: RebaseRevisionMetadata,
		idAllocator: IdAllocator,
	): void {
		for (const field of table.fieldsWithUnattachedChild) {
			this.rebaseInvalidatedField(field, table, metadata, idAllocator, true);
		}
	}

	private rebaseInvalidatedField(
		baseField: FieldChange,
		crossFieldTable: RebaseTable,
		rebaseMetadata: RebaseRevisionMetadata,
		genId: IdAllocator,
		allowInval = false,
	): void {
		const context = crossFieldTable.baseFieldToContext.get(baseField);
		assert(context !== undefined, 0x852 /* Every field should have a context */);
		const {
			changeHandler,
			change1: fieldChangeset,
			change2: baseChangeset,
		} = this.normalizeFieldChanges(context.newChange, context.baseChange);

		const rebaseChild = (
			curr: NodeId | undefined,
			base: NodeId | undefined,
		): NodeId | undefined => {
			if (curr !== undefined) {
				return curr;
			}

			if (base !== undefined) {
				for (const id of context.baseNodeIds) {
					if (areEqualChangeAtomIds(base, id)) {
						return base;
					}
				}
			}

			return undefined;
		};

		context.rebasedChange.change = brand(
			changeHandler.rebaser.rebase(
				contextualizeFieldChangeset(fieldChangeset, crossFieldTable.newChange),
				contextualizeFieldChangeset(baseChangeset, crossFieldTable.baseChange),
				rebaseChild,
				genId,
				new RebaseNodeManagerI(crossFieldTable, context.fieldId, allowInval),
				rebaseMetadata,
			),
		);
	}

	private attachRebasedField(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		rebasedField: FieldChange,
		{ nodeId, field: fieldKey }: FieldId,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		if (nodeId === undefined) {
			rebasedFields.set(fieldKey, rebasedField);
			return;
		}
		const rebasedNode = getFromChangeAtomIdMap(rebasedNodes, nodeId);
		if (rebasedNode !== undefined) {
			if (rebasedNode.fieldChanges === undefined) {
				rebasedNode.fieldChanges = new Map([[fieldKey, rebasedField]]);
				return;
			}

			assert(!rebasedNode.fieldChanges.has(fieldKey), 0x9c4 /* Expected an empty field */);
			rebasedNode.fieldChanges.set(fieldKey, rebasedField);
			return;
		}

		const newNode: NodeChangeset = {
			fieldChanges: new Map([[fieldKey, rebasedField]]),
		};

		setInChangeAtomIdMap(rebasedNodes, nodeId, newNode);
		setInChangeAtomIdMap(table.baseToRebasedNodeId, nodeId, nodeId);

		const parentBase = getNodeParent(table.baseChange, nodeId);

		this.attachRebasedNode(
			rebasedFields,
			rebasedNodes,
			table,
			nodeId,
			parentBase,
			idAllocator,
			metadata,
		);
	}

	private attachRebasedNode(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		baseNodeId: NodeId,
		parentBase: NodeLocation,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		if (parentBase.root !== undefined) {
			setInChangeAtomIdMap(table.rebasedRootNodes.nodeChanges, parentBase.root, baseNodeId);
			setInChangeAtomIdMap(table.rebasedNodeToParent, baseNodeId, parentBase);
			return;
		}

		const parentFieldIdBase = parentBase.field;
		const baseFieldChange = fieldChangeFromId(table.baseChange, parentFieldIdBase);

		const rebasedFieldId = rebasedFieldIdFromBaseId(table, parentFieldIdBase);
		setInChangeAtomIdMap(table.rebasedNodeToParent, baseNodeId, { field: rebasedFieldId });

		const context = table.baseFieldToContext.get(baseFieldChange);
		if (context !== undefined) {
			// We've already processed this field.
			// The new child node will be attached in rebaseFieldsWithUnattachedChild.
			context.baseNodeIds.push(baseNodeId);
			table.fieldsWithUnattachedChild.add(baseFieldChange);
			return;
		}

		const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);

		const fieldChange: FieldChange = {
			...baseFieldChange,
			change: brand(handler.createEmpty()),
		};

		const rebasedChangeset = handler.rebaser.rebase(
			contextualizeFieldChangeset(handler.createEmpty() as FieldChangeset, undefined),
			contextualizeFieldChangeset(baseFieldChange.change, table.baseChange),
			(_idNew, idBase) =>
				idBase !== undefined && areEqualChangeAtomIds(idBase, baseNodeId)
					? baseNodeId
					: undefined,
			idAllocator,
			new RebaseNodeManagerI(table, rebasedFieldId),
			metadata,
		);

		const rebasedField: FieldChange = {
			...baseFieldChange,
			change: brand(rebasedChangeset),
		};
		table.rebasedFields.add(rebasedField);
		table.baseFieldToContext.set(baseFieldChange, {
			newChange: fieldChange,
			baseChange: baseFieldChange,
			rebasedChange: rebasedField,
			fieldId: rebasedFieldId,
			baseNodeIds: [],
		});

		this.attachRebasedField(
			rebasedFields,
			rebasedNodes,
			table,
			rebasedField,
			rebasedFieldId,
			idAllocator,
			metadata,
		);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: FieldChangeMap,
		parentId: NodeId | undefined,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();
		const rebaseChild = (
			child: NodeId | undefined,
			baseChild: NodeId | undefined,
			stateChange: NodeAttachState | undefined,
		): NodeId | undefined => {
			if (child !== undefined && baseChild !== undefined) {
				crossFieldTable.nodeIdPairs.push([child, baseChild, stateChange]);
			}
			return child;
		};

		for (const [field, fieldChange] of change) {
			const fieldId: FieldId = { nodeId: parentId, field };
			const baseChange = over.get(field);
			if (baseChange === undefined) {
				rebasedFields.set(field, fieldChange);
				continue;
			}

			const {
				fieldKind,
				changeHandler,
				change1: fieldChangeset,
				change2: baseChangeset,
			} = this.normalizeFieldChanges(fieldChange, baseChange);

			const manager = new RebaseNodeManagerI(crossFieldTable, fieldId);

			const rebasedField = changeHandler.rebaser.rebase(
				contextualizeFieldChangeset(fieldChangeset, crossFieldTable.newChange),
				contextualizeFieldChangeset(baseChangeset, crossFieldTable.baseChange),
				rebaseChild,
				genId,
				manager,
				revisionMetadata,
			);

			const rebasedFieldChange: FieldChange = {
				fieldKind,
				change: brand(rebasedField),
			};

			rebasedFields.set(field, rebasedFieldChange);

			crossFieldTable.baseFieldToContext.set(baseChange, {
				baseChange,
				newChange: fieldChange,
				rebasedChange: rebasedFieldChange,
				fieldId,
				baseNodeIds: [],
			});

			crossFieldTable.rebasedFields.add(rebasedFieldChange);
		}

		return rebasedFields;
	}

	private rebaseNodeChange(
		newId: NodeId,
		baseId: NodeId,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
	): NodeChangeset {
		const change = nodeChangeFromId(crossFieldTable.newChange.nodeChanges, newId);
		const over = nodeChangeFromId(crossFieldTable.baseChange.nodeChanges, baseId);

		const baseMap: FieldChangeMap = over?.fieldChanges ?? new Map();

		const fieldChanges =
			change.fieldChanges !== undefined && over.fieldChanges !== undefined
				? this.rebaseFieldMap(
						change?.fieldChanges ?? new Map(),
						baseMap,
						newId,
						genId,
						crossFieldTable,
						revisionMetadata,
					)
				: change.fieldChanges;

		const rebasedChange: NodeChangeset = {};

		if (fieldChanges !== undefined && fieldChanges.size > 0) {
			rebasedChange.fieldChanges = fieldChanges;
		}

		if (change?.nodeExistsConstraint !== undefined) {
			rebasedChange.nodeExistsConstraint = change.nodeExistsConstraint;
		}

		if (change?.nodeExistsConstraintOnRevert !== undefined) {
			rebasedChange.nodeExistsConstraintOnRevert = change.nodeExistsConstraintOnRevert;
		}

		setInChangeAtomIdMap(crossFieldTable.baseToRebasedNodeId, baseId, newId);
		return rebasedChange;
	}

	private updateConstraints(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		rebasedRoots: RootNodeTable,
		constraintState: ConstraintState,
		revertConstraintState: ConstraintState,
	): void {
		this.updateConstraintsForFields(
			rebasedFields,
			NodeAttachState.Attached,
			NodeAttachState.Attached,
			constraintState,
			revertConstraintState,
			rebasedNodes,
		);

		for (const [_detachId, nodeId] of rebasedRoots.nodeChanges.entries()) {
			// XXX: This is only incorrect if the rebased changeset attaches the node.
			// Efficiently computing this would require maintaining a mapping from node ID to attach ID.
			const detachedInOutput = true;
			this.updateConstraintsForNode(
				nodeId,
				NodeAttachState.Detached,
				detachedInOutput ? NodeAttachState.Detached : NodeAttachState.Attached,
				rebasedNodes,
				constraintState,
				revertConstraintState,
			);
		}
	}

	private updateConstraintsForFields(
		fields: FieldChangeMap,
		parentInputAttachState: NodeAttachState,
		parentOutputAttachState: NodeAttachState,
		constraintState: ConstraintState,
		revertConstraintState: ConstraintState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): void {
		for (const field of fields.values()) {
			const handler = getChangeHandler(this.fieldKinds, field.fieldKind);
			for (const [nodeId] of handler.getNestedChanges(field.change)) {
				// XXX: This is only incorrect in the case where the rebased changeset detaches this node.
				// Efficiently computing this would require maintaining a mapping from node ID to detach ID.
				const isOutputDetached = false;
				const outputAttachState =
					parentOutputAttachState === NodeAttachState.Detached || isOutputDetached
						? NodeAttachState.Detached
						: NodeAttachState.Attached;

				this.updateConstraintsForNode(
					nodeId,
					parentInputAttachState,
					outputAttachState,
					nodes,
					constraintState,
					revertConstraintState,
				);
			}
		}
	}

	private updateConstraintsForNode(
		nodeId: NodeId,
		inputAttachState: NodeAttachState,
		outputAttachState: NodeAttachState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
		constraintState: ConstraintState,
		revertConstraintState: ConstraintState,
	): void {
		const node =
			nodes.get([nodeId.revision, nodeId.localId]) ?? fail(0xb24 /* Unknown node ID */);
		if (node.nodeExistsConstraint !== undefined) {
			const isNowViolated = inputAttachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraint.violated !== isNowViolated) {
				// XXX: This can mutate the input changeset
				node.nodeExistsConstraint = {
					...node.nodeExistsConstraint,
					violated: isNowViolated,
				};
				constraintState.violationCount += isNowViolated ? 1 : -1;
			}
		}
		if (node.nodeExistsConstraintOnRevert !== undefined) {
			const isNowViolated = outputAttachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraintOnRevert.violated !== isNowViolated) {
				node.nodeExistsConstraintOnRevert = {
					...node.nodeExistsConstraintOnRevert,
					violated: isNowViolated,
				};
				revertConstraintState.violationCount += isNowViolated ? 1 : -1;
			}
		}

		if (node.fieldChanges !== undefined) {
			this.updateConstraintsForFields(
				node.fieldChanges,
				inputAttachState,
				outputAttachState,
				constraintState,
				revertConstraintState,
				nodes,
			);
		}
	}

	private pruneFieldMap(
		changeset: FieldChangeMap | undefined,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	): FieldChangeMap | undefined {
		if (changeset === undefined) {
			return undefined;
		}

		const prunedChangeset: FieldChangeMap = new Map();
		for (const [field, fieldChange] of changeset) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);

			const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
				this.pruneNodeChange(nodeId, nodeMap, nodeToParent),
			);

			if (!handler.isEmpty(prunedFieldChangeset)) {
				prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
			}
		}

		return prunedChangeset.size > 0 ? prunedChangeset : undefined;
	}

	private pruneRoots(
		roots: RootNodeTable,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	): RootNodeTable {
		const pruned: RootNodeTable = { ...roots, nodeChanges: newTupleBTree() };
		for (const [rootId, nodeId] of roots.nodeChanges.entries()) {
			const prunedId = this.pruneNodeChange(nodeId, nodeMap, nodeToParent);
			if (prunedId !== undefined) {
				pruned.nodeChanges.set(rootId, prunedId);
			}
		}

		return pruned;
	}

	private pruneNodeChange(
		nodeId: NodeId,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	): NodeId | undefined {
		const changeset = nodeChangeFromId(nodes, nodeId);
		const prunedFields =
			changeset.fieldChanges !== undefined
				? this.pruneFieldMap(changeset.fieldChanges, nodes, nodeToParent)
				: undefined;

		const prunedChange = { ...changeset, fieldChanges: prunedFields };
		if (prunedChange.fieldChanges === undefined) {
			delete prunedChange.fieldChanges;
		}

		if (isEmptyNodeChangeset(prunedChange)) {
			const nodeIdKey: [RevisionTag | undefined, ChangesetLocalId] = [
				nodeId.revision,
				nodeId.localId,
			];

			// TODO: Shouldn't we also delete all aliases associated with this node?
			nodes.delete(nodeIdKey);
			nodeToParent.delete(nodeIdKey);
			return undefined;
		} else {
			setInChangeAtomIdMap(nodes, nodeId, prunedChange);
			return nodeId;
		}
	}

	public changeRevision(
		change: ModularChangeset,
		newRevision: RevisionTag | undefined,
		rollbackOf?: RevisionTag,
	): ModularChangeset {
		const oldRevisions = new Set(
			change.revisions === undefined || change.revisions.length === 0
				? [undefined]
				: change.revisions.map((revInfo) => revInfo.revision),
		);
		const updatedFields = this.replaceFieldMapRevisions(
			change.fieldChanges,
			oldRevisions,
			newRevision,
		);

		const updatedNodes: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
		for (const [[revision, id], nodeChangeset] of change.nodeChanges.entries()) {
			updatedNodes.set(
				[replaceRevision(revision, oldRevisions, newRevision), id],
				this.replaceNodeChangesetRevisions(nodeChangeset, oldRevisions, newRevision),
			);
		}

		const updatedNodeToParent: ChangeAtomIdBTree<NodeLocation> = newTupleBTree();
		for (const [[revision, id], location] of change.nodeToParent.entries()) {
			updatedNodeToParent.set(
				[replaceRevision(revision, oldRevisions, newRevision), id],
				replaceNodeLocationRevision(
					normalizeNodeLocation(location, change.nodeAliases),
					oldRevisions,
					newRevision,
				),
			);
		}

		const updated: Mutable<ModularChangeset> = {
			...change,
			fieldChanges: updatedFields,
			nodeChanges: updatedNodes,
			nodeToParent: updatedNodeToParent,
			rootNodes: replaceRootTableRevision(change.rootNodes, oldRevisions, newRevision),

			// We've updated all references to old node IDs, so we no longer need an alias table.
			nodeAliases: newTupleBTree(),
			crossFieldKeys: change.crossFieldKeys.mapEntries(
				(key) => replaceCrossFieldKeyRevision(key, oldRevisions, newRevision),
				(id) =>
					replaceFieldIdRevision(
						normalizeFieldId(id, change.nodeAliases),
						oldRevisions,
						newRevision,
					),
			),
		};

		if (change.builds !== undefined) {
			updated.builds = replaceIdMapRevisions(change.builds, oldRevisions, newRevision);
		}

		if (change.destroys !== undefined) {
			updated.destroys = replaceIdMapRevisions(change.destroys, oldRevisions, newRevision);
		}

		if (change.refreshers !== undefined) {
			updated.refreshers = replaceIdMapRevisions(change.refreshers, oldRevisions, newRevision);
		}

		if (newRevision !== undefined) {
			const revInfo: Mutable<RevisionInfo> = { revision: newRevision };
			if (rollbackOf !== undefined) {
				revInfo.rollbackOf = rollbackOf;
			}

			updated.revisions = [revInfo];
		} else {
			delete updated.revisions;
		}

		return updated;
	}

	private replaceNodeChangesetRevisions(
		nodeChangeset: NodeChangeset,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): NodeChangeset {
		const updated = { ...nodeChangeset };
		if (nodeChangeset.fieldChanges !== undefined) {
			updated.fieldChanges = this.replaceFieldMapRevisions(
				nodeChangeset.fieldChanges,
				oldRevisions,
				newRevision,
			);
		}

		return updated;
	}

	private replaceFieldMapRevisions(
		fields: FieldChangeMap,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): FieldChangeMap {
		const updatedFields: FieldChangeMap = new Map();
		for (const [field, fieldChange] of fields) {
			const updatedFieldChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.replaceRevisions(fieldChange.change, oldRevisions, newRevision);

			updatedFields.set(field, { ...fieldChange, change: brand(updatedFieldChange) });
		}

		return updatedFields;
	}

	private makeCrossFieldKeyTable(
		fields: FieldChangeMap,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): CrossFieldKeyTable {
		const keys: CrossFieldKeyTable = newCrossFieldRangeTable();
		this.populateCrossFieldKeyTableForFieldMap(keys, fields, undefined);
		nodes.forEachPair(([revision, localId], node) => {
			if (node.fieldChanges !== undefined) {
				this.populateCrossFieldKeyTableForFieldMap(keys, node.fieldChanges, {
					revision,
					localId,
				});
			}
		});

		return keys;
	}

	private populateCrossFieldKeyTableForFieldMap(
		table: CrossFieldKeyTable,
		fields: FieldChangeMap,
		parent: NodeId | undefined,
	): void {
		for (const [fieldKey, fieldChange] of fields) {
			const keys = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).getCrossFieldKeys(
				fieldChange.change,
			);
			for (const { key, count } of keys) {
				table.set(key, count, { nodeId: parent, field: fieldKey });
			}
		}
	}

	public buildEditor(
		changeReceiver: (change: TaggedChange<ModularChangeset>) => void,
	): ModularEditBuilder {
		return new ModularEditBuilder(this, this.fieldKinds, changeReceiver);
	}

	private createEmptyFieldChange(fieldKind: FieldKindIdentifier): FieldChange {
		const emptyChange = getChangeHandler(this.fieldKinds, fieldKind).createEmpty();
		return { fieldKind, change: brand(emptyChange) };
	}

	public validateChangeset(change: ModularChangeset): void {
		let numNodes = this.validateFieldChanges(change, change.fieldChanges, undefined);

		for (const [[revision, localId], node] of change.nodeChanges.entries()) {
			if (node.fieldChanges === undefined) {
				continue;
			}

			const nodeId: NodeId = { revision, localId };
			const numChildren = this.validateFieldChanges(change, node.fieldChanges, nodeId);

			numNodes += numChildren;
		}

		assert(
			numNodes === change.nodeChanges.size,
			0xa4d /* Node table contains unparented nodes */,
		);
	}

	/**
	 * Asserts that each child and cross field key in each field has a correct entry in
	 * `nodeToParent` or `crossFieldKeyTable`.
	 * @returns the number of children found.
	 */
	private validateFieldChanges(
		change: ModularChangeset,
		fieldChanges: FieldChangeMap,
		nodeParent: NodeId | undefined,
	): number {
		let numChildren = 0;
		for (const [field, fieldChange] of fieldChanges.entries()) {
			const fieldId = { nodeId: nodeParent, field };
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			for (const [child, _index] of handler.getNestedChanges(fieldChange.change)) {
				const parentFieldId = getNodeParent(change, child);
				assert(
					parentFieldId.field !== undefined && areEqualFieldIds(parentFieldId.field, fieldId),
					0xa4e /* Inconsistent node parentage */,
				);
				numChildren += 1;
			}

			for (const keyRange of handler.getCrossFieldKeys(fieldChange.change)) {
				const fields = getFieldsForCrossFieldKey(change, keyRange.key, keyRange.count);
				assert(
					fields.length === 1 &&
						fields[0] !== undefined &&
						areEqualFieldIds(fields[0], fieldId),
					0xa4f /* Inconsistent cross field keys */,
				);
			}
		}

		return numChildren;
	}
}

function replaceCrossFieldKeyRevision(
	key: CrossFieldKey,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): CrossFieldKey {
	return {
		target: key.target,
		revision: replaceRevision(key.revision, oldRevisions, newRevision),
		localId: key.localId,
	};
}

function replaceRevision(
	revision: RevisionTag | undefined,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): RevisionTag | undefined {
	return oldRevisions.has(revision) ? newRevision : revision;
}

function replaceIdMapRevisions<T>(
	map: ChangeAtomIdBTree<T>,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): ChangeAtomIdBTree<T> {
	const updated: ChangeAtomIdBTree<T> = newTupleBTree();
	for (const [[revision, id], value] of map.entries()) {
		updated.set([replaceRevision(revision, oldRevisions, newRevision), id], value);
	}

	return updated;
}

interface BuildsDestroysAndRefreshers {
	readonly allBuilds: ChangeAtomIdBTree<TreeChunk>;
	readonly allDestroys: ChangeAtomIdBTree<number>;
	readonly allRefreshers: ChangeAtomIdBTree<TreeChunk>;
}

function composeBuildsDestroysAndRefreshers(
	change1: ModularChangeset,
	change2: ModularChangeset,
): BuildsDestroysAndRefreshers {
	// Duplicate builds can happen in compositions of commits that needed to include detached tree refreshers (e.g., undos):
	// In that case, it's possible for the refreshers to contain different trees because the latter
	// refresher may already reflect the changes made by the commit that includes the earlier
	// refresher. This composition includes the changes made by the commit that includes the
	// earlier refresher, so we need to include the build for the earlier refresher, otherwise
	// the produced changeset will build a tree one which those changes have already been applied
	// and also try to apply the changes again, effectively applying them twice.
	// Note that it would in principle be possible to adopt the later build and exclude from the
	// composition all the changes already reflected on the tree, but that is not something we
	// care to support at this time.
	const allBuilds: ChangeAtomIdBTree<TreeChunk> = brand(
		mergeTupleBTrees(
			change1.builds ?? newTupleBTree(),
			change2.builds ?? newTupleBTree(),
			true,
		),
	);

	const allDestroys: ChangeAtomIdBTree<number> = brand(
		mergeTupleBTrees(change1.destroys ?? newTupleBTree(), change2.destroys ?? newTupleBTree()),
	);

	const allRefreshers: ChangeAtomIdBTree<TreeChunk> = brand(
		mergeTupleBTrees(
			change1.refreshers ?? newTupleBTree(),
			change2.refreshers ?? newTupleBTree(),
			true,
		),
	);

	if (change1.destroys !== undefined && change2.builds !== undefined) {
		for (const [key, chunk] of change2.builds.entries()) {
			const destroyCount = change1.destroys.get(key);
			if (destroyCount !== undefined) {
				assert(
					destroyCount === chunk.topLevelLength,
					0x89b /* Expected build and destroy to have the same length */,
				);

				allBuilds.delete(key);
				allDestroys.delete(key);
			}
		}
	}

	if (change1.builds !== undefined && change2.destroys !== undefined) {
		for (const [key, chunk] of change1.builds.entries()) {
			const destroyCount = change2.destroys.get(key);
			if (destroyCount !== undefined) {
				assert(
					destroyCount === chunk.topLevelLength,
					0x9f0 /* Expected build and destroy to have the same length */,
				);

				allBuilds.delete(key);
				allDestroys.delete(key);
			}
		}
	}

	return { allBuilds, allDestroys, allRefreshers };
}

function invertBuilds(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
): ChangeAtomIdBTree<number> | undefined {
	if (builds !== undefined) {
		return brand(builds.mapValues((chunk) => chunk.topLevelLength));
	}
	return undefined;
}

/**
 * Returns the set of removed roots that should be in memory for the given change to be applied.
 * A removed root is relevant if any of the following is true:
 * - It is being inserted
 * - It is being restored
 * - It is being edited
 * - The ID it is associated with is being changed
 *
 * May be conservative by returning more removed roots than strictly necessary.
 *
 * Will never return IDs for non-root trees, even if they are removed.
 *
 * @param change - The change to be applied.
 * @param fieldKinds - The field kinds to delegate to.
 */
export function* relevantRemovedRoots(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	const rootIds: ChangeAtomIdRangeMap<boolean> = newChangeAtomIdRangeMap();
	addAttachesToSet(change, rootIds);

	for (const [[revision, localId]] of change.rootNodes.nodeChanges.entries()) {
		rootIds.set({ revision, localId }, 1, true);
	}

	for (const entry of change.rootNodes.oldToNewId.entries()) {
		rootIds.set(entry.start, entry.length, true);
	}

	for (const entry of rootIds.entries()) {
		for (let offset = 0; offset < entry.length; offset++) {
			const detachId = offsetChangeAtomId(entry.start, offset);
			yield makeDetachedNodeId(detachId.revision, detachId.localId);
		}
	}
}

function addAttachesToSet(
	change: ModularChangeset,
	rootIds: ChangeAtomIdRangeMap<boolean>,
): void {
	// This includes each attach which does not have a corresponding detach.
	for (const entry of change.crossFieldKeys.entries()) {
		if (entry.start.target !== CrossFieldTarget.Destination) {
			continue;
		}

		for (const detachIdEntry of change.rootNodes.newToOldId.getAll2(
			entry.start,
			entry.length,
		)) {
			const detachId = detachIdEntry.value ?? detachIdEntry.start;
			for (const detachEntry of change.crossFieldKeys.getAll2(
				{ ...detachId, target: CrossFieldTarget.Source },
				detachIdEntry.length,
			)) {
				if (detachEntry.value === undefined) {
					rootIds.set(detachEntry.start, detachEntry.length, true);
				}
			}
		}
	}
}

/**
 * Adds any refreshers missing from the provided change that are relevant to the change and
 * removes any refreshers from the provided change that are not relevant to the change.
 *
 * @param change - The change that possibly has missing or superfluous refreshers. Not mutated by this function.
 * @param getDetachedNode - The function to retrieve a tree chunk from the corresponding detached node id.
 * @param removedRoots - The set of removed roots that should be in memory for the given change to be applied.
 * Can be retrieved by calling {@link relevantRemovedRoots}.
 * @param requireRefreshers - when true, this function enforces that all relevant removed roots have a
 * corresponding build or refresher.
 */
export function updateRefreshers(
	change: ModularChangeset,
	getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
	removedRoots: Iterable<DeltaDetachedNodeId>,
	requireRefreshers: boolean = true,
): ModularChangeset {
	const refreshers: ChangeAtomIdBTree<TreeChunk> = newTupleBTree();
	const chunkLengths: Map<RevisionTag | undefined, BTree<number, number>> = new Map();

	if (change.builds !== undefined) {
		for (const [[revision, id], chunk] of change.builds.entries()) {
			const lengthTree = getOrCreate(chunkLengths, revision, () => new BTree());
			lengthTree.set(id, chunk.topLevelLength);
		}
	}

	for (const root of removedRoots) {
		if (change.builds !== undefined) {
			const lengthTree = chunkLengths.get(root.major);

			if (lengthTree !== undefined) {
				const lengthPair = lengthTree.getPairOrNextLower(root.minor);
				if (lengthPair !== undefined) {
					const [firstMinor, length] = lengthPair;

					// if the root minor is within the length of the minor of the retrieved pair
					// then there's no need to check for the detached node
					if (root.minor < firstMinor + length) {
						continue;
					}
				}
			}
		}

		const node = getDetachedNode(root);
		if (node === undefined) {
			assert(!requireRefreshers, 0x8cd /* detached node should exist */);
		} else {
			refreshers.set([root.major, brand(root.minor)], node);
		}
	}

	const {
		fieldChanges,
		nodeChanges,
		maxId,
		revisions,
		constraintViolationCount,
		constraintViolationCountOnRevert,
		builds,
		destroys,
	} = change;

	return makeModularChangeset({
		fieldChanges,
		nodeChanges,
		nodeToParent: change.nodeToParent,
		nodeAliases: change.nodeAliases,
		rootNodes: change.rootNodes,
		crossFieldKeys: change.crossFieldKeys,
		maxId: maxId as number,
		revisions,
		constraintViolationCount,
		constraintViolationCountOnRevert,
		builds,
		destroys,
		refreshers,
	});
}

/**
 * Converts a change into the delta format.
 *
 * @param change - The change to convert into a delta.
 * @param fieldKinds - The field kinds to delegate to.
 */
export function intoDelta(
	taggedChange: TaggedChange<ModularChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaRoot {
	const change = taggedChange.change;
	const rootDelta: Mutable<DeltaRoot> = {};

	if (!hasConflicts(change)) {
		// If there are no constraint violations, then tree changes apply.
		const fieldDeltas = intoDeltaImpl(change.fieldChanges, change.nodeChanges, fieldKinds);

		const global: DeltaDetachedNodeChanges[] = [];
		for (const [[major, minor], nodeId] of change.rootNodes.nodeChanges.entries()) {
			global.push({
				id: { major, minor },
				fields: deltaFromNodeChange(
					nodeChangeFromId(change.nodeChanges, nodeId),
					change.nodeChanges,
					fieldKinds,
				),
			});
		}

		const rename: DeltaDetachedNodeRename[] = [];
		for (const {
			start: oldId,
			value: newId,
			length,
		} of change.rootNodes.oldToNewId.entries()) {
			rename.push({
				count: length,
				oldId: makeDetachedNodeId(oldId.revision, oldId.localId),
				newId: makeDetachedNodeId(newId.revision, newId.localId),
			});
		}

		if (fieldDeltas.size > 0) {
			rootDelta.fields = fieldDeltas;
		}
		if (global.length > 0) {
			rootDelta.global = global;
		}
		if (rename.length > 0) {
			rootDelta.rename = rename;
		}
	}

	// Constraint violations should not prevent nodes from being built
	if (change.builds && change.builds.size > 0) {
		rootDelta.build = copyDetachedNodes(change.builds);
	}
	if (change.destroys !== undefined && change.destroys.size > 0) {
		const destroys: DeltaDetachedNodeDestruction[] = [];
		for (const [[major, minor], count] of change.destroys.entries()) {
			destroys.push({
				id: makeDetachedNodeId(major, minor),
				count,
			});
		}
		rootDelta.destroy = destroys;
	}
	if (change.refreshers && change.refreshers.size > 0) {
		rootDelta.refreshers = copyDetachedNodes(change.refreshers);
	}

	return rootDelta;
}

function copyDetachedNodes(
	detachedNodes: ChangeAtomIdBTree<TreeChunk>,
): DeltaDetachedNodeBuild[] | undefined {
	const copiedDetachedNodes: DeltaDetachedNodeBuild[] = [];
	for (const [[major, minor], chunk] of detachedNodes.entries()) {
		if (chunk.topLevelLength > 0) {
			chunk.referenceAdded();
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major, minor),
				trees: chunk,
			});
		}
	}
	return copiedDetachedNodes.length > 0 ? copiedDetachedNodes : undefined;
}

/**
 * @param change - The change to convert into a delta.
 */
function intoDeltaImpl(
	change: FieldChangeMap,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();

	for (const [field, fieldChange] of change) {
		const fieldDelta = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			fieldChange.change,
			(childChange): DeltaFieldMap => {
				const nodeChange = nodeChangeFromId(nodeChanges, childChange);
				return deltaFromNodeChange(nodeChange, nodeChanges, fieldKinds);
			},
		);
		if (fieldDelta !== undefined && fieldDelta.length > 0) {
			delta.set(field, fieldDelta);
		}
	}
	return delta;
}

function deltaFromNodeChange(
	change: NodeChangeset,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, nodeChanges, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

/**
 * @param revInfos - This should describe the revision being rebased and all revisions in the rebase path,
 * even if not part of the current base changeset.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `revInfos` must include
 * the changes [A⁻¹ X, Y, A, B] for each rebase step of B.
 * @param revisionToRebase - The revision of the changeset which is being rebased.
 * @param baseRevisions - The set of revisions in the changeset being rebased over.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `baseRevisions` must include
 * revisions [A⁻¹ X, Y, A] if rebasing over the composition of all those changes, or
 * revision [A⁻¹] for the first rebase, then [X], etc. if rebasing over edits individually.
 * @returns - RebaseRevisionMetadata to be passed to `FieldChangeRebaser.rebase`*
 */
export function rebaseRevisionMetadataFromInfo(
	revInfos: readonly RevisionInfo[],
	revisionToRebase: RevisionTag | undefined,
	baseRevisions: (RevisionTag | undefined)[],
): RebaseRevisionMetadata {
	const filteredRevisions: RevisionTag[] = [];
	for (const revision of baseRevisions) {
		if (revision !== undefined) {
			filteredRevisions.push(revision);
		}
	}

	const getBaseRevisions = (): RevisionTag[] => filteredRevisions;
	return {
		...revisionMetadataSourceFromInfo(revInfos),
		getRevisionToRebase: () => revisionToRebase,
		getBaseRevisions,
	};
}

function isEmptyNodeChangeset(change: NodeChangeset): boolean {
	return (
		change.fieldChanges === undefined &&
		change.nodeExistsConstraint === undefined &&
		change.nodeExistsConstraintOnRevert === undefined
	);
}

export function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	kind: FieldKindIdentifier,
): FieldKindWithEditor {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return withEditor(fieldKind);
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

interface InvertTable {
	change: ModularChangeset;

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

	/**
	 * Maps from detach ID in the inverted changeset to the corresponding attach ID in the base changeset.
	 */
	detachToAttachId: ChangeAtomIdRangeMap<ChangeAtomId>;
}

interface InvertContext {
	fieldId: FieldId;
	invertedField: FieldChange;
}

interface RebaseTable {
	// Entries are keyed on attach ID
	readonly entries: CrossFieldMap<DetachedNodeEntry>;
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from the FieldChange key used for the CrossFieldTable (which is the base FieldChange)
	 * to the context for the field.
	 */
	readonly baseFieldToContext: Map<FieldChange, RebaseFieldContext>;
	readonly baseRoots: RootNodeTable;
	readonly baseToRebasedNodeId: ChangeAtomIdBTree<NodeId>;
	readonly rebasedFields: Set<FieldChange>;
	readonly rebasedNodeToParent: ChangeAtomIdBTree<NodeLocation>;
	readonly rebasedDetachLocations: ChangeAtomIdRangeMap<FieldId>;
	readonly movedDetaches: ChangeAtomIdRangeMap<boolean>;
	readonly rebasedRootNodes: RootNodeTable;

	/**
	 * List of unprocessed (newId, baseId) pairs encountered so far.
	 */
	readonly nodeIdPairs: [NodeId, NodeId, NodeAttachState | undefined][];
	readonly affectedBaseFields: TupleBTree<FieldIdKey, boolean>;

	/**
	 * Set of base fields which contain a node which needs to be attached in the rebased changeset.
	 */
	readonly fieldsWithUnattachedChild: Set<FieldChange>;
}

type FieldIdKey = [RevisionTag | undefined, ChangesetLocalId | undefined, FieldKey];

interface RebaseFieldContext {
	baseChange: FieldChange;
	newChange: FieldChange;
	rebasedChange: FieldChange;
	fieldId: FieldId;

	/**
	 * The set of node IDs in the base changeset which should be included in the rebased field,
	 * even if there is no corresponding node changeset in the new change.
	 */
	baseNodeIds: NodeId[];
}

function newComposeTable(
	baseChange: ModularChangeset,
	newChange: ModularChangeset,
	composedRootNodes: RootNodeTable,
	composedCrossFieldKeys: CrossFieldKeyTable,
	pendingCompositions: PendingCompositions,
): ComposeTable {
	return {
		entries: newChangeAtomIdRangeMap(),
		baseChange,
		newChange,
		fieldToContext: new Map(),
		newFieldToBaseField: new Map(),
		newToBaseNodeId: newTupleBTree(),
		composedNodes: new Set(),
		movedNodeToParent: newTupleBTree(),
		composedRootNodes,
		composedCrossFieldKeys,
		renamesToDelete: newChangeAtomIdRangeMap(),
		pendingCompositions,
	};
}

export function contextualizeFieldChangeset<T>(
	fieldChange: T,
	modularChange?: ModularChangeset | undefined,
): ContextualizedFieldChange<T> {
	return {
		change: fieldChange,
		roots: {
			areSameNodes: (oldId: ChangeAtomId, newId: ChangeAtomId, count: number = 1): boolean => {
				if (modularChange === undefined) {
					return false;
				}
				if (areEqualChangeAtomIds(oldId, newId)) {
					return true;
				}
				const entry = modularChange.rootNodes.oldToNewId.getFirst(oldId, count);
				return entry.length === count && areEqualChangeAtomIdOpts(entry.value, newId);
			},
		},
	};
}

interface ComposeTable {
	// Entries are keyed on detach ID
	readonly entries: CrossFieldMap<NodeId>;
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from an input changeset for a field (from change1 if it has one, from change2 otherwise) to the context for that field.
	 */
	readonly fieldToContext: Map<FieldChange, ComposeFieldContext>;
	readonly newFieldToBaseField: Map<FieldChange, FieldChange>;
	readonly newToBaseNodeId: ChangeAtomIdBTree<NodeId>;
	readonly composedNodes: Set<NodeChangeset>;
	readonly movedNodeToParent: ChangeAtomIdBTree<NodeLocation>;
	readonly composedRootNodes: RootNodeTable;
	readonly composedCrossFieldKeys: CrossFieldKeyTable;
	readonly renamesToDelete: ChangeAtomIdRangeMap<boolean>;
	readonly pendingCompositions: PendingCompositions;
}

interface PendingCompositions {
	/**
	 * Each entry in this list represents a node with both base and new changes which have not yet been composed.
	 * Entries are of the form [baseId, newId].
	 */
	readonly nodeIdsToCompose: [NodeId, NodeId][];

	/**
	 * The set of fields in the base changeset which have been affected by a cross field effect.
	 */
	readonly affectedBaseFields: BTree<FieldIdKey, true>;
}

interface ComposeFieldContext {
	/**
	 * The field ID for this field in the composed changeset.
	 */
	fieldId: FieldId;
	change1: FieldChangeset;
	change2: FieldChangeset;
	composedChange: FieldChange;
}

/**
 */
interface ConstraintState {
	violationCount: number;
}

function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
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
		newAttachId: ChangeAtomId,
	): void {
		if (!areEqualChangeAtomIds(detachId, newAttachId)) {
			this.table.attachToDetachId.set(newAttachId, count, detachId);
		}

		if (nodeChange !== undefined) {
			assert(count === 1, "A node change should only affect one node");

			const attachEntry = firstAttachIdFromDetachId(
				this.table.change.rootNodes,
				detachId,
				count,
			);

			const attachFieldEntry = this.table.change.crossFieldKeys.getFirst(
				{ target: CrossFieldTarget.Destination, ...attachEntry.value },
				count,
			);

			if (attachFieldEntry.value !== undefined) {
				setInCrossFieldMap(this.table.entries, attachEntry.value, count, nodeChange);
				this.table.invalidatedFields.add(
					fieldChangeFromId(this.table.change, attachFieldEntry.value),
				);
			} else {
				setInChangeAtomIdMap(
					this.table.invertedRoots.nodeChanges,
					attachEntry.value,
					nodeChange,
				);
			}
		}
	}

	public invertAttach(
		attachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId,
	): RangeQueryResult<ChangeAtomId, NodeId> {
		let countToProcess = count;

		const detachIdEntry = firstDetachIdFromAttachId(
			this.table.change.rootNodes,
			attachId,
			countToProcess,
		);

		countToProcess = detachIdEntry.length;

		if (!areEqualChangeAtomIdOpts(attachId, newDetachId)) {
			const detachEntry = this.table.change.crossFieldKeys.getFirst(
				{ target: CrossFieldTarget.Source, ...detachIdEntry.value },
				countToProcess,
			);

			countToProcess = detachEntry.length;

			if (detachEntry.value === undefined) {
				// The original changeset does not reattach these nodes, and we can discard any existing renames.
				deleteNodeRename(this.table.invertedRoots, attachId, countToProcess);
			} else {
				// The original changeset moves these nodes.
				// If the original changeset has a rename between the detach and the attach,
				// we need to make sure that the inverted attach and detach are still linked by a rename.
				this.table.detachToAttachId.set(newDetachId, countToProcess, attachId);
			}
		}

		const nodeIdEntry = rangeQueryChangeAtomIdMap(
			this.table.change.rootNodes.nodeChanges,
			detachIdEntry.value,
			countToProcess,
		);

		countToProcess = nodeIdEntry.length;

		const result: RangeQueryResult<ChangeAtomId, NodeId> =
			nodeIdEntry.value !== undefined
				? { start: attachId, value: nodeIdEntry.value, length: countToProcess }
				: this.table.entries.getFirst(attachId, countToProcess);

		if (result.value !== undefined) {
			setInChangeAtomIdMap(this.table.invertedNodeToParent, result.value, {
				field: this.fieldId,
			});
		}
		return result;
	}
}

class RebaseNodeManagerI implements RebaseNodeManager {
	public constructor(
		private readonly table: RebaseTable,
		private readonly fieldId: FieldId,
		private readonly allowInval: boolean = true,
	) {}

	public getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry> {
		let countToProcess = count;
		const baseRenameEntry = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			countToProcess,
		);

		countToProcess = baseRenameEntry.length;

		const nodeEntry = rangeQueryChangeAtomIdMap(
			this.table.newChange.rootNodes.nodeChanges,
			baseRenameEntry.value,
			countToProcess,
		);

		this.table.rebasedRootNodes.nodeChanges.delete([
			baseRenameEntry.value.revision,
			baseRenameEntry.value.localId,
		]);

		countToProcess = nodeEntry.length;
		const newNodeId = nodeEntry.value;

		const detachEntry = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			countToProcess,
		);

		countToProcess = detachEntry.length;
		const newRenameEntry = this.table.newChange.rootNodes.oldToNewId.getFirst(
			detachEntry.value,
			countToProcess,
		);

		countToProcess = newRenameEntry.length;

		let result: RangeQueryResult<ChangeAtomId, DetachedNodeEntry>;
		// eslint-disable-next-line unicorn/prefer-ternary
		if (newNodeId !== undefined || newRenameEntry.value !== undefined) {
			result = {
				...newRenameEntry,
				value: { detachId: newRenameEntry.value, nodeChange: newNodeId },
			};
		} else {
			// This handles the case where the base changeset has moved these nodes,
			// meaning they were attached in the input context of the base changeset.
			result = this.table.entries.getFirst(baseAttachId, countToProcess);
		}

		// TODO: Consider moving these two checks into a separate method so that this function has no side effects.
		if (result.value?.detachId !== undefined) {
			this.table.rebasedDetachLocations.set(
				result.value.detachId,
				result.length,
				this.fieldId,
			);
		}

		if (result.value?.nodeChange !== undefined) {
			setInChangeAtomIdMap(this.table.rebasedNodeToParent, result.value.nodeChange, {
				field: this.fieldId,
			});
		}

		return result;
	}

	public rebaseOverDetach(
		baseDetachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId | undefined,
		nodeChange: NodeId | undefined,
	): void {
		let countToProcess = count;
		const attachIdEntry = firstAttachIdFromDetachId(this.table.baseRoots, baseDetachId, count);
		const baseAttachId = attachIdEntry.value;
		countToProcess = attachIdEntry.length;

		const attachFieldEntry = getFirstFieldForCrossFieldKey(
			this.table.baseChange,
			{ ...attachIdEntry.value, target: CrossFieldTarget.Destination },
			count,
		);

		countToProcess = attachFieldEntry.length;

		if (attachFieldEntry.value !== undefined) {
			// The base detach is part of a move in the base changeset.
			setInCrossFieldMap(this.table.entries, baseAttachId, countToProcess, {
				nodeChange,
				detachId: newDetachId,
			});

			if (nodeChange !== undefined || newDetachId !== undefined) {
				this.invalidateBaseFields([attachFieldEntry.value]);
			}
		} else {
			if (nodeChange !== undefined) {
				setInChangeAtomIdMap(
					this.table.rebasedRootNodes.nodeChanges,
					baseAttachId,
					nodeChange,
				);

				setInChangeAtomIdMap(this.table.rebasedNodeToParent, nodeChange, {
					root: baseAttachId,
				});
			}

			if (newDetachId !== undefined) {
				renameNodes(
					this.table.rebasedRootNodes,
					baseAttachId,
					newDetachId,
					countToProcess,
					this.table.newChange.rootNodes.newToOldId,
					this.table.newChange.rootNodes.oldToNewId,
				);
			}
		}

		if (newDetachId !== undefined) {
			this.table.movedDetaches.set(newDetachId, count, true);
		}

		if (countToProcess < count) {
			const remainingCount = count - countToProcess;

			const nextDetachId =
				newDetachId !== undefined
					? offsetChangeAtomId(newDetachId, remainingCount)
					: undefined;

			this.rebaseOverDetach(
				offsetChangeAtomId(baseDetachId, remainingCount),
				remainingCount,
				nextDetachId,
				nodeChange,
			);
		}
	}

	public areSameRenamedNodes(
		baseId: ChangeAtomId,
		newId: ChangeAtomId,
		count: number = 1,
	): boolean {
		const oldIdFromBaseChange = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseId,
			count,
		);
		const oldIdFromNewChange = firstDetachIdFromAttachId(
			this.table.newChange.rootNodes,
			newId,
			count,
		);
		if (!areEqualChangeAtomIdOpts(oldIdFromBaseChange.value, oldIdFromNewChange.value)) {
			return false;
		}
		const minCount = Math.min(oldIdFromBaseChange.length, oldIdFromNewChange.length);
		if (minCount < count) {
			return this.areSameRenamedNodes(
				offsetChangeAtomId(baseId, minCount),
				offsetChangeAtomId(baseId, minCount),
				count - minCount,
			);
		}
		return true;
	}

	private invalidateBaseFields(fields: FieldId[]): void {
		if (this.allowInval) {
			for (const fieldId of fields) {
				this.table.affectedBaseFields.set(fieldIdKeyFromFieldId(fieldId), true);
			}
		}
	}
}

class ComposeNodeManagerI implements ComposeNodeManager {
	public constructor(
		private readonly table: ComposeTable,
		private readonly fieldId: FieldId,
		private readonly allowInval: boolean = true,
	) {}

	public getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId> {
		let countToProcess = count;
		const baseRenameEntry = firstAttachIdFromDetachId(
			this.table.baseChange.rootNodes,
			baseDetachId,
			count,
		);

		countToProcess = baseRenameEntry.length;

		// XXX: Do we need to dealias whenever pulling node IDs out of the root node table?
		const detachedNodeEntry = rangeQueryChangeAtomIdMap(
			this.table.newChange.rootNodes.nodeChanges,
			baseRenameEntry.value,
			countToProcess,
		);

		countToProcess = detachedNodeEntry.length;

		let result: RangeQueryResult<ChangeAtomId, NodeId>;
		if (detachedNodeEntry.value !== undefined) {
			result = detachedNodeEntry;
		} else {
			// The base detach might be part of a move.
			// We check if we've previously seen a node change at the move destination.
			const entry = this.table.entries.getFirst(baseDetachId, countToProcess);
			result = { ...entry, value: entry.value };
		}

		// TODO: Consider moving this to a separate method so that this method can be side-effect free.
		if (result.value !== undefined) {
			setInChangeAtomIdMap(this.table.movedNodeToParent, result.value, {
				field: this.fieldId,
			});
		}
		return result;
	}

	public composeAttachDetach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId,
		count: number,
	): void {
		renameNodes(
			this.table.composedRootNodes,
			baseAttachId,
			newDetachId,
			count,
			this.table.baseChange.rootNodes.newToOldId,
			this.table.newChange.rootNodes.oldToNewId,
		);

		this.table.composedCrossFieldKeys.delete(
			{ ...baseAttachId, target: CrossFieldTarget.Destination },
			count,
		);

		this.table.composedCrossFieldKeys.delete(
			{ ...newDetachId, target: CrossFieldTarget.Source },
			count,
		);

		let countToProcess = count;
		let currBaseAttachId = baseAttachId;
		while (countToProcess > 0) {
			const detachIdEntry = firstDetachIdFromAttachId(
				this.table.baseChange.rootNodes,
				currBaseAttachId,
				countToProcess,
			);

			const detachFields = getFieldsForCrossFieldKey(
				this.table.baseChange,
				{
					...detachIdEntry.value,
					target: CrossFieldTarget.Source,
				},
				detachIdEntry.length,
			);

			// We invalidate the detach location even if there are no new changes because adding the rename entry
			// may affect the result of `composeDetachAttach` at that location.
			this.invalidateBaseFields(detachFields);

			countToProcess -= detachIdEntry.length;
			currBaseAttachId = offsetChangeAtomId(currBaseAttachId, detachIdEntry.length);
		}
	}

	public sendNewChangesToBaseSourceLocation(
		baseAttachId: ChangeAtomId,
		newChanges: NodeId,
	): void {
		const { value: baseDetachId } = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			1,
		);

		const detachFields = getFieldsForCrossFieldKey(
			this.table.baseChange,
			{
				...baseDetachId,
				target: CrossFieldTarget.Source,
			},
			1,
		);

		if (newChanges !== undefined) {
			if (detachFields.length > 0) {
				// The base attach is part of a move in the base changeset.
				setInCrossFieldMap(this.table.entries, baseDetachId, 1, newChanges);
			} else {
				const baseNodeId = getFromChangeAtomIdMap(
					this.table.baseChange.rootNodes.nodeChanges,
					baseDetachId,
				);

				if (baseNodeId !== undefined) {
					this.table.pendingCompositions.nodeIdsToCompose.push([baseNodeId, newChanges]);
				} else {
					setInChangeAtomIdMap(
						this.table.composedRootNodes.nodeChanges,
						baseDetachId,
						newChanges,
					);

					setInChangeAtomIdMap(this.table.movedNodeToParent, newChanges, {
						root: baseDetachId,
					});
				}
			}
		}
		// We invalidate the detach location even if there are no new changes because adding the rename entry
		// may affect the result of `composeDetachAttach` at that location.
		this.invalidateBaseFields(detachFields);
	}

	// XXX: Consider merging this with `getNewChangesForBaseDetach`
	public composeDetachAttach(
		baseDetachId: ChangeAtomId,
		newAttachId: ChangeAtomId,
		count: number,
		preserveRename: boolean,
	): boolean {
		const renamedDetachEntry = firstAttachIdFromDetachId(
			this.table.composedRootNodes,
			baseDetachId,
			count,
		);

		assert(renamedDetachEntry.length === count, "TODO: Handle splitting");
		const isReattachOfSameNodes = areEqualChangeAtomIds(renamedDetachEntry.value, newAttachId);
		if (isReattachOfSameNodes && !preserveRename) {
			// These nodes have been moved back to their original location, so the composed changeset should not have any renames for them.
			// Note that deleting the rename from `this.table.composedRootNodes` would change the result of this method
			// if it were rerun due to the field being invalidated, so we instead record that the rename should be deleted later.
			this.table.renamesToDelete.set(baseDetachId, count, true);
		}

		return isReattachOfSameNodes;
	}

	private invalidateBaseFields(fields: FieldId[]): void {
		if (this.allowInval) {
			for (const fieldId of fields) {
				this.table.pendingCompositions.affectedBaseFields.set(
					fieldIdKeyFromFieldId(fieldId),
					true,
				);
			}
		}
	}
}

function makeModularChangeset(
	props: {
		fieldChanges?: FieldChangeMap;
		nodeChanges?: ChangeAtomIdBTree<NodeChangeset>;
		rootNodes?: RootNodeTable;
		nodeToParent?: ChangeAtomIdBTree<NodeLocation>;
		nodeAliases?: ChangeAtomIdBTree<NodeId>;
		crossFieldKeys?: CrossFieldKeyTable;
		maxId: number;
		revisions?: readonly RevisionInfo[];
		constraintViolationCount?: number;
		constraintViolationCountOnRevert?: number;
		builds?: ChangeAtomIdBTree<TreeChunk>;
		destroys?: ChangeAtomIdBTree<number>;
		refreshers?: ChangeAtomIdBTree<TreeChunk>;
	} = {
		maxId: -1,
	},
): ModularChangeset {
	const changeset: Mutable<ModularChangeset> = {
		fieldChanges: props.fieldChanges ?? new Map(),
		nodeChanges: props.nodeChanges ?? newTupleBTree(),
		rootNodes: props.rootNodes ?? newRootTable(),
		nodeToParent: props.nodeToParent ?? newTupleBTree(),
		nodeAliases: props.nodeAliases ?? newTupleBTree(),
		crossFieldKeys: props.crossFieldKeys ?? newCrossFieldRangeTable(),
	};

	if (props.revisions !== undefined && props.revisions.length > 0) {
		changeset.revisions = props.revisions;
	}
	if (props.maxId >= 0) {
		changeset.maxId = brand(props.maxId);
	}
	if (props.constraintViolationCount !== undefined && props.constraintViolationCount > 0) {
		changeset.constraintViolationCount = props.constraintViolationCount;
	}
	if (
		props.constraintViolationCountOnRevert !== undefined &&
		props.constraintViolationCountOnRevert > 0
	) {
		changeset.constraintViolationCountOnRevert = props.constraintViolationCountOnRevert;
	}
	if (props.builds !== undefined && props.builds.size > 0) {
		changeset.builds = props.builds;
	}
	if (props.destroys !== undefined && props.destroys.size > 0) {
		changeset.destroys = props.destroys;
	}
	if (props.refreshers !== undefined && props.refreshers.size > 0) {
		changeset.refreshers = props.refreshers;
	}
	return changeset;
}

export class ModularEditBuilder extends EditBuilder<ModularChangeset> {
	private transactionDepth: number = 0;
	private idAllocator: IdAllocator;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, ModularChangeset>,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		changeReceiver: (change: TaggedChange<ModularChangeset>) => void,
	) {
		super(family, changeReceiver);
		this.idAllocator = idAllocatorFromMaxId();
	}

	public override enterTransaction(): void {
		this.transactionDepth += 1;
		if (this.transactionDepth === 1) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	public override exitTransaction(): void {
		assert(this.transactionDepth > 0, 0x5b9 /* Cannot exit inexistent transaction */);
		this.transactionDepth -= 1;
		if (this.transactionDepth === 0) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	/**
	 * @param firstId - The ID to associate with the first node
	 * @param content - The node(s) to build.
	 * @param revision - The revision to use for the build.
	 * @returns A description of the edit that can be passed to `submitChanges`.
	 * The returned object may contain an owning reference to the given TreeChunk.
	 */
	public buildTrees(
		firstId: ChangesetLocalId,
		content: TreeChunk,
		revision: RevisionTag,
	): GlobalEditDescription {
		if (content.topLevelLength === 0) {
			return { type: "global", revision };
		}

		// This content will be added to a GlobalEditDescription whose lifetime exceeds the scope of this function.
		content.referenceAdded();

		const builds: ChangeAtomIdBTree<TreeChunk> = newTupleBTree();
		builds.set([revision, firstId], content);

		return {
			type: "global",
			builds,
			revision,
		};
	}

	/**
	 * Adds a change to the edit builder
	 * @param field - the field which is being edited
	 * @param fieldKind - the kind of the field
	 * @param change - the change to the field
	 * @param revision - the revision of the change
	 */
	public submitChange(
		field: NormalizedFieldUpPath,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
		revision: RevisionTag,
	): void {
		const localCrossFieldKeys = getChangeHandler(this.fieldKinds, fieldKind).getCrossFieldKeys(
			change,
		);

		const modularChange = buildModularChangesetFromField({
			path: field,
			fieldChange: { fieldKind, change },
			nodeChanges: newTupleBTree(),
			nodeToParent: newTupleBTree(),
			crossFieldKeys: newCrossFieldRangeTable(),
			idAllocator: this.idAllocator,
			localCrossFieldKeys,
			revision,
		});
		this.applyChange(tagChange(modularChange, revision));
	}

	public submitChanges(changes: EditDescription[], revision: RevisionTag): void {
		const modularChange = this.buildChanges(changes);
		this.applyChange(tagChange(modularChange, revision));
	}

	public buildChanges(changes: EditDescription[]): ModularChangeset {
		const revisions: Set<RevisionTag> = new Set();
		const changeMaps = changes.map((change) => {
			revisions.add(change.revision);
			return makeAnonChange(
				change.type === "global"
					? makeModularChangeset({
							maxId: this.idAllocator.getMaxId(),
							builds: change.builds,
							rootNodes: renameTableFromRenameDescriptions(change.renames ?? []),
							revisions: [{ revision: change.revision }],
						})
					: buildModularChangesetFromField({
							path: change.field,
							fieldChange: {
								fieldKind: change.fieldKind,
								change: change.change,
							},
							nodeChanges: newTupleBTree(),
							nodeToParent: newTupleBTree(),
							crossFieldKeys: newCrossFieldRangeTable(),
							idAllocator: this.idAllocator,
							localCrossFieldKeys: getChangeHandler(
								this.fieldKinds,
								change.fieldKind,
							).getCrossFieldKeys(change.change),
							revision: change.revision,
						}),
			);
		});
		const revInfo = Array.from(revisions).map((revision) => ({ revision }));
		const composedChange: Mutable<ModularChangeset> = {
			...this.changeFamily.rebaser.compose(changeMaps),
			revisions: revInfo,
		};

		const maxId: ChangesetLocalId = brand(this.idAllocator.getMaxId());
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		return composedChange;
	}

	public generateId(count?: number): ChangesetLocalId {
		return brand(this.idAllocator.allocate(count));
	}

	public addNodeExistsConstraint(path: NormalizedUpPath, revision: RevisionTag): void {
		const nodeChange: NodeChangeset = {
			nodeExistsConstraint: { violated: false },
		};

		this.applyChange(
			tagChange(
				buildModularChangesetFromNode({
					path,
					nodeChange,
					nodeChanges: newTupleBTree(),
					nodeToParent: newTupleBTree(),
					crossFieldKeys: newCrossFieldRangeTable(),
					idAllocator: this.idAllocator,
					revision,
				}),
				revision,
			),
		);
	}

	public addNodeExistsConstraintOnRevert(path: NormalizedUpPath, revision: RevisionTag): void {
		const nodeChange: NodeChangeset = {
			nodeExistsConstraintOnRevert: { violated: false },
		};

		this.applyChange(
			tagChange(
				buildModularChangesetFromNode({
					path,
					nodeChange,
					nodeChanges: newTupleBTree(),
					nodeToParent: newTupleBTree(),
					crossFieldKeys: newCrossFieldRangeTable(),
					idAllocator: this.idAllocator,
					revision,
				}),
				revision,
			),
		);
	}
}

export function buildModularChangesetFromField(props: {
	path: NormalizedFieldUpPath;
	fieldChange: FieldChange;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<NodeLocation>;
	crossFieldKeys: CrossFieldKeyTable;
	localCrossFieldKeys?: CrossFieldKeyRange[];
	revision: RevisionTag;
	idAllocator?: IdAllocator;
	childId?: NodeId;
}): ModularChangeset {
	const {
		path,
		fieldChange,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator = idAllocatorFromMaxId(),
		localCrossFieldKeys = [],
		childId,
		revision,
	} = props;
	const fieldChanges: FieldChangeMap = new Map([[path.field, fieldChange]]);

	if (path.parent === undefined) {
		for (const { key, count } of localCrossFieldKeys) {
			crossFieldKeys.set(key, count, { nodeId: undefined, field: path.field });
		}

		if (childId !== undefined) {
			setInChangeAtomIdMap(nodeToParent, childId, {
				field: {
					nodeId: undefined,
					field: path.field,
				},
			});
		}

		return makeModularChangeset({
			fieldChanges,
			nodeChanges,
			nodeToParent,
			crossFieldKeys,
			maxId: idAllocator.getMaxId(),
			revisions: [{ revision }],
		});
	}

	const nodeChangeset: NodeChangeset = {
		fieldChanges,
	};

	const parentId: NodeId = { localId: brand(idAllocator.allocate()), revision };

	for (const { key, count } of localCrossFieldKeys) {
		crossFieldKeys.set(key, count, { nodeId: parentId, field: path.field });
	}

	if (childId !== undefined) {
		setInChangeAtomIdMap(nodeToParent, childId, {
			field: {
				nodeId: parentId,
				field: path.field,
			},
		});
	}

	return buildModularChangesetFromNode({
		path: path.parent,
		nodeChange: nodeChangeset,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
		revision,
		nodeId: parentId,
	});
}

function buildModularChangesetFromNode(props: {
	path: NormalizedUpPath;
	nodeChange: NodeChangeset;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<NodeLocation>;
	crossFieldKeys: CrossFieldKeyTable;
	idAllocator: IdAllocator;
	revision: RevisionTag;
	nodeId?: NodeId;
}): ModularChangeset {
	const {
		path,
		nodeId = { localId: brand(props.idAllocator.allocate()), revision: props.revision },
	} = props;
	setInChangeAtomIdMap(props.nodeChanges, nodeId, props.nodeChange);

	if (isDetachedUpPathRoot(path)) {
		const rootNodes = newRootTable();
		rootNodes.nodeChanges.set(
			[path.detachedNodeId.major, brand(path.detachedNodeId.minor)],
			nodeId,
		);
		return makeModularChangeset({
			rootNodes,
			nodeChanges: props.nodeChanges,
			nodeToParent: props.nodeToParent,
			crossFieldKeys: props.crossFieldKeys,
			maxId: props.idAllocator.getMaxId(),
			revisions: [{ revision: props.revision }],
		});
	} else {
		const fieldChangeset = genericFieldKind.changeHandler.editor.buildChildChanges([
			[path.parentIndex, nodeId],
		]);

		const fieldChange: FieldChange = {
			fieldKind: genericFieldKind.identifier,
			change: fieldChangeset,
		};

		return buildModularChangesetFromField({
			...props,
			path: { parent: path.parent, field: path.parentField },
			fieldChange,
			localCrossFieldKeys: [],
			childId: nodeId,
		});
	}
}

/**
 */
export interface FieldEditDescription {
	type: "field";
	field: NormalizedFieldUpPath;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
	revision: RevisionTag;
}

/**
 */
export interface GlobalEditDescription {
	type: "global";
	revision: RevisionTag;
	builds?: ChangeAtomIdBTree<TreeChunk>;
	renames?: RenameDescription[];
}

export interface RenameDescription {
	count: number;
	oldId: ChangeAtomId;
	newId: ChangeAtomId;
}

function renameTableFromRenameDescriptions(renames: RenameDescription[]): RootNodeTable {
	const table = newRootTable();
	for (const rename of renames) {
		renameNodes(table, rename.oldId, rename.newId, rename.count);
	}

	return table;
}

/**
 */
export type EditDescription = FieldEditDescription | GlobalEditDescription;

function getRevInfoFromTaggedChanges(changes: TaggedChange<ModularChangeset>[]): {
	revInfos: RevisionInfo[];
	maxId: ChangesetLocalId;
} {
	let maxId = -1;
	const revInfos: RevisionInfo[] = [];
	for (const taggedChange of changes) {
		const change = taggedChange.change;
		maxId = Math.max(change.maxId ?? -1, maxId);
		revInfos.push(...revisionInfoFromTaggedChange(taggedChange));
	}

	return { maxId: brand(maxId), revInfos };
}

function revisionInfoFromTaggedChange(
	taggedChange: TaggedChange<ModularChangeset>,
): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	if (taggedChange.change.revisions !== undefined) {
		revInfos.push(...taggedChange.change.revisions);
	} else if (taggedChange.revision !== undefined) {
		const info: Mutable<RevisionInfo> = { revision: taggedChange.revision };
		if (taggedChange.rollbackOf !== undefined) {
			info.rollbackOf = taggedChange.rollbackOf;
		}
		revInfos.push(info);
	}
	return revInfos;
}

function fieldChangeFromId(change: ModularChangeset, id: FieldId): FieldChange {
	const fieldId = normalizeFieldId(id, change.nodeAliases);
	const fieldMap = fieldMapFromNodeId(change.fieldChanges, change.nodeChanges, fieldId.nodeId);
	return fieldMap.get(id.field) ?? fail(0xb25 /* No field exists for the given ID */);
}

function fieldMapFromNodeId(
	rootFieldMap: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeId: NodeId | undefined,
): FieldChangeMap {
	if (nodeId === undefined) {
		return rootFieldMap;
	}

	const node = nodeChangeFromId(nodes, nodeId);
	assert(node.fieldChanges !== undefined, 0x9c9 /* Expected node to have field changes */);
	return node.fieldChanges;
}

function rebasedFieldIdFromBaseId(table: RebaseTable, baseId: FieldId): FieldId {
	if (baseId.nodeId === undefined) {
		return baseId;
	}

	return { ...baseId, nodeId: rebasedNodeIdFromBaseNodeId(table, baseId.nodeId) };
}

function rebasedNodeIdFromBaseNodeId(table: RebaseTable, baseId: NodeId): NodeId {
	return getFromChangeAtomIdMap(table.baseToRebasedNodeId, baseId) ?? baseId;
}

function nodeChangeFromId(nodes: ChangeAtomIdBTree<NodeChangeset>, id: NodeId): NodeChangeset {
	const node = getFromChangeAtomIdMap(nodes, id);
	assert(node !== undefined, 0x9ca /* Unknown node ID */);
	return node;
}

function fieldIdFromFieldIdKey([revision, localId, field]: FieldIdKey): FieldId {
	const nodeId = localId !== undefined ? { revision, localId } : undefined;
	return { nodeId, field };
}

function fieldIdKeyFromFieldId(fieldId: FieldId): FieldIdKey {
	return [fieldId.nodeId?.revision, fieldId.nodeId?.localId, fieldId.field];
}

function cloneNodeChangeset(nodeChangeset: NodeChangeset): NodeChangeset {
	if (nodeChangeset.fieldChanges !== undefined) {
		return { ...nodeChangeset, fieldChanges: new Map(nodeChangeset.fieldChanges) };
	}

	return { ...nodeChangeset };
}

function replaceNodeLocationRevision(
	location: NodeLocation,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): NodeLocation {
	return location.field !== undefined
		? { field: replaceFieldIdRevision(location.field, oldRevisions, newRevision) }
		: { root: replaceAtomRevisions(location.root, oldRevisions, newRevision) };
}

function replaceFieldIdRevision(
	fieldId: FieldId,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): FieldId {
	if (fieldId.nodeId === undefined) {
		return fieldId;
	}

	return {
		...fieldId,
		nodeId: replaceAtomRevisions(fieldId.nodeId, oldRevisions, newRevision),
	};
}

export function getNodeParent(changeset: ModularChangeset, nodeId: NodeId): NodeLocation {
	const location = getFromChangeAtomIdMap(changeset.nodeToParent, nodeId);
	assert(location !== undefined, 0x9cb /* Parent field should be defined */);

	if (location.field !== undefined) {
		return { field: normalizeFieldId(location.field, changeset.nodeAliases) };
	}

	return location;
}

function getFieldsForCrossFieldKey(
	changeset: ModularChangeset,
	key: CrossFieldKey,
	count: number,
): FieldId[] {
	return changeset.crossFieldKeys
		.getAll(key, count)
		.map(({ value: fieldId }) => normalizeFieldId(fieldId, changeset.nodeAliases));
}

function getFirstFieldForCrossFieldKey(
	changeset: ModularChangeset,
	key: CrossFieldKey,
	count: number,
): RangeQueryResult<CrossFieldKey, FieldId> {
	const result = changeset.crossFieldKeys.getFirst(key, count);
	if (result.value === undefined) {
		return result;
	}

	return { ...result, value: normalizeFieldId(result.value, changeset.nodeAliases) };
}

function normalizeNodeLocation(
	location: NodeLocation,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): NodeLocation {
	if (location.field !== undefined) {
		return { field: normalizeFieldId(location.field, nodeAliases) };
	}

	return location;
}

// This is only exported for use in test utilities.
export function normalizeFieldId(
	fieldId: FieldId,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): FieldId {
	return fieldId.nodeId !== undefined
		? { ...fieldId, nodeId: normalizeNodeId(fieldId.nodeId, nodeAliases) }
		: fieldId;
}

/**
 * @returns The canonical form of nodeId, according to nodeAliases
 */
function normalizeNodeId(nodeId: NodeId, nodeAliases: ChangeAtomIdBTree<NodeId>): NodeId {
	let currentId = nodeId;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}

		currentId = dealiased;
	}
}

function hasConflicts(change: ModularChangeset): boolean {
	return (change.constraintViolationCount ?? 0) > 0;
}

interface ModularChangesetContent {
	fieldChanges: FieldChangeMap;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<NodeLocation>;
	rootNodes: RootNodeTable;
	nodeAliases: ChangeAtomIdBTree<NodeId>;
	crossFieldKeys: CrossFieldKeyTable;
}

function getFromChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
): T | undefined {
	return map.get([id.revision, id.localId]);
}

function rangeQueryChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId, T> {
	const pair = map.getPairOrNextHigher([id.revision, id.localId]);
	if (pair === undefined) {
		return { start: id, value: undefined, length: count };
	}

	const [[revision, localId], value] = pair;
	const lengthBefore = subtractChangeAtomIds({ revision, localId }, id);
	if (lengthBefore === 0) {
		return { start: id, value, length: 1 };
	}

	return { start: id, value: undefined, length: Math.min(lengthBefore, count) };
}

export function setInChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
	value: T,
): void {
	map.set([id.revision, id.localId], value);
}

function areEqualFieldIds(a: FieldId, b: FieldId): boolean {
	return areEqualChangeAtomIdOpts(a.nodeId, b.nodeId) && a.field === b.field;
}

function firstAttachIdFromDetachId(
	roots: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryEntry<ChangeAtomId, ChangeAtomId> {
	const result = roots.oldToNewId.getFirst(detachId, count);
	return { ...result, value: result.value ?? detachId };
}

function firstDetachIdFromAttachId(
	roots: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryEntry<ChangeAtomId, ChangeAtomId> {
	const result = roots.newToOldId.getFirst(attachId, count);
	return { ...result, value: result.value ?? attachId };
}

function rebaseCrossFieldKeys(
	sourceTable: CrossFieldKeyTable,
	movedDetaches: ChangeAtomIdRangeMap<boolean>,
	newDetachLocations: ChangeAtomIdRangeMap<FieldId>,
): CrossFieldKeyTable {
	const rebasedTable = sourceTable.clone();
	for (const entry of movedDetaches.entries()) {
		rebasedTable.delete({ ...entry.start, target: CrossFieldTarget.Source }, entry.length);
	}

	for (const entry of newDetachLocations.entries()) {
		rebasedTable.set(
			{ ...entry.start, target: CrossFieldTarget.Source },
			entry.length,
			entry.value,
		);
	}

	return rebasedTable;
}

export function newRootTable(): RootNodeTable {
	return {
		newToOldId: newChangeAtomIdTransform(),
		oldToNewId: newChangeAtomIdTransform(),
		nodeChanges: newTupleBTree(),
	};
}

function rebaseRoots(
	change: ModularChangeset,
	base: ModularChangeset,
	affectedBaseFields: TupleBTree<FieldIdKey, boolean>,
	nodesToRebase: [newChangeset: NodeId, baseChangeset: NodeId][],
): RootNodeTable {
	const rebasedRoots = cloneRootTable(change.rootNodes);
	for (const renameEntry of change.rootNodes.oldToNewId.entries()) {
		rebaseRename(rebasedRoots, renameEntry, base, affectedBaseFields);
	}

	for (const [detachId, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const changes = base.rootNodes.nodeChanges.get(detachId);
		if (changes !== undefined) {
			nodesToRebase.push([nodeId, changes]);
		}
		const attachId = firstAttachIdFromDetachId(
			base.rootNodes,
			makeChangeAtomId(detachId[1], detachId[0]),
			1,
		).value;
		const result = base.crossFieldKeys.getFirst(
			{ target: CrossFieldTarget.Destination, ...attachId },
			1,
		);
		if (result.value !== undefined) {
			affectedBaseFields.set(fieldIdKeyFromFieldId(result.value), true);
		} else {
			setInChangeAtomIdMap(rebasedRoots.nodeChanges, attachId, nodeId);
		}
	}
	return rebasedRoots;
}

function rebaseRename(
	rebasedRoots: RootNodeTable,
	renameEntry: RangeQueryEntry<ChangeAtomId, ChangeAtomId>,
	base: ModularChangeset,
	affectedBaseFields: TupleBTree<FieldIdKey, boolean>,
): void {
	let count = renameEntry.length;
	const baseRenameEntry = firstAttachIdFromDetachId(base.rootNodes, renameEntry.start, count);
	count = baseRenameEntry.length;

	const baseAttachEntry = base.crossFieldKeys.getFirst(
		{
			...(baseRenameEntry.value ?? renameEntry.start),
			target: CrossFieldTarget.Destination,
		},
		count,
	);

	count = baseAttachEntry.length;

	if (baseAttachEntry.value !== undefined) {
		deleteNodeRename(rebasedRoots, baseRenameEntry.start, count);

		// This rename represents an intention to detach these nodes.
		// The rebased change should have a detach in the field where the base change attaches the nodes,
		// so we need to ensure that field is processed.
		affectedBaseFields.set(fieldIdKeyFromFieldId(baseAttachEntry.value), true);
	} else if (baseRenameEntry.value !== undefined) {
		deleteNodeRename(rebasedRoots, baseRenameEntry.start, count);
		renameNodes(rebasedRoots, baseRenameEntry.value, renameEntry.value, count);
	}

	const countRemaining = renameEntry.length - count;
	if (countRemaining > 0) {
		rebaseRename(
			rebasedRoots,
			{
				start: offsetChangeAtomId(renameEntry.start, count),
				value: offsetChangeAtomId(renameEntry.value, count),
				length: countRemaining,
			},
			base,
			affectedBaseFields,
		);
	}
}

function composeRootTables(
	change1: ModularChangeset,
	change2: ModularChangeset,
	pendingCompositions: PendingCompositions,
): RootNodeTable {
	const mergedTable = cloneRootTable(change1.rootNodes);
	for (const entry of change2.rootNodes.oldToNewId.entries()) {
		renameNodes(
			mergedTable,
			entry.start,
			entry.value,
			entry.length,
			change1.rootNodes.newToOldId,
		);
	}

	for (const [[revision2, id2], nodeId2] of change2.rootNodes.nodeChanges.entries()) {
		const detachId2 = { revision: revision2, localId: id2 };
		const detachId1 = firstDetachIdFromAttachId(change1.rootNodes, detachId2, 1).value;
		const nodeId1 = getFromChangeAtomIdMap(change1.rootNodes.nodeChanges, detachId1);

		if (nodeId1 !== undefined) {
			pendingCompositions.nodeIdsToCompose.push([nodeId1, nodeId2]);
		} else {
			const fieldId = getFieldsForCrossFieldKey(
				change1,
				{ ...detachId1, target: CrossFieldTarget.Source },
				1,
			)[0];

			if (fieldId !== undefined) {
				// In this case, this node is attached in the input context of change1,
				// and is represented in detachFieldId.
				pendingCompositions.affectedBaseFields.set(
					[fieldId.nodeId?.revision, fieldId.nodeId?.localId, fieldId.field],
					true,
				);
			} else {
				setInChangeAtomIdMap(mergedTable.nodeChanges, detachId1, nodeId2);
			}
		}
	}

	return mergedTable;
}

function cloneRootTable(table: RootNodeTable): RootNodeTable {
	return {
		oldToNewId: table.oldToNewId.clone(),
		newToOldId: table.newToOldId.clone(),
		nodeChanges: brand(table.nodeChanges.clone()),
	};
}

function invertRootTable(change: ModularChangeset): RootNodeTable {
	const invertedNodeChanges: ChangeAtomIdBTree<NodeId> = newTupleBTree();
	for (const [[revision, localId], nodeId] of change.rootNodes.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision, localId };
		const renamedId = firstAttachIdFromDetachId(change.rootNodes, detachId, 1).value;

		// This checks whether `change` attaches this node.
		// If it does, the node is not detached in the input context of the inverse, and so should not be included in the root table.
		if (
			change.crossFieldKeys.getAll({ ...renamedId, target: CrossFieldTarget.Destination }, 1)
				.length === 0
		) {
			setInChangeAtomIdMap(invertedNodeChanges, renamedId, nodeId);
		}
	}

	return {
		oldToNewId: change.rootNodes.newToOldId.clone(),
		newToOldId: change.rootNodes.oldToNewId.clone(),
		nodeChanges: invertedNodeChanges,
	};
}

export function renameNodes(
	table: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
	newToOldIds?: ChangeAtomIdRangeMap<ChangeAtomId>,
	oldToNewIds?: ChangeAtomIdRangeMap<ChangeAtomId>,
): void {
	const oldEntry = newToOldIds?.getFirst(oldId, count);
	const newEntry = oldToNewIds?.getFirst(newId, count);
	const countToRename = Math.min(newEntry?.length ?? count, oldEntry?.length ?? count);

	let adjustedOldId = oldId;
	if (oldEntry?.value !== undefined) {
		adjustedOldId = oldEntry.value;
		deleteNodeRenameEntry(table, oldEntry.value, oldId, countToRename);
	}

	let adjustedNewId = newId;
	if (newEntry?.value !== undefined) {
		adjustedNewId = newEntry.value;
		deleteNodeRenameEntry(table, newId, newEntry.value, countToRename);
	}

	if (!areEqualChangeAtomIdOpts(adjustedOldId, adjustedNewId)) {
		setNodeRenameEntry(table, adjustedOldId, adjustedNewId, countToRename);
	}

	if (countToRename < count) {
		renameNodes(
			table,
			offsetChangeAtomId(oldId, countToRename),
			offsetChangeAtomId(newId, countToRename),
			count - countToRename,
			newToOldIds,
			oldToNewIds,
		);
	}
}

/**
 * Deletes any renames from or to `id`.
 */
function deleteNodeRename(roots: RootNodeTable, id: ChangeAtomId, count: number): void {
	for (const entry of roots.oldToNewId.getAll(id, count)) {
		deleteNodeRenameEntry(roots, entry.start, entry.value, entry.length);
	}
}

/**
 * Deletes the entry renaming the ID range of length `count` from `oldId` to `newId`.
 * This function assumes that such an entry exists.
 */
function deleteNodeRenameEntry(
	roots: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
): void {
	roots.oldToNewId.delete(oldId, count);
	roots.newToOldId.delete(newId, count);
}

function setNodeRenameEntry(
	roots: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
): void {
	roots.oldToNewId.set(oldId, count, newId);
	roots.newToOldId.set(newId, count, oldId);
}

function replaceRootTableRevision(
	table: RootNodeTable,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): RootNodeTable {
	const oldToNewId = table.oldToNewId.mapEntries(
		(id) => replaceAtomRevisions(id, oldRevisions, newRevision),
		(id) => replaceAtomRevisions(id, oldRevisions, newRevision),
	);

	const newToOldId = table.newToOldId.mapEntries(
		(id) => replaceAtomRevisions(id, oldRevisions, newRevision),
		(id) => replaceAtomRevisions(id, oldRevisions, newRevision),
	);

	const nodeChanges: ChangeAtomIdBTree<NodeId> = newTupleBTree(
		[...table.nodeChanges.entries()].map(([[revision, id], nodeId]) => [
			[oldRevisions.has(revision) ? newRevision : revision, id],
			replaceAtomRevisions(nodeId, oldRevisions, newRevision),
		]),
	);

	return { oldToNewId, newToOldId, nodeChanges };
}

function newDetachedEntryMap(): ChangeAtomIdRangeMap<DetachedNodeEntry> {
	return new RangeMap(offsetChangeAtomId, subtractChangeAtomIds, offsetDetachedNodeEntry);
}

function offsetDetachedNodeEntry(entry: DetachedNodeEntry, count: number): DetachedNodeEntry {
	assert(
		count <= 1 || entry.nodeChange === undefined,
		"Cannot split an entry with a node change",
	);

	return entry.detachId !== undefined
		? { detachId: offsetChangeAtomId(entry.detachId, count) }
		: entry;
}
