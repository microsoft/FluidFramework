/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type ChangesetLocalId,
	CursorLocationType,
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaRoot,
	EditBuilder,
	type FieldKey,
	type FieldKindIdentifier,
	type FieldUpPath,
	type ITreeCursorSynchronous,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type UpPath,
	makeDetachedNodeId,
	mapCursorField,
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
} from "../../core/index.js";
import {
	type IdAllocationState,
	type IdAllocator,
	type Mutable,
	brand,
	fail,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	type RangeQueryResult,
	getOrAddInMapLazy,
	newTupleBTree,
	mergeTupleBTrees,
	type TupleBTree,
	RangeMap,
} from "../../util/index.js";
import {
	type TreeChunk,
	chunkFieldSingle,
	chunkTree,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";

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
	type RootNodeTable,
} from "./modularChangeTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	newChangeAtomIdTransform,
	type ChangeAtomIdRangeMap,
} from "../../core/rebase/types.js";
import type { RangeQueryEntry } from "../../util/rangeMap.js";

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
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
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
		const normalizedChange1 = this.normalizeFieldChange(
			change1,
			changeHandler,
			genId,
			revisionMetadata,
		);
		const normalizedChange2 = this.normalizeFieldChange(
			change2,
			changeHandler,
			genId,
			revisionMetadata,
		);
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
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeset {
		if (fieldChange.fieldKind !== genericFieldKind.identifier) {
			return fieldChange.change;
		}

		// The cast is based on the `fieldKind` check above
		const genericChange = fieldChange.change as unknown as GenericChangeset;
		const convertedChange = convertGenericChange(
			genericChange,
			handler,
			(child1, child2) => {
				assert(
					child1 === undefined || child2 === undefined,
					0x92f /* Should not have two changesets to compose */,
				);

				return child1 ?? child2 ?? fail("Should not compose two undefined node IDs");
			},
			genId,
			revisionMetadata,
		) as FieldChangeset;

		return convertedChange;
	}

	public compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		const { revInfos, maxId } = getRevInfoFromTaggedChanges(changes);
		const idState: IdAllocationState = { maxId };

		if (changes.length === 0) {
			return makeModularChangeset();
		}

		return changes
			.map((change) => change.change)
			.reduce((change1, change2) => this.composePair(change1, change2, revInfos, idState));
	}

	private composePair(
		change1: ModularChangeset,
		change2: ModularChangeset,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangeset {
		const {
			fieldChanges,
			nodeChanges,
			nodeToParent,
			nodeAliases,
			crossFieldKeys,
			rootNodes: nodeRenames,
		} = this.composeAllFields(change1, change2, revInfos, idState);

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
			nodeRenames,
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

		const composedNodeToParent: ChangeAtomIdBTree<FieldId> = brand(
			mergeTupleBTrees(change1.nodeToParent, change2.nodeToParent),
		);
		const composedNodeAliases: ChangeAtomIdBTree<NodeId> = brand(
			mergeTupleBTrees(change1.nodeAliases, change2.nodeAliases),
		);

		const pendingCompositions: PendingCompositions = {
			nodeIdsToCompose: [],
			affectedBaseFields: newTupleBTree(),
			affectedNewFields: newTupleBTree(),
		};

		const composedNodeRenames = composeRootTables(change1, change2, pendingCompositions);

		const crossFieldTable = newComposeTable(
			change1,
			change2,
			composedNodeToParent,
			composedNodeRenames,
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

		// Currently no field kinds require making changes to cross-field keys during composition, so we can just merge the two tables.
		const composedCrossFieldKeys = RangeMap.union(
			change1.crossFieldKeys,
			change2.crossFieldKeys,
		);
		return {
			fieldChanges: composedFields,
			nodeChanges: composedNodeChanges,
			nodeToParent: composedNodeToParent,
			nodeAliases: composedNodeAliases,
			crossFieldKeys: composedCrossFieldKeys,
			rootNodes: composedNodeRenames,
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
		const { fieldId, change1: fieldChange1, change2: fieldChange2, composedChange } = context;

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

			return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
		};

		const amendedChange = rebaser.compose(
			fieldChange1,
			fieldChange2,
			composeNodes,
			genId,
			new ComposeNodeManagerI(crossFieldTable, fieldId, false),
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
	 * (`affectedBaseFields` and `affectedNewFields`)
	 *
	 * Updating an element may invalidate further elements. This function runs until there is no more invalidation.
	 */
	private composeInvalidatedElements(
		table: ComposeTable,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<FieldId>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const pending = table.pendingCompositions;
		while (
			table.invalidatedFields.size > 0 ||
			pending.nodeIdsToCompose.length > 0 ||
			pending.affectedBaseFields.length > 0 ||
			pending.affectedNewFields.length > 0
		) {
			// Note that the call to `composeNodesById` can add entries to `crossFieldTable.nodeIdPairs`.
			for (const [id1, id2] of pending.nodeIdsToCompose) {
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

			pending.nodeIdsToCompose.length = 0;

			this.composeAffectedFields(
				table,
				table.baseChange,
				true,
				pending.affectedBaseFields,
				composedFields,
				composedNodes,
				genId,
				metadata,
			);

			this.composeAffectedFields(
				table,
				table.newChange,
				false,
				pending.affectedNewFields,
				composedFields,
				composedNodes,
				genId,
				metadata,
			);

			this.processInvalidatedCompositions(table, genId, metadata);
		}
	}

	private processInvalidatedCompositions(
		table: ComposeTable,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const fieldsToUpdate = table.invalidatedFields;
		table.invalidatedFields = new Set();
		for (const fieldChange of fieldsToUpdate) {
			this.composeInvalidatedField(fieldChange, table, genId, metadata);
		}
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
		areBaseFields: boolean,
		affectedFields: BTree<FieldIdKey, true>,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		for (const fieldIdKey of affectedFields.keys()) {
			const fieldId = normalizeFieldId(fieldIdFromFieldIdKey(fieldIdKey), change.nodeAliases);
			const fieldChange = fieldChangeFromId(change.fieldChanges, change.nodeChanges, fieldId);

			if (
				table.fieldToContext.has(fieldChange) ||
				table.newFieldToBaseField.has(fieldChange)
			) {
				// This function handles fields which were not part of the intersection of the two changesets but which need to be updated anyway.
				// If we've already processed this field then either it is up to date
				// or there is pending inval which will be handled in processInvalidatedCompositions.
				continue;
			}

			const emptyChange = this.createEmptyFieldChange(fieldChange.fieldKind);
			const [change1, change2] = areBaseFields
				? [fieldChange, emptyChange]
				: [emptyChange, fieldChange];

			const composedField = this.composeFieldChanges(
				fieldId,
				change1,
				change2,
				genId,
				table,
				metadata,
			);

			if (fieldId.nodeId === undefined) {
				composedFields.set(fieldId.field, composedField);
				continue;
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

		affectedFields.clear();
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
	 * will be added to either `affectedBaseFields` or `affectedNewFields` in `crossFieldTable.pendingCompositions`.
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
		} = this.normalizeFieldChanges(change1, change2, idAllocator, revisionMetadata);

		const manager = new ComposeNodeManagerI(crossFieldTable, fieldId);

		const composedChange = changeHandler.rebaser.compose(
			change1Normalized,
			change2Normalized,
			(child1, child2) => {
				if (child1 !== undefined && child2 !== undefined) {
					setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
					crossFieldTable.pendingCompositions.nodeIdsToCompose.push([child1, child2]);
				}
				return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
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
		composedNodeToParent: ChangeAtomIdBTree<FieldId>,
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
			...newCrossFieldTable<FieldChange>(),
			entries: newChangeAtomIdRangeMap(), // XXX: Handle splitting entries
			originalFieldToContext: new Map(),
			invertRevision: revisionForInvert,
			invertedNodeToParent: brand(change.change.nodeToParent.clone()),
			invertedNodeRenames: invertedRenameTable(change.change.rootNodes),
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
				const { invertedField, fieldId } = context;

				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.invert(
					originalFieldChange,
					isRollback,
					genId,
					revisionForInvert,
					new InvertNodeManagerI(crossFieldTable, fieldId),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		const crossFieldKeys = this.makeCrossFieldKeyTable(invertedFields, invertedNodes);

		return makeModularChangeset({
			fieldChanges: invertedFields,
			nodeChanges: invertedNodes,
			nodeToParent: crossFieldTable.invertedNodeToParent,
			nodeRenames: crossFieldTable.invertedNodeRenames,
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

		const crossFieldTable: RebaseTable = {
			...newCrossFieldTable<FieldChange>(),
			entries: newChangeAtomIdRangeMap(), // XXX: Handle splitting entries
			newChange: change,
			baseChange: over.change,
			baseFieldToContext: new Map(),
			baseNodeRenames: over.change.rootNodes,
			rebasedRootNodes: cloneRootTable(change.rootNodes),
			baseToRebasedNodeId: newTupleBTree(),
			rebasedFields: new Set(),
			rebasedNodeToParent: brand(change.nodeToParent.clone()),
			rebasedCrossFieldKeys: change.crossFieldKeys.clone(),
			nodeIdPairs: [],
			affectedBaseFields: newTupleBTree(),
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

		// XXX: Need to rebase detached node changes
		const rebasedFields = this.rebaseIntersectingFields(
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
		this.updateConstraintsForFields(
			rebasedFields,
			NodeAttachState.Attached,
			NodeAttachState.Attached,
			constraintState,
			revertConstraintState,
			rebasedNodes,
		);

		const rebased = makeModularChangeset({
			fieldChanges: this.pruneFieldMap(rebasedFields, rebasedNodes),
			nodeChanges: rebasedNodes,
			nodeToParent: crossFieldTable.rebasedNodeToParent,
			nodeRenames: crossFieldTable.rebasedRootNodes,
			nodeAliases: change.nodeAliases,
			crossFieldKeys: crossFieldTable.rebasedCrossFieldKeys,
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
		for (const [revision, localId, fieldKey] of crossFieldTable.affectedBaseFields.keys()) {
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
				// This field has already been processed because there were changes to rebase.
				// We add it to the set of invalidated fields to be processed during `rebaseInvalidatedFields`
				crossFieldTable.invalidatedFields.add(baseFieldChange);
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
				fieldChange.change,
				baseFieldChange.change,
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
		const fieldsToUpdate = crossFieldTable.invalidatedFields;
		crossFieldTable.invalidatedFields = new Set();
		for (const field of fieldsToUpdate) {
			this.rebaseInvalidatedField(field, crossFieldTable, rebaseMetadata, genId);
		}
	}

	private rebaseFieldsWithUnattachedChild(
		table: RebaseTable,
		metadata: RebaseRevisionMetadata,
		idAllocator: IdAllocator,
	): void {
		for (const field of table.fieldsWithUnattachedChild) {
			table.invalidatedFields.delete(field);
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
		} = this.normalizeFieldChanges(
			context.newChange,
			context.baseChange,
			genId,
			rebaseMetadata,
		);

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
				fieldChangeset,
				baseChangeset,
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

		const parentFieldId = getParentFieldId(table.baseChange, nodeId);

		this.attachRebasedNode(
			rebasedFields,
			rebasedNodes,
			table,
			nodeId,
			parentFieldId,
			idAllocator,
			metadata,
		);
	}

	private attachRebasedNode(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		baseNodeId: NodeId,
		parentFieldIdBase: FieldId,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseFieldChange = fieldChangeFromId(
			table.baseChange.fieldChanges,
			table.baseChange.nodeChanges,
			parentFieldIdBase,
		);

		const rebasedFieldId = rebasedFieldIdFromBaseId(table, parentFieldIdBase);
		setInChangeAtomIdMap(table.rebasedNodeToParent, baseNodeId, rebasedFieldId);

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
			handler.createEmpty(),
			baseFieldChange.change,
			(_idNew, idBase) =>
				idBase !== undefined && areEqualChangeAtomIds(idBase, baseNodeId)
					? baseNodeId
					: undefined,
			idAllocator,
			new RebaseNodeManagerI(table, rebasedFieldId),
			metadata,
		);

		const rebasedField: FieldChange = { ...baseFieldChange, change: brand(rebasedChangeset) };
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
			} = this.normalizeFieldChanges(fieldChange, baseChange, genId, revisionMetadata);

			const manager = new RebaseNodeManagerI(crossFieldTable, fieldId);

			const rebasedField = changeHandler.rebaser.rebase(
				fieldChangeset,
				baseChangeset,
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

	private updateConstraintsForFields(
		fields: FieldChangeMap,
		parentInputAttachState: NodeAttachState,
		parentOutputAttachState: NodeAttachState,
		constraintState: ConstraintState,
		revertConstraintState: ConstraintState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): void {
		// XXX
	}

	private updateConstraintsForNode(
		nodeId: NodeId,
		inputAttachState: NodeAttachState,
		outputAttachState: NodeAttachState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
		constraintState: ConstraintState,
		revertConstraintState: ConstraintState,
	): void {
		const node = nodes.get([nodeId.revision, nodeId.localId]) ?? fail("Unknown node ID");
		if (node.nodeExistsConstraint !== undefined) {
			const isNowViolated = inputAttachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraint.violated !== isNowViolated) {
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
	): FieldChangeMap | undefined {
		if (changeset === undefined) {
			return undefined;
		}

		const prunedChangeset: FieldChangeMap = new Map();
		for (const [field, fieldChange] of changeset) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);

			const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
				this.pruneNodeChange(nodeId, nodeMap),
			);

			if (!handler.isEmpty(prunedFieldChangeset)) {
				prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
			}
		}

		return prunedChangeset.size > 0 ? prunedChangeset : undefined;
	}

	private pruneNodeChange(
		nodeId: NodeId,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	): NodeId | undefined {
		const changeset = nodeChangeFromId(nodeMap, nodeId);
		const prunedFields =
			changeset.fieldChanges !== undefined
				? this.pruneFieldMap(changeset.fieldChanges, nodeMap)
				: undefined;

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

		const updatedNodeToParent: ChangeAtomIdBTree<FieldId> = newTupleBTree();
		for (const [[revision, id], fieldId] of change.nodeToParent.entries()) {
			updatedNodeToParent.set(
				[replaceRevision(revision, oldRevisions, newRevision), id],
				replaceFieldIdRevision(
					normalizeFieldId(fieldId, change.nodeAliases),
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
				const parentFieldId = getParentFieldId(change, child);
				assert(
					areEqualFieldIds(parentFieldId, fieldId),
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
	yield* relevantRemovedRootsFromFields(change.fieldChanges, change.nodeChanges, fieldKinds);
}

function* relevantRemovedRootsFromFields(
	change: FieldChangeMap,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	// XXX
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
			const lengthTree = getOrAddInMapLazy(chunkLengths, revision, () => new BTree());
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
			const trees = mapCursorField(chunk.cursor(), (c) =>
				cursorForMapTreeNode(mapTreeFromCursor(c)),
			);
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major, minor),
				trees,
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

// TODO: TFieldData could instead just be a numeric ID generated by the CrossFieldTable
// The CrossFieldTable could have a generic field ID to context table
interface CrossFieldTable<TFieldData> {
	invalidatedFields: Set<TFieldData>;
}

interface InvertTable extends CrossFieldTable<FieldChange> {
	// Entries are keyed on attach ID
	entries: CrossFieldMap<DetachedNodeEntry>;
	originalFieldToContext: Map<FieldChange, InvertContext>;
	invertedNodeRenames: RootNodeTable;
	invertedNodeToParent: ChangeAtomIdBTree<FieldId>;
	invertRevision: RevisionTag;
}

interface InvertContext {
	fieldId: FieldId;
	invertedField: FieldChange;
}

interface RebaseTable extends CrossFieldTable<FieldChange> {
	// Entries are keyed on attach ID
	readonly entries: CrossFieldMap<DetachedNodeEntry>;
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from the FieldChange key used for the CrossFieldTable (which is the base FieldChange)
	 * to the context for the field.
	 */
	readonly baseFieldToContext: Map<FieldChange, RebaseFieldContext>;
	readonly baseNodeRenames: RootNodeTable;
	readonly baseToRebasedNodeId: ChangeAtomIdBTree<NodeId>;
	readonly rebasedFields: Set<FieldChange>;
	readonly rebasedNodeToParent: ChangeAtomIdBTree<FieldId>;
	readonly rebasedCrossFieldKeys: CrossFieldKeyTable;
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
	composedNodeToParent: ChangeAtomIdBTree<FieldId>,
	composedRootNodes: RootNodeTable,
	pendingCompositions: PendingCompositions,
): ComposeTable {
	return {
		...newCrossFieldTable<FieldChange>(),
		entries: newChangeAtomIdRangeMap(), // XXX: Handle splitting entries
		baseChange,
		newChange,
		fieldToContext: new Map(),
		newFieldToBaseField: new Map(),
		newToBaseNodeId: newTupleBTree(),
		composedNodes: new Set(),
		composedNodeToParent,
		composedRootNodes,
		pendingCompositions,
	};
}

interface ComposeTable extends CrossFieldTable<FieldChange> {
	// Entries are keyed on detach ID
	readonly entries: CrossFieldMap<DetachedNodeEntry>;
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from an input changeset for a field (from change1 if it has one, from change2 otherwise) to the context for that field.
	 */
	readonly fieldToContext: Map<FieldChange, ComposeFieldContext>;
	readonly newFieldToBaseField: Map<FieldChange, FieldChange>;
	readonly newToBaseNodeId: ChangeAtomIdBTree<NodeId>;
	readonly composedNodes: Set<NodeChangeset>;
	readonly composedNodeToParent: ChangeAtomIdBTree<FieldId>;
	readonly composedRootNodes: RootNodeTable;
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

	/**
	 * The set of fields in the new changeset which have been affected by a cross field effect.
	 */
	readonly affectedNewFields: BTree<FieldIdKey, true>;
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

function newCrossFieldTable<T>(): CrossFieldTable<T> {
	return {
		invalidatedFields: new Set(),
	};
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
	): void {
		// XXX: Need to record something even if there is no node change
		// as we may need to create a detached node entry in the inverse changeset?
		// Or should the changeset only have an entry if there is data associated with the detached change?
		// XXX: Add inval
		if (nodeChange !== undefined) {
			// XXX: If there is no inverted attach for this entry we should put the node changes in a root entry
			// XXX: Need to use attachId
			setInCrossFieldMap(this.table.entries, detachId, count, {
				nodeChange,
			});
		}
	}

	public invertAttach(
		attachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry> {
		return this.table.entries.getFirst(attachId, count);
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
		// XXX: This should return the deleted node
		this.table.rebasedRootNodes.nodeChanges.delete([
			baseAttachId.revision,
			baseAttachId.localId,
		]);

		return this.table.entries.getFirst(baseAttachId, count);
	}

	public rebaseOverDetach(
		baseDetachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId | undefined,
		nodeChange: NodeId | undefined,
		fieldData: unknown,
	): void {
		const { value: baseAttachId, length } = firstAttachIdFromDetachId(
			this.table.baseNodeRenames,
			baseDetachId,
			count,
		);

		if (isAttachId(this.table.baseChange, baseAttachId, count)) {
			// The base detach is part of a move in the base changeset.
			setInCrossFieldMap(this.table.entries, baseAttachId, length, {
				nodeChange,
				fieldData,
			});
		} else {
			if (nodeChange !== undefined) {
				setInChangeAtomIdMap(
					this.table.rebasedRootNodes.nodeChanges,
					baseDetachId,
					nodeChange,
				);
			}

			// XXX: Store fieldData

			if (newDetachId !== undefined) {
				renameNodes(
					this.table.rebasedRootNodes,
					baseAttachId,
					newDetachId,
					length,
					this.table.newChange.rootNodes.newToOldId,
					this.table.newChange.rootNodes.oldToNewId,
				);
			}
		}

		if (this.allowInval) {
			const baseFieldIds = getFieldsForCrossFieldKey(
				this.table.baseChange,
				{
					target: CrossFieldTarget.Destination,
					revision: baseAttachId.revision,
					localId: baseAttachId.localId,
				},
				length,
			);

			for (const baseFieldId of baseFieldIds) {
				this.table.affectedBaseFields.set(
					[baseFieldId.nodeId?.revision, baseFieldId.nodeId?.localId, baseFieldId.field],
					true,
				);
			}
		}

		if (length < count) {
			const remainingCount = count - length;

			assert(fieldData === undefined, "XXX: Handle splitting field data");
			const nextDetachId =
				newDetachId !== undefined
					? offsetChangeAtomId(newDetachId, remainingCount)
					: undefined;

			this.rebaseOverDetach(
				offsetChangeAtomId(baseDetachId, remainingCount),
				remainingCount,
				nextDetachId,
				nodeChange,
				fieldData,
			);
		}
	}
}

class ComposeNodeManagerI implements ComposeNodeManager {
	public constructor(
		private readonly table: ComposeTable,
		private readonly fieldId: FieldId,
		private readonly allowInval: boolean = false,
	) {}

	public getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId> {
		const detachedNodeId = getFromChangeAtomIdMap(
			this.table.newChange.rootNodes.nodeChanges,
			baseDetachId,
		);

		if (detachedNodeId !== undefined) {
			// XXX: Should this function be renamed since it can have a side effect?
			// XXX: Do we need to dealias whenever pulling node IDs out of the root node table?
			this.table.composedRootNodes.nodeChanges.delete([
				baseDetachId.revision,
				baseDetachId.localId,
			]);

			return { start: baseDetachId, value: detachedNodeId, length: 1 };
		}

		// The base detach might be part of a move.
		// We check if we've previously seen a node change at the move destination.
		const result = this.table.entries.getFirst(baseDetachId, count);
		return { ...result, value: result.value?.nodeChange };
	}

	public composeBaseAttach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId | undefined,
		count: number,
		newChanges: NodeId | undefined,
	): void {
		if (newDetachId !== undefined) {
			renameNodes(
				this.table.composedRootNodes,
				baseAttachId,
				newDetachId,
				count,
				this.table.baseChange.rootNodes.newToOldId,
				this.table.newChange.rootNodes.oldToNewId,
			);
		}

		const { value: baseDetachId, length } = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			count,
		);

		assert(length === count, "XXX");

		if (newChanges !== undefined) {
			if (isDetachId(this.table.baseChange, baseDetachId, count)) {
				// The base attach is part of a move in the base changeset.
				setInCrossFieldMap(this.table.entries, baseDetachId, count, {
					nodeChange: newChanges,
				});
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
				}
			}
		}
	}

	public composeDetachAttach(baseDetachId: ChangeAtomId, count: number): void {
		deleteNodeRename(this.table.composedRootNodes, baseDetachId, count);
	}

	public renameNewAttach(oldId: ChangeAtomId, newId: ChangeAtomId, count: number): void {
		renameNodes(
			this.table.composedRootNodes,
			oldId,
			newId,
			count,
			this.table.baseChange.rootNodes.newToOldId,
			this.table.newChange.rootNodes.oldToNewId,
		);
	}
}

function makeModularChangeset(
	props: {
		fieldChanges?: FieldChangeMap;
		nodeChanges?: ChangeAtomIdBTree<NodeChangeset>;
		nodeRenames?: RootNodeTable;
		nodeToParent?: ChangeAtomIdBTree<FieldId>;
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
		rootNodes: props.nodeRenames ?? newRootTable(),
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
	 * @param content - The node(s) to build. Can be in either Field or Node mode.
	 * @param revision - The revision to use for the build.
	 * @returns A description of the edit that can be passed to `submitChanges`.
	 */
	public buildTrees(
		firstId: ChangesetLocalId,
		content: ITreeCursorSynchronous,
		revision: RevisionTag,
		idCompressor?: IIdCompressor,
	): GlobalEditDescription {
		if (content.mode === CursorLocationType.Fields && content.getFieldLength() === 0) {
			return { type: "global", revision };
		}
		const builds: ChangeAtomIdBTree<TreeChunk> = newTupleBTree();
		const chunkCompressor = {
			policy: defaultChunkPolicy,
			idCompressor,
		};
		const chunk =
			content.mode === CursorLocationType.Fields
				? chunkFieldSingle(content, chunkCompressor)
				: chunkTree(content, chunkCompressor);
		builds.set([revision, firstId], chunk);

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
		field: FieldUpPath,
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
							nodeRenames: renameTableFromRenameDescriptions(change.renames ?? []),
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

	public addNodeExistsConstraint(path: UpPath, revision: RevisionTag): void {
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

	public addNodeExistsConstraintOnRevert(path: UpPath, revision: RevisionTag): void {
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

function buildModularChangesetFromField(props: {
	path: FieldUpPath;
	fieldChange: FieldChange;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<FieldId>;
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
				nodeId: undefined,
				field: path.field,
			});
		}

		// XXX: Roots
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
			nodeId: parentId,
			field: path.field,
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
	path: UpPath;
	nodeChange: NodeChangeset;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<FieldId>;
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
	const fieldChangeset = genericFieldKind.changeHandler.editor.buildChildChange(
		path.parentIndex,
		nodeId,
	);

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

/**
 */
export interface FieldEditDescription {
	type: "field";
	field: FieldUpPath;
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
	const emptyMap = newChangeAtomIdRangeMap<ChangeAtomId>();
	for (const rename of renames) {
		renameNodes(table, rename.oldId, rename.newId, rename.count, emptyMap, emptyMap);
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

	const revisions = new Set<RevisionTag>();
	const rolledBackRevisions: RevisionTag[] = [];
	for (const info of revInfos) {
		revisions.add(info.revision);
		if (info.rollbackOf !== undefined) {
			rolledBackRevisions.push(info.rollbackOf);
		}
	}

	rolledBackRevisions.reverse();
	for (const revision of rolledBackRevisions) {
		if (!revisions.has(revision)) {
			revInfos.push({ revision });
		}
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

function fieldChangeFromId(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	id: FieldId,
): FieldChange {
	const fieldMap = fieldMapFromNodeId(fields, nodes, id.nodeId);
	return fieldMap.get(id.field) ?? fail("No field exists for the given ID");
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

function cloneNodeChangeset(nodeChangeset: NodeChangeset): NodeChangeset {
	if (nodeChangeset.fieldChanges !== undefined) {
		return { ...nodeChangeset, fieldChanges: new Map(nodeChangeset.fieldChanges) };
	}

	return { ...nodeChangeset };
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

export function getParentFieldId(changeset: ModularChangeset, nodeId: NodeId): FieldId {
	const parentId = getFromChangeAtomIdMap(changeset.nodeToParent, nodeId);
	assert(parentId !== undefined, 0x9cb /* Parent field should be defined */);
	return normalizeFieldId(parentId, changeset.nodeAliases);
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
	nodeToParent: ChangeAtomIdBTree<FieldId>;
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

function setInChangeAtomIdMap<T>(map: ChangeAtomIdBTree<T>, id: ChangeAtomId, value: T): void {
	map.set([id.revision, id.localId], value);
}

function areEqualFieldIds(a: FieldId, b: FieldId): boolean {
	return areEqualChangeAtomIdOpts(a.nodeId, b.nodeId) && a.field === b.field;
}

function firstAttachIdFromDetachId(
	renames: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryEntry<ChangeAtomId, ChangeAtomId> {
	const result = renames.oldToNewId.getFirst(detachId, count);
	return { ...result, value: result.value ?? detachId };
}

function firstDetachIdFromAttachId(
	renames: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryEntry<ChangeAtomId, ChangeAtomId> {
	const result = renames.newToOldId.getFirst(attachId, count);
	return { ...result, value: result.value ?? attachId };
}

export function newRootTable(): RootNodeTable {
	return {
		newToOldId: newChangeAtomIdTransform(),
		oldToNewId: newChangeAtomIdTransform(),
		nodeChanges: newTupleBTree(),
	};
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
			change2.rootNodes.oldToNewId,
		);
	}

	for (const [[revision2, id2], nodeId2] of change2.rootNodes.nodeChanges.entries()) {
		const detachId2 = { revision: revision2, localId: id2 };
		const detachId1 = change1.rootNodes.newToOldId.getFirst(detachId2, 1).value ?? detachId2;
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

function invertedRenameTable(table: RootNodeTable): RootNodeTable {
	return {
		oldToNewId: table.newToOldId.clone(),
		newToOldId: table.oldToNewId.clone(),

		// XXX: Invert the keys and the changes
		nodeChanges: brand(table.nodeChanges.clone()),
	};
}

function renameNodes(
	table: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
	newToOldIds: ChangeAtomIdRangeMap<ChangeAtomId>,
	oldToNewIds: ChangeAtomIdRangeMap<ChangeAtomId>,
): void {
	const oldEntry1 = table.newToOldId.getFirst(oldId, count);
	const newEntry1 = table.oldToNewId.getFirst(newId, count);
	const oldEntry = newToOldIds.getFirst(oldId, count);
	const newEntry = oldToNewIds.getFirst(newId, count);
	const countToRename = Math.min(newEntry.length, oldEntry.length);

	let adjustedOldId = oldId;
	if (oldEntry.value !== undefined) {
		adjustedOldId = oldEntry.value;
		deleteNodeRenameEntry(table, oldEntry.value, oldId, countToRename);
	}

	let adjustedNewId = newId;
	if (newEntry.value !== undefined) {
		adjustedNewId = newEntry.value;
		deleteNodeRenameEntry(table, newId, newEntry.value, countToRename);
	}

	// If `newId` had previously been renamed to `oldId` then we are renaming the node back to its original name
	// and do not need to have a rename entry.
	if (
		!areEqualChangeAtomIds(adjustedOldId, newId) &&
		!areEqualChangeAtomIdOpts(oldId, adjustedNewId)
	) {
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
function deleteNodeRename(renames: RootNodeTable, id: ChangeAtomId, count: number): void {
	for (const entry of renames.oldToNewId.getAll(id, count)) {
		deleteNodeRenameEntry(renames, entry.start, entry.value, entry.length);
	}
}

/**
 * Deletes the entry renaming the ID range of length `count` from `oldId` to `newId`.
 * This function assumes that such an entry exists.
 */
function deleteNodeRenameEntry(
	renames: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
): void {
	renames.oldToNewId.delete(oldId, count);
	renames.newToOldId.delete(newId, count);
}

function setNodeRenameEntry(
	renames: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
): void {
	renames.oldToNewId.set(oldId, count, newId);
	renames.newToOldId.set(newId, count, oldId);
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

function isAttachId(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): boolean {
	return hasEditForId(changeset, attachId, CrossFieldTarget.Destination, count);
}

function isDetachId(
	changeset: ModularChangeset,
	detachId: ChangeAtomId,
	count: number,
): boolean {
	return hasEditForId(changeset, detachId, CrossFieldTarget.Source, count);
}

// XXX: Should return a range
function hasEditForId(
	changeset: ModularChangeset,
	id: ChangeAtomId,
	target: CrossFieldTarget,
	count: number,
): boolean {
	return (
		getFieldsForCrossFieldKey(
			changeset,
			{
				target,
				revision: id.revision,
				localId: id.localId,
			},
			count,
		).length > 0
	);
}
