/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";
import { lt } from "semver-ts";

import {
	FluidClientVersion,
	type CodecWriteOptions,
	type ICodecFamily,
} from "../../codec/index.js";
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
	revisionMetadataSourceFromInfo,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	areEqualChangeAtomIdOpts,
	tagChange,
	makeAnonChange,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeRename,
	mapTaggedChange,
	newChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	type ChangeAtomIdRangeMap,
	offsetChangeAtomId,
	type NormalizedUpPath,
	type NormalizedFieldUpPath,
	isDetachedUpPathRoot,
	subtractChangeAtomIds,
	makeChangeAtomId,
	type RevisionReplacer,
	comparePartialRevisions,
	comparePartialChangesetLocalIds,
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
	mergeTupleBTrees,
	type TupleBTree,
	RangeMap,
	balancedReduce,
	compareStrings,
	createTupleComparator,
	type RangeQueryEntry,
	type RangeQueryResultFragment,
	newTupleBTree,
} from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	rangeQueryChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import type { TreeChunk } from "../chunked-forest/index.js";

import {
	type ComposeNodeManager,
	type CrossFieldMap,
	NodeMoveType,
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
import type { FlexFieldKind } from "./fieldKind.js";
import { convertGenericChange, genericFieldKind } from "./genericFieldKind.js";
import type { GenericChangeset } from "./genericFieldKindTypes.js";
import {
	type CrossFieldKey,
	type CrossFieldKeyRange,
	type CrossFieldKeyTable,
	type CrossFieldRangeTable,
	type FieldChange,
	type FieldChangeMap,
	type FieldChangeset,
	type FieldId,
	type ModularChangeset,
	newCrossFieldRangeTable,
	type NoChangeConstraint,
	type NodeChangeset,
	type NodeId,
	type NodeLocation,
	type RebaseVersion,
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

	public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>;

	public constructor(
		fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
		public readonly codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>,
		public readonly codecOptions: CodecWriteOptions,
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
			change1.fieldKind === genericFieldKind.identifier
				? change2.fieldKind
				: change1.fieldKind;

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
		const { maxId } = getRevInfoFromTaggedChanges(changes);
		const idState: IdAllocationState = { maxId };

		const pairwiseDelegate = (
			left: ModularChangeset,
			right: ModularChangeset,
		): ModularChangeset => {
			return this.composePair(left, right, idState);
		};

		const innerChanges = changes.map((change) => change.change);
		return balancedReduce(innerChanges, pairwiseDelegate, makeModularChangeset);
	}

	private composePair(
		change1: ModularChangeset,
		change2: ModularChangeset,
		idState: IdAllocationState,
	): ModularChangeset {
		const revInfos = composeRevInfos(change1.revisions, change2.revisions);

		const { fieldChanges, nodeChanges, nodeToParent, nodeAliases, crossFieldKeys, rootNodes } =
			this.composeAllFields(change1, change2, revInfos, idState);

		const { allBuilds, allDestroys, allRefreshers } = composeBuildsDestroysAndRefreshers(
			change1,
			change2,
		);

		// The composed changeset has a "no change" constraint if either change has one
		const noChangeConstraint = change1.noChangeConstraint ?? change2.noChangeConstraint;
		const noChangeConstraintOnRevert =
			change1.noChangeConstraintOnRevert ?? change2.noChangeConstraintOnRevert;

		const composed = makeModularChangeset({
			rebaseVersion: Math.max(change1.rebaseVersion, change2.rebaseVersion) as RebaseVersion,
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
			noChangeConstraint,
			noChangeConstraintOnRevert,
		});

		removeUnnecessaryDetachLocations(composed.rootNodes, composed.rebaseVersion);

		// XXX: This is an expensive assert which should be disabled before merging.
		validateChangeset(composed, this.fieldKinds);
		return composed;
	}

	private composeAllFields(
		potentiallyConflictedChange1: ModularChangeset,
		potentiallyConflictedChange2: ModularChangeset,
		revInfos: readonly RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangesetContent {
		// Our current cell ordering scheme in sequences depends on being able to rebase over a change with conflicts.
		// This means that compose must preserve declarations (e.g., new cells) made by conflicted changes (so that we can rebase over the composition).
		// TODO: remove once AB#46104 is completed
		const change1 = this.getEffectiveChange(potentiallyConflictedChange1);
		const change2 = this.getEffectiveChange(potentiallyConflictedChange2);

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
			affectedBaseFields: newFieldIdKeyBTree(),
		};

		const removedCrossFieldKeys: CrossFieldRangeTable<boolean> = newCrossFieldRangeTable();

		const composedRoots = composeRootTables(
			change1,
			change2,
			composedNodeToParent,
			pendingCompositions,
		);

		const crossFieldTable = newComposeTable(
			change1,
			change2,
			composedRoots,
			removedCrossFieldKeys,
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

		for (const [nodeId, location] of crossFieldTable.movedNodeToParent.entries()) {
			// Moved nodes are from change2.
			// If there is a corresponding node in change1, then composedNodeToParent will already have the correct entry,
			// because the location of the node is the same in change1 and the composed change
			// (since they have the same input context).
			if (crossFieldTable.newToBaseNodeId.get(nodeId) === undefined) {
				composedNodeToParent.set(nodeId, location);
			}
		}

		// We update the initial composed root renames created by `composeRootRenames`,
		// applying pending additions and removals created through `ComposeNodeManager` while composing fields.
		applyPendingComposedRenames(
			change1,
			change2,
			crossFieldTable.composedRootNodes,
			crossFieldTable.attachDetachRenames,
			crossFieldTable.deletedRenames,
		);

		return {
			fieldChanges: composedFields,
			nodeChanges: composedNodeChanges,
			nodeToParent: composedNodeToParent,
			nodeAliases: composedNodeAliases,
			crossFieldKeys: composeCrossFieldKeyTables(
				change1.crossFieldKeys,
				change2.crossFieldKeys,
				crossFieldTable.removedCrossFieldKeys,
				crossFieldTable.addedCrossFieldKeys,
			),
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
			if (child1 !== undefined && child2 !== undefined) {
				addNodesToCompose(crossFieldTable, child1, child2);
			}

			return child1 ?? child2 ?? fail(0xb22 /* Should not compose two undefined nodes */);
		};

		const amendedChange = rebaser.compose(
			fieldChange1,
			fieldChange2,
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
				table.baseChange,
				table.newChange,
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

		const nodeId = normalizeNodeId(
			getFromChangeAtomIdMap(table.newToBaseNodeId, fieldId.nodeId) ?? fieldId.nodeId,
			table.baseChange.nodeAliases,
		);

		// We clone the node changeset before mutating it, as it may be from one of the input changesets.
		const nodeChangeset: Mutable<NodeChangeset> = cloneNodeChangeset(
			nodeChangeFromId(composedNodes, table.baseChange.nodeAliases, nodeId),
		);
		setInChangeAtomIdMap(composedNodes, nodeId, nodeChangeset);

		nodeChangeset.fieldChanges ??= new Map();

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

			const cachedComposedFieldChange =
				crossFieldTable.fieldToContext.get(fieldChange1)?.composedChange;

			if (fieldChange2 === undefined && cachedComposedFieldChange !== undefined) {
				// This can happen if the field was previous processed in `composeFieldWithNoNewChange`.
				// If `change2` does not have a change for this field, then without this check we would
				// lose the composed field change and instead simply have `change1`'s change.
				composedFields.set(field, cachedComposedFieldChange);
				continue;
			}

			const composedField =
				fieldChange2 === undefined
					? fieldChange1
					: this.composeFieldChanges(
							fieldId,
							fieldChange1,
							fieldChange2,
							genId,
							crossFieldTable,
							revisionMetadata,
						);

			composedFields.set(field, composedField);
		}

		for (const [field, fieldChange2] of change2) {
			if (!change1?.has(field)) {
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
			change1Normalized,
			change2Normalized,
			(child1, child2) => {
				if (child1 !== undefined && child2 !== undefined) {
					addNodesToCompose(crossFieldTable, child1, child2);
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
		change1: ModularChangeset,
		change2: ModularChangeset,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
		composedAliases: ChangeAtomIdBTree<NodeId>,
		id1: NodeId,
		id2: NodeId,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const nodeChangeset1 = nodeChangeFromId(change1.nodeChanges, change1.nodeAliases, id1);
		const nodeChangeset2 = nodeChangeFromId(change2.nodeChanges, change2.nodeAliases, id2);
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
			setInChangeAtomIdMap(composedAliases, id2, id1);

			// We need to delete id1 to avoid forming a cycle in case id1 already had an alias.
			composedAliases.delete([id1.revision, id1.localId]);
		}
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

		const composedNodeChange: Mutable<NodeChangeset> = {};

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
	 * performing a sandwich rebase.
	 * @param revisionForInvert - The revision for the invert changeset.
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

		const invertedFields = this.invertFieldMap(
			change.change.fieldChanges,
			undefined,
			isRollback,
			genId,
			crossFieldTable,
			revisionMetadata,
			revisionForInvert,
		);

		const invertedNodes = newChangeAtomIdBTree<NodeChangeset>();
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

		const crossFieldKeys = this.makeCrossFieldKeyTable(invertedFields, invertedNodes);

		this.processInvertRenames(crossFieldTable);

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
			constraintViolationCount: change.change.constraintViolationCountOnRevert,
			constraintViolationCountOnRevert: change.change.constraintViolationCount,
			noChangeConstraint,
			noChangeConstraintOnRevert,
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
			// Note that the detach location is already set in `invertDetach`.
			addNodeRename(table.invertedRoots, originalDetachId, newAttachId, length, undefined);
		}
	}

	public rebase(
		taggedChange: TaggedChange<ModularChangeset>,
		potentiallyConflictedOver: TaggedChange<ModularChangeset>,
		revisionMetadata: RevisionMetadataSource,
	): ModularChangeset {
		// Our current cell ordering scheme in sequences depends on being able to rebase over a change with conflicts.
		// This means that we must rebase over a muted version of the conflicted changeset.
		// That is, a version that includes its declarations (e.g., new cells) but not its changes.
		// TODO: remove once AB#46104 is completed
		const over = mapTaggedChange(
			potentiallyConflictedOver,
			this.getEffectiveChange(potentiallyConflictedOver.change),
		);

		const change = taggedChange.change;
		const maxId = Math.max(change.maxId ?? -1, over.change.maxId ?? -1);
		const idState: IdAllocationState = { maxId };
		const genId: IdAllocator = idAllocatorFromState(idState);

		const affectedBaseFields: TupleBTree<FieldIdKey, boolean> = newFieldIdKeyBTree();
		const nodesToRebase: [newChangeset: NodeId, baseChangeset: NodeId][] = [];

		const rebasedNodeToParent: ChangeAtomIdBTree<NodeLocation> = brand(
			change.nodeToParent.clone(),
		);

		const rebaseVersion = Math.max(
			change.rebaseVersion,
			over.change.rebaseVersion,
		) as RebaseVersion;

		const rebasedRootNodes = rebaseRoots(
			change,
			over.change,
			affectedBaseFields,
			nodesToRebase,
			rebasedNodeToParent,
			rebaseVersion,
		);
		const crossFieldTable: RebaseTable = {
			rebaseVersion,
			entries: newDetachedEntryMap(),
			newChange: change,
			baseChange: over.change,
			baseFieldToContext: new Map(),
			baseRoots: over.change.rootNodes,
			rebasedRootNodes,
			baseToRebasedNodeId: newChangeAtomIdBTree(),
			rebasedFields: new Set(),
			rebasedNodeToParent,
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

		this.rebaseInvalidatedFields(
			rebasedFields,
			rebasedNodes,
			crossFieldTable,
			rebaseMetadata,
			genId,
		);

		fixupRebasedDetachLocations(crossFieldTable);

		const constraintState = newConstraintState(change.constraintViolationCount ?? 0);
		const revertConstraintState = newConstraintState(
			change.constraintViolationCountOnRevert ?? 0,
		);

		let noChangeConstraint = change.noChangeConstraint;
		if (noChangeConstraint !== undefined && !noChangeConstraint.violated) {
			noChangeConstraint = { violated: true };
			constraintState.violationCount += 1;
		}

		this.updateConstraints(
			rebasedFields,
			rebasedNodes,
			rebasedRootNodes,
			constraintState,
			revertConstraintState,
		);

		removeUnnecessaryDetachLocations(rebasedRootNodes, rebaseVersion);

		const fieldsWithRootMoves = getFieldsWithRootMoves(
			crossFieldTable.rebasedRootNodes,
			change.nodeAliases,
		);

		const fieldToRootChanges = getFieldToRootChanges(
			crossFieldTable.rebasedRootNodes,
			change.nodeAliases,
		);

		const rebased = makeModularChangeset({
			fieldChanges: this.pruneFieldMap(
				rebasedFields,
				undefined,
				rebasedNodes,
				crossFieldTable.rebasedNodeToParent,
				change.nodeAliases,
				crossFieldTable.rebasedRootNodes,
				fieldsWithRootMoves,
				fieldToRootChanges,
			),
			nodeChanges: rebasedNodes,
			nodeToParent: crossFieldTable.rebasedNodeToParent,
			rootNodes: this.pruneRoots(
				crossFieldTable.rebasedRootNodes,
				rebasedNodes,
				crossFieldTable.rebasedNodeToParent,
				change.nodeAliases,
				fieldsWithRootMoves,
				fieldToRootChanges,
			),
			// TODO: Do we need to include aliases for node changesets added during rebasing?
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
			noChangeConstraint,
			noChangeConstraintOnRevert: change.noChangeConstraintOnRevert,
			builds: change.builds,
			destroys: change.destroys,
			refreshers: change.refreshers,
			rebaseVersion,
		});

		// XXX: This is an expensive assert which should be disabled before merging.
		validateChangeset(rebased, this.fieldKinds);
		return rebased;
	}

	// This performs a first pass on all fields which have both new and base changes.
	// TODO: Can we also handle additional passes in this method?
	private rebaseIntersectingFields(
		rootChanges: [newChangeset: NodeId, baseChangeset: NodeId][],
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

		for (const [newChildChange, baseChildChange] of rootChanges) {
			const rebasedNode = this.rebaseNodeChange(
				newChildChange,
				baseChildChange,
				genId,
				crossFieldTable,
				metadata,
			);

			setInChangeAtomIdMap(rebasedNodes, newChildChange, rebasedNode);
		}

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

	private rebaseFieldWithoutNewChanges(
		baseFieldChange: FieldChange,
		baseFieldId: FieldId,
		crossFieldTable: RebaseTable,
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,

		/**
		 * The ID of a node in `baseFieldChange` which should be included in the rebased field change.
		 */
		baseNodeId?: NodeId,
	): void {
		// This field has no changes in the new changeset, otherwise it would have been added to
		// `crossFieldTable.baseFieldToContext` when processing fields with both base and new changes.
		const rebaseChild = (
			child: NodeId | undefined,
			baseChild: NodeId | undefined,
			stateChange: NodeAttachState | undefined,
		): NodeId | undefined => {
			assert(child === undefined, 0x9c3 /* There should be no new changes in this field */);
			if (baseChild === undefined || baseNodeId === undefined) {
				return undefined;
			}

			return areEqualChangeAtomIds(
				normalizeNodeId(baseChild, crossFieldTable.baseChange.nodeAliases),
				baseNodeId,
			)
				? baseNodeId
				: undefined;
		};

		const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);
		const fieldChange: FieldChange = {
			...baseFieldChange,
			change: brand(handler.createEmpty()),
		};

		const rebasedNodeId =
			baseFieldId.nodeId === undefined
				? undefined
				: rebasedNodeIdFromBaseNodeId(crossFieldTable, baseFieldId.nodeId);

		const fieldId: FieldId = { nodeId: rebasedNodeId, field: baseFieldId.field };

		const rebasedField: unknown = handler.rebaser.rebase(
			fieldChange.change,
			baseFieldChange.change,
			rebaseChild,
			genId,
			new RebaseNodeManagerI(crossFieldTable, fieldId),
			metadata,
			crossFieldTable.rebaseVersion,
		);

		const rebasedFieldChange: FieldChange = {
			...baseFieldChange,
			change: brand(rebasedField),
		};

		const context: RebaseFieldContext = {
			newChange: fieldChange,
			baseChange: baseFieldChange,
			rebasedChange: rebasedFieldChange,
			fieldId,
			baseNodeIds: newChangeAtomIdBTree(),
		};

		if (baseNodeId !== undefined) {
			setInChangeAtomIdMap(context.baseNodeIds, baseNodeId, true);
		}

		crossFieldTable.baseFieldToContext.set(baseFieldChange, context);

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

	private rebaseInvalidatedFields(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		crossFieldTable: RebaseTable,
		rebaseMetadata: RebaseRevisionMetadata,
		genId: IdAllocator,
	): void {
		while (crossFieldTable.affectedBaseFields.size > 0) {
			const baseFields = crossFieldTable.affectedBaseFields.clone();
			crossFieldTable.affectedBaseFields.clear();

			for (const baseFieldIdKey of baseFields.keys()) {
				const baseFieldId = normalizeFieldId(
					fieldIdFromFieldIdKey(baseFieldIdKey),
					crossFieldTable.baseChange.nodeAliases,
				);

				const baseField = fieldChangeFromId(crossFieldTable.baseChange, baseFieldId);

				assert(
					baseField !== undefined,
					0x9c2 /* Cross field key registered for empty field */,
				);

				const context = crossFieldTable.baseFieldToContext.get(baseField);
				if (context === undefined) {
					this.rebaseFieldWithoutNewChanges(
						baseField,
						baseFieldId,
						crossFieldTable,
						rebasedFields,
						rebasedNodes,
						genId,
						rebaseMetadata,
					);
				} else {
					this.rebaseInvalidatedField(
						baseField,
						crossFieldTable,
						context,
						rebaseMetadata,
						genId,
					);
				}
			}
		}
	}

	private rebaseInvalidatedField(
		baseField: FieldChange,
		crossFieldTable: RebaseTable,
		context: RebaseFieldContext,
		rebaseMetadata: RebaseRevisionMetadata,
		genId: IdAllocator,
	): void {
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

			if (base !== undefined && getFromChangeAtomIdMap(context.baseNodeIds, base) === true) {
				return base;
			}

			return undefined;
		};

		let allowInval = false;
		if (crossFieldTable.fieldsWithUnattachedChild.has(baseField)) {
			crossFieldTable.fieldsWithUnattachedChild.delete(baseField);
			allowInval = true;
		}

		context.rebasedChange.change = brand(
			changeHandler.rebaser.rebase(
				fieldChangeset,
				baseChangeset,
				rebaseChild,
				genId,
				new RebaseNodeManagerI(crossFieldTable, context.fieldId, allowInval),
				rebaseMetadata,
				crossFieldTable.rebaseVersion,
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
			const updatedRebasedNode: Mutable<NodeChangeset> = cloneNodeChangeset(rebasedNode);
			setInChangeAtomIdMap(rebasedNodes, nodeId, updatedRebasedNode);

			if (updatedRebasedNode.fieldChanges === undefined) {
				updatedRebasedNode.fieldChanges = new Map([[fieldKey, rebasedField]]);
				return;
			}

			assert(
				!updatedRebasedNode.fieldChanges.has(fieldKey),
				0x9c4 /* Expected an empty field */,
			);
			updatedRebasedNode.fieldChanges.set(fieldKey, rebasedField);
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
			const renamedRoot = firstAttachIdFromDetachId(
				table.baseChange.rootNodes,
				parentBase.root,
				1,
			).value;

			const attachField = table.baseChange.crossFieldKeys.getFirst(
				{ ...renamedRoot, target: NodeMoveType.Attach },
				1,
			).value;

			if (attachField === undefined) {
				const baseDetachLocation = table.baseChange.rootNodes.detachLocations.getFirst(
					parentBase.root,
					1,
				).value;

				assignRootChange(
					table.rebasedRootNodes,
					table.rebasedNodeToParent,
					renamedRoot,
					baseNodeId,
					baseDetachLocation,
					table.rebaseVersion,
				);

				// We need to make sure the rebased changeset includes the detach location,
				// so we add that field to `affectedBaseFields` unless it's already been processed.
				if (
					baseDetachLocation !== undefined &&
					!table.baseFieldToContext.has(
						fieldChangeFromId(table.baseChange, baseDetachLocation),
					)
				) {
					table.affectedBaseFields.set(fieldIdKeyFromFieldId(baseDetachLocation), true);
				}
			} else {
				// The base change inserts this node into `attachField`, so the rebased change should represent this node there.
				const normalizedAttachField = normalizeFieldId(
					attachField,
					table.baseChange.nodeAliases,
				);

				const entry: DetachedNodeEntry = table.entries.getFirst(renamedRoot, 1).value ?? {};
				table.entries.set(renamedRoot, 1, { ...entry, nodeChange: baseNodeId });
				table.affectedBaseFields.set(fieldIdKeyFromFieldId(normalizedAttachField), true);
				this.attachRebasedNode(
					rebasedFields,
					rebasedNodes,
					table,
					baseNodeId,
					{ field: normalizedAttachField },
					idAllocator,
					metadata,
				);
			}

			return;
		}

		const parentFieldIdBase = parentBase.field;
		const baseFieldChange = fieldChangeFromId(table.baseChange, parentFieldIdBase);

		const rebasedFieldId = rebasedFieldIdFromBaseId(table, parentFieldIdBase);
		setInChangeAtomIdMap(table.rebasedNodeToParent, baseNodeId, { field: rebasedFieldId });

		const context = table.baseFieldToContext.get(baseFieldChange);
		if (context !== undefined) {
			// We've already processed this field.
			// The new child node will be attached in the next pass.
			// Note that adding to `fieldsWithUnattachedChild` allows that field to generate new invalidations,
			// so to avoid invalidation cycles we make sure we only add to it once per new unattached child.
			// This is done by checking whether `context.baseNodeIds` already contained `baseNodeId`.
			if (setInChangeAtomIdMap(context.baseNodeIds, baseNodeId, true)) {
				table.fieldsWithUnattachedChild.add(baseFieldChange);
				table.affectedBaseFields.set(fieldIdKeyFromFieldId(parentFieldIdBase), true);
			}
			return;
		}

		this.rebaseFieldWithoutNewChanges(
			baseFieldChange,
			parentFieldIdBase,
			table,
			rebasedFields,
			rebasedNodes,
			idAllocator,
			metadata,
			baseNodeId,
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
				fieldChangeset,
				baseChangeset,
				rebaseChild,
				genId,
				manager,
				revisionMetadata,
				crossFieldTable.rebaseVersion,
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
				baseNodeIds: newChangeAtomIdBTree(),
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
		const change = nodeChangeFromId(
			crossFieldTable.newChange.nodeChanges,
			crossFieldTable.newChange.nodeAliases,
			newId,
		);
		const over = nodeChangeFromId(
			crossFieldTable.baseChange.nodeChanges,
			crossFieldTable.baseChange.nodeAliases,
			baseId,
		);

		const baseMap: FieldChangeMap = over?.fieldChanges ?? new Map<FieldKey, FieldChange>();

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

		const rebasedChange: Mutable<NodeChangeset> = {};

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
			// XXX: This is incorrect if the rebased changeset attaches the node.
			// Efficiently computing whether the changeset attaches the node would require maintaining a mapping from node ID to attach ID.
			// Alternatively, we could only set the input attach/detach state here, and set the output detach state by viewing fields?
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
				// XXX: This is incorrect if the rebased changeset detaches this node.
				// Efficiently computing whether the changeset detaches the node would require maintaining a mapping from node ID to detach ID.
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
		const node = getFromChangeAtomIdMap(nodes, nodeId) ?? fail(0xb24 /* Unknown node ID */);

		const updatedNode: Mutable<NodeChangeset> = { ...node };
		setInChangeAtomIdMap(nodes, nodeId, updatedNode);

		if (node.nodeExistsConstraint !== undefined) {
			const isNowViolated = inputAttachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraint.violated !== isNowViolated) {
				updatedNode.nodeExistsConstraint = {
					...node.nodeExistsConstraint,
					violated: isNowViolated,
				};
				constraintState.violationCount += isNowViolated ? 1 : -1;
			}
		}
		if (node.nodeExistsConstraintOnRevert !== undefined) {
			const isNowViolated = outputAttachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraintOnRevert.violated !== isNowViolated) {
				updatedNode.nodeExistsConstraintOnRevert = {
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
		parentId: NodeId | undefined,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
		aliases: ChangeAtomIdBTree<NodeId>,
		roots: RootNodeTable,
		fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
		fieldsToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	): FieldChangeMap | undefined {
		if (changeset === undefined) {
			return undefined;
		}

		const prunedChangeset: FieldChangeMap = new Map();
		for (const [field, fieldChange] of changeset) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);

			const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
				this.pruneNodeChange(
					nodeId,
					nodeMap,
					nodeToParent,
					aliases,
					roots,
					fieldsWithRootMoves,
					fieldsToRootChanges,
				),
			);

			const fieldId: FieldId = { nodeId: parentId, field };
			const fieldIdKey = fieldIdKeyFromFieldId(fieldId);
			const rootsWithChanges = fieldsToRootChanges.get(fieldIdKey) ?? [];
			let hasRootWithNodeChange = false;
			for (const rootId of rootsWithChanges) {
				const nodeId =
					getFromChangeAtomIdMap(roots.nodeChanges, rootId) ?? fail("No root change found");

				const isRootChangeEmpty =
					this.pruneNodeChange(
						nodeId,
						nodeMap,
						nodeToParent,
						aliases,
						roots,
						fieldsWithRootMoves,
						fieldsToRootChanges,
					) === undefined;

				if (isRootChangeEmpty) {
					roots.nodeChanges.delete([rootId.revision, rootId.localId]);
					tryRemoveDetachLocation(roots, rootId, 1);
				} else {
					hasRootWithNodeChange = true;
				}
			}

			const hasRootChanges =
				hasRootWithNodeChange || fieldsWithRootMoves.get(fieldIdKey) === true;

			if (!handler.isEmpty(prunedFieldChangeset) || hasRootChanges) {
				prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
			}
		}

		return prunedChangeset.size > 0 ? prunedChangeset : undefined;
	}

	private pruneRoots(
		roots: RootNodeTable,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
		aliases: ChangeAtomIdBTree<NodeId>,
		fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
		fieldsToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	): RootNodeTable {
		const pruned: RootNodeTable = { ...roots, nodeChanges: newChangeAtomIdBTree() };
		for (const [rootIdKey, nodeId] of roots.nodeChanges.entries()) {
			const rootId: ChangeAtomId = { revision: rootIdKey[0], localId: rootIdKey[1] };
			const hasDetachLocation = roots.detachLocations.getFirst(rootId, 1).value !== undefined;

			// If the root has a detach location it should be pruned by recursion when pruning the field it was detached from.
			const prunedId = hasDetachLocation
				? nodeId
				: this.pruneNodeChange(
						nodeId,
						nodeMap,
						nodeToParent,
						aliases,
						roots,
						fieldsWithRootMoves,
						fieldsToRootChanges,
					);

			if (prunedId !== undefined) {
				pruned.nodeChanges.set(rootIdKey, prunedId);
			}

			tryRemoveDetachLocation(pruned, rootId, 1);
		}

		return pruned;
	}

	private pruneNodeChange(
		nodeId: NodeId,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
		nodeToParent: ChangeAtomIdBTree<NodeLocation>,
		aliases: ChangeAtomIdBTree<NodeId>,
		roots: RootNodeTable,
		fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
		fieldsToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	): NodeId | undefined {
		const changeset = nodeChangeFromId(nodes, aliases, nodeId);
		const prunedFields =
			changeset.fieldChanges === undefined
				? undefined
				: this.pruneFieldMap(
						changeset.fieldChanges,
						nodeId,
						nodes,
						nodeToParent,
						aliases,
						roots,
						fieldsWithRootMoves,
						fieldsToRootChanges,
					);

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

	public getRevisions(change: ModularChangeset): Set<RevisionTag | undefined> {
		if (change.revisions === undefined || change.revisions.length === 0) {
			return new Set([undefined]);
		}
		const aggregated: Set<RevisionTag | undefined> = new Set();
		for (const revInfo of change.revisions) {
			aggregated.add(revInfo.revision);
		}
		return aggregated;
	}

	public changeRevision(
		change: ModularChangeset,
		replacer: RevisionReplacer,
	): ModularChangeset {
		const updatedFields = this.replaceFieldMapRevisions(change.fieldChanges, replacer);
		const updatedNodes = replaceIdMapRevisions(change.nodeChanges, replacer, (nodeChangeset) =>
			this.replaceNodeChangesetRevisions(nodeChangeset, replacer),
		);
		const updatedNodeToParent = replaceIdMapRevisions(
			change.nodeToParent,
			replacer,
			(location) =>
				replaceNodeLocationRevision(
					normalizeNodeLocation(location, change.nodeAliases),
					replacer,
				),
		);

		const updated: Mutable<ModularChangeset> = {
			...change,
			fieldChanges: updatedFields,
			nodeChanges: updatedNodes,
			nodeToParent: updatedNodeToParent,
			rootNodes: replaceRootTableRevision(change.rootNodes, replacer, change.nodeAliases),

			// We've updated all references to old node IDs, so we no longer need an alias table.
			nodeAliases: newChangeAtomIdBTree(),
			crossFieldKeys: replaceCrossFieldKeyTableRevisions(
				change.crossFieldKeys,
				replacer,
				change.nodeAliases,
			),
		};

		if (change.builds !== undefined) {
			updated.builds = replaceIdMapRevisions(change.builds, replacer);
		}

		if (change.destroys !== undefined) {
			updated.destroys = replaceIdMapRevisions(change.destroys, replacer);
		}

		if (change.refreshers !== undefined) {
			updated.refreshers = replaceIdMapRevisions(change.refreshers, replacer);
		}

		updated.revisions = [{ revision: replacer.updatedRevision }];

		return updated;
	}

	private replaceNodeChangesetRevisions(
		nodeChangeset: NodeChangeset,
		replacer: RevisionReplacer,
	): NodeChangeset {
		const updated = { ...nodeChangeset };
		if (nodeChangeset.fieldChanges !== undefined) {
			updated.fieldChanges = this.replaceFieldMapRevisions(
				nodeChangeset.fieldChanges,
				replacer,
			);
		}

		return updated;
	}

	private replaceFieldMapRevisions(
		fields: FieldChangeMap,
		replacer: RevisionReplacer,
	): FieldChangeMap {
		const updatedFields: FieldChangeMap = new Map();
		for (const [field, fieldChange] of fields) {
			const updatedFieldChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.replaceRevisions(fieldChange.change, replacer);

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
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<ModularChangeset>) => void,
		rebaseVersion: RebaseVersion = 1,
	): ModularEditBuilder {
		return new ModularEditBuilder(
			this,
			this.fieldKinds,
			changeReceiver,
			this.codecOptions,
			rebaseVersion,
		);
	}

	private createEmptyFieldChange(fieldKind: FieldKindIdentifier): FieldChange {
		const emptyChange = getChangeHandler(this.fieldKinds, fieldKind).createEmpty();
		return { fieldKind, change: brand(emptyChange) };
	}

	private getEffectiveChange(change: ModularChangeset): ModularChangeset {
		if (hasConflicts(change)) {
			return this.muteChange(change);
		}
		return change;
	}

	/**
	 * Returns a copy of the given changeset with the same declarations (e.g., new cells) but no actual changes.
	 */
	private muteChange(change: ModularChangeset): ModularChangeset {
		const muted: Mutable<ModularChangeset> = {
			...change,
			rootNodes: muteRootChanges(change.rootNodes),
			crossFieldKeys: newCrossFieldRangeTable(),
			fieldChanges: this.muteFieldChanges(change.fieldChanges),
			nodeChanges: brand(change.nodeChanges.mapValues((v) => this.muteNodeChange(v))),
		};
		return muted;
	}

	private muteNodeChange(change: NodeChangeset): NodeChangeset {
		if (change.fieldChanges === undefined) {
			return change;
		}
		return {
			...change,
			fieldChanges: this.muteFieldChanges(change.fieldChanges),
		};
	}

	private muteFieldChanges(change: FieldChangeMap): FieldChangeMap {
		return new Map(
			Array.from(change.entries(), ([key, value]) => [key, this.muteFieldChange(value)]),
		);
	}

	private muteFieldChange(change: FieldChange): FieldChange {
		const handler = getChangeHandler(this.fieldKinds, change.fieldKind);
		return {
			fieldKind: change.fieldKind,
			change: brand(handler.rebaser.mute(change.change)),
		};
	}
}

function replaceCrossFieldKeyTableRevisions(
	table: CrossFieldKeyTable,
	replacer: RevisionReplacer,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): CrossFieldKeyTable {
	const updated: CrossFieldKeyTable = newCrossFieldRangeTable();
	for (const entry of table.entries()) {
		const key = entry.start;
		const updatedKey: CrossFieldKey = replacer.getUpdatedAtomId(key, entry.length);

		const field = entry.value;
		const normalizedFieldId = normalizeFieldId(field, nodeAliases);
		const updatedNodeId =
			normalizedFieldId.nodeId === undefined
				? undefined
				: replacer.getUpdatedAtomId(normalizedFieldId.nodeId);

		const updatedValue: FieldId = {
			...normalizedFieldId,
			nodeId: updatedNodeId,
		};

		updated.set(updatedKey, entry.length, updatedValue);
	}

	return updated;
}

function replaceIdMapRevisions<T>(
	map: ChangeAtomIdBTree<T>,
	replacer: RevisionReplacer,
	valueMapper: (value: T) => T = (value) => value,
): ChangeAtomIdBTree<T> {
	const updated = newChangeAtomIdBTree<T>();
	for (const [[revision, localId], value] of map.entries()) {
		const newAtom = replacer.getUpdatedAtomId({ revision, localId });
		updated.set([newAtom.revision, newAtom.localId], valueMapper(value));
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
			change1.builds ?? newChangeAtomIdBTree(),
			change2.builds ?? newChangeAtomIdBTree(),
			true,
		),
	);

	const allDestroys: ChangeAtomIdBTree<number> = brand(
		mergeTupleBTrees(
			change1.destroys ?? newChangeAtomIdBTree(),
			change2.destroys ?? newChangeAtomIdBTree(),
		),
	);

	const allRefreshers: ChangeAtomIdBTree<TreeChunk> = brand(
		mergeTupleBTrees(
			change1.refreshers ?? newChangeAtomIdBTree(),
			change2.refreshers ?? newChangeAtomIdBTree(),
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
): Iterable<DeltaDetachedNodeId> {
	const rootIds: ChangeAtomIdRangeMap<boolean> = newChangeAtomIdRangeMap();
	addAttachesToSet(change, rootIds);
	addRenamesToSet(change, rootIds);

	for (const [[revision, localId]] of change.rootNodes.nodeChanges.entries()) {
		rootIds.set({ revision, localId }, 1, true);
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
		if (entry.start.target !== NodeMoveType.Attach) {
			continue;
		}

		for (const detachIdEntry of change.rootNodes.newToOldId.getAll2(
			entry.start,
			entry.length,
		)) {
			const detachId =
				detachIdEntry.value ?? offsetChangeAtomId(entry.start, detachIdEntry.offset);
			for (const detachEntry of change.crossFieldKeys.getAll2(
				{ ...detachId, target: NodeMoveType.Detach },
				detachIdEntry.length,
			)) {
				if (detachEntry.value === undefined) {
					rootIds.set(
						offsetChangeAtomId(detachId, detachEntry.offset),
						detachEntry.length,
						true,
					);
				}
			}
		}
	}
}

function addRenamesToSet(
	change: ModularChangeset,
	rootIds: ChangeAtomIdRangeMap<boolean>,
): void {
	for (const renameEntry of change.rootNodes.oldToNewId.entries()) {
		for (const detachEntry of change.crossFieldKeys.getAll2(
			{ ...renameEntry.start, target: NodeMoveType.Detach },
			renameEntry.length,
		)) {
			// We only want to include renames of nodes which are detached in the input context of the changeset.
			// So if there is a detach for the node, the rename is not relevant.
			if (detachEntry.value === undefined) {
				rootIds.set(renameEntry.start, renameEntry.length, true);
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
	const refreshers = newChangeAtomIdBTree<TreeChunk>();
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
		rebaseVersion,
		fieldChanges,
		nodeChanges,
		nodeToParent,
		nodeAliases,
		crossFieldKeys,
		maxId,
		revisions,
		constraintViolationCount,
		constraintViolationCountOnRevert,
		builds,
		destroys,
		rootNodes,
	} = change;

	return makeModularChangeset({
		rebaseVersion,
		fieldChanges,
		nodeChanges,
		nodeToParent,
		nodeAliases,
		crossFieldKeys,
		rootNodes,
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
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): DeltaRoot {
	const change = taggedChange.change;
	const rootDelta: Mutable<DeltaRoot> = {};

	if (!hasConflicts(change)) {
		// If there are no constraint violations, then tree changes apply.
		const fieldDeltas = intoDeltaImpl(
			change.fieldChanges,
			change.nodeChanges,
			change.nodeAliases,
			fieldKinds,
		);

		const global: DeltaDetachedNodeChanges[] = [];
		for (const [[major, minor], nodeId] of change.rootNodes.nodeChanges.entries()) {
			global.push({
				id: { major, minor },
				fields: deltaFromNodeChange(
					nodeChangeFromId(change.nodeChanges, change.nodeAliases, nodeId),
					change.nodeChanges,
					change.nodeAliases,
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
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();

	for (const [field, fieldChange] of change) {
		const fieldDelta = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			fieldChange.change,
			(childChange): DeltaFieldMap => {
				const nodeChange = nodeChangeFromId(nodeChanges, nodeAliases, childChange);
				return deltaFromNodeChange(nodeChange, nodeChanges, nodeAliases, fieldKinds);
			},
		);
		if (fieldDelta !== undefined && fieldDelta.marks.length > 0) {
			delta.set(field, fieldDelta);
		}
	}
	return delta;
}

function deltaFromNodeChange(
	change: NodeChangeset,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, nodeChanges, nodeAliases, fieldKinds);
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
 * @returns RebaseRevisionMetadata to be passed to `FieldChangeRebaser.rebase`*
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

function removeUnnecessaryDetachLocations(
	roots: RootNodeTable,
	rebaseVersion: RebaseVersion,
): void {
	if (rebaseVersion > 1) {
		// Detach locations are not needed in newer rebase versions.
		// We delete the detach location entries as a normalization.
		roots.detachLocations.clear();
		roots.outputDetachLocations.clear();
	}
}

function isEmptyNodeChangeset(change: NodeChangeset): boolean {
	return (
		change.fieldChanges === undefined &&
		change.nodeExistsConstraint === undefined &&
		change.nodeExistsConstraintOnRevert === undefined
	);
}

export function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	kind: FieldKindIdentifier,
): FlexFieldKind {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return fieldKind;
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
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

interface RebaseTable {
	readonly rebaseVersion: RebaseVersion;

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

export type FieldIdKey = readonly [
	RevisionTag | undefined,
	ChangesetLocalId | undefined,
	FieldKey,
];

interface RebaseFieldContext {
	baseChange: FieldChange;
	newChange: FieldChange;
	rebasedChange: FieldChange;
	fieldId: FieldId;

	/**
	 * The set of node IDs in the base changeset which should be included in the rebased field,
	 * even if there is no corresponding node changeset in the new change.
	 */
	baseNodeIds: ChangeAtomIdBTree<boolean>;
}

function newComposeTable(
	baseChange: ModularChangeset,
	newChange: ModularChangeset,
	composedRootNodes: RootNodeTable,
	removedCrossFieldKeys: CrossFieldRangeTable<boolean>,
	pendingCompositions: PendingCompositions,
): ComposeTable {
	return {
		rebaseVersion: Math.max(
			baseChange.rebaseVersion,
			newChange.rebaseVersion,
		) as RebaseVersion,
		movedNodeIds: newChangeAtomIdRangeMap(),
		baseChange,
		newChange,
		fieldToContext: new Map(),
		newFieldToBaseField: new Map(),
		newToBaseNodeId: newChangeAtomIdBTree(),
		composedNodes: new Set(),
		movedNodeToParent: newChangeAtomIdBTree(),
		composedRootNodes,
		attachDetachRenames: newChangeAtomIdTransform(),
		deletedRenames: newChangeAtomIdRangeMap(),
		addedCrossFieldKeys: newCrossFieldRangeTable(),
		removedCrossFieldKeys,
		pendingCompositions,
	};
}

interface ComposeTable {
	readonly rebaseVersion: RebaseVersion;

	// Entries are keyed on detach ID
	readonly movedNodeIds: ChangeAtomIdRangeMap<NodeId>;
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

	/**
	 * Maps from attach ID in change1 to a corresponding detach ID in change2.
	 */
	readonly attachDetachRenames: ChangeAtomIdRangeMap<ChangeAtomId>;

	/**
	 * The set of root IDs (in the input context of the composed change)
	 * which should have any associated rename removed from the composed change.
	 */
	readonly deletedRenames: ChangeAtomIdRangeMap<true>;
	readonly removedCrossFieldKeys: CrossFieldRangeTable<boolean>;
	readonly addedCrossFieldKeys: CrossFieldRangeTable<FieldId>;
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

	// XXX: Renmove `newAttachId` parameter.
	public invertDetach(
		detachId: ChangeAtomId,
		count: number,
		nodeChange: NodeId | undefined,
		newAttachId: ChangeAtomId,
	): void {
		assert(areEqualChangeAtomIds(newAttachId, this.getInvertedMoveId(detachId)), "XXX");

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

		const newDetachId = this.getInvertedMoveId(attachIdEntry.value);
		for (const entry of doesChangeAttachNodes(
			this.table.change.crossFieldKeys,
			attachIdEntry.value,
			countProcessed,
		)) {
			const offsetDetachId = offsetChangeAtomId(newDetachId, entry.offset);
			const offsetAttachId = offsetChangeAtomId(newAttachId, entry.offset);
			if (entry.value) {
				if (!areEqualChangeAtomIds(offsetDetachId, offsetAttachId)) {
					// We are inverting a detach is part of a move, where the detach and attach IDs of the move are different.
					// We need to create a rename from the new detach ID to the new attach ID.
					// XXX: This assumes that the field which inverts the attach uses the expected detach ID.
					// This should be added to the contract of `invertAttach`.
					this.table.attachToDetachId.set(offsetAttachId, entry.length, offsetDetachId);
				}
			} else {
				const offsetOriginalAttachId = offsetChangeAtomId(attachIdEntry.value, entry.offset);
				if (!areEqualChangeAtomIds(offsetOriginalAttachId, offsetAttachId)) {
					// We are inverting a detach which is not part of a move.
					// The inverted changeset needs to have a rename from the existing root ID (`offsetOriginalAttachId`)
					// to the new attach ID (`offsetAttachId`).
					this.table.attachToDetachId.set(
						offsetAttachId,
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

	private getInvertedMoveId(id: ChangeAtomId): ChangeAtomId {
		return this.table.isRollback
			? id
			: { revision: this.table.invertRevision, localId: id.localId };
	}
}

class RebaseNodeManagerI implements RebaseNodeManager {
	public constructor(
		private readonly table: RebaseTable,
		private readonly fieldId: FieldId,
		private readonly allowInval: boolean = true,
	) {}

	// TODO: Should this just return an empty DetachNodeEntry instead of undefined?
	public getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<DetachedNodeEntry | undefined> {
		let countToProcess = count;

		const detachEntry = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			countToProcess,
		);

		countToProcess = detachEntry.length;

		const nodeEntry = rangeQueryChangeAtomIdMap(
			this.table.newChange.rootNodes.nodeChanges,
			detachEntry.value,
			countToProcess,
		);

		countToProcess = nodeEntry.length;
		const newNodeId = nodeEntry.value;

		const newRenameEntry = getFirstRenameId(
			this.table.newChange.rootNodes,
			detachEntry.value,
			countToProcess,
		);

		countToProcess = newRenameEntry.length;

		let result: RangeQueryResult<DetachedNodeEntry | undefined>;
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
		const attachIdEntry = firstAttachIdFromDetachId(
			this.table.baseRoots,
			baseDetachId,
			countToProcess,
		);
		const baseAttachId = attachIdEntry.value;
		countToProcess = attachIdEntry.length;

		const attachFieldEntry = getFirstFieldForAttach(
			this.table.baseChange,
			baseAttachId,
			countToProcess,
		);
		countToProcess = attachFieldEntry.length;

		const detachedMoveEntry = this.table.baseChange.rootNodes.outputDetachLocations.getFirst(
			baseAttachId,
			countToProcess,
		);
		countToProcess = detachedMoveEntry.length;

		const destinationField = attachFieldEntry.value ?? detachedMoveEntry.value;
		if (destinationField !== undefined) {
			// The base detach is part of a move (or move of detach location) in the base changeset.
			setInCrossFieldMap(this.table.entries, baseAttachId, countToProcess, {
				nodeChange,
				detachId: newDetachId,
			});

			if (nodeChange !== undefined || newDetachId !== undefined) {
				this.invalidateBaseFields([destinationField]);
			}
		}

		if (attachFieldEntry.value === undefined) {
			// These nodes are detached in the output context of the base changeset.
			if (nodeChange !== undefined) {
				assignRootChange(
					this.table.rebasedRootNodes,
					this.table.rebasedNodeToParent,
					baseAttachId,
					nodeChange,
					this.fieldId,
					this.table.rebaseVersion,
				);
			}

			if (newDetachId !== undefined) {
				insertRootRename(
					this.table.rebasedRootNodes,
					baseAttachId,
					newDetachId,
					undefined,
					(oldId, newId, length) =>
						this.table.newChange.rootNodes.outputDetachLocations.getFirst(newId, length),
					countToProcess,
					undefined,
					this.table.newChange.rootNodes,
					(_id, length) => ({ value: this.fieldId, length }),
				);
			}
		}

		if (newDetachId !== undefined) {
			this.table.movedDetaches.set(newDetachId, countToProcess, true);
		}

		if (countToProcess < count) {
			const remainingCount = count - countToProcess;

			const nextDetachId =
				newDetachId === undefined
					? undefined
					: offsetChangeAtomId(newDetachId, countToProcess);

			this.rebaseOverDetach(
				offsetChangeAtomId(baseDetachId, countToProcess),
				remainingCount,
				nextDetachId,
				nodeChange,
			);
		}
	}

	public addDetach(id: ChangeAtomId, count: number): void {
		this.table.rebasedDetachLocations.set(id, count, this.fieldId);
	}

	public removeDetach(id: ChangeAtomId, count: number): void {
		this.table.movedDetaches.set(id, count, true);
	}

	public doesBaseAttachNodes(
		id: ChangeAtomId,
		count: number,
	): RangeQueryEntry<ChangeAtomId, boolean> {
		let countToProcess = count;
		const attachEntry = getFirstAttachField(
			this.table.baseChange.crossFieldKeys,
			id,
			countToProcess,
		);

		countToProcess = attachEntry.length;
		return { start: id, value: attachEntry.value !== undefined, length: countToProcess };
	}

	public getBaseRename(
		id: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId | undefined> {
		return this.table.baseChange.rootNodes.oldToNewId.getFirst(id, count);
	}

	public getNewRenameForBaseRename(
		baseRenameTo: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId | undefined> {
		let countToProcess = count;
		const inputEntry = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseRenameTo,
			countToProcess,
		);

		const attachEntry = getFirstAttachField(
			this.table.baseChange.crossFieldKeys,
			baseRenameTo,
			countToProcess,
		);

		countToProcess = attachEntry.length;
		if (attachEntry.value !== undefined) {
			// These nodes are attached in the output context of the base changeset.
			return { value: undefined, length: countToProcess };
		}

		countToProcess = inputEntry.length;
		const inputId = inputEntry.value;

		const moveEntry = this.table.entries.getFirst(baseRenameTo, countToProcess);

		countToProcess = moveEntry.length;
		if (moveEntry.value !== undefined) {
			return { ...moveEntry, value: moveEntry.value.detachId };
		}

		return this.table.newChange.rootNodes.oldToNewId.getFirst(inputId, countToProcess);
	}

	private invalidateBaseFields(fields: FieldId[]): void {
		if (this.allowInval) {
			for (const fieldId of fields) {
				this.table.affectedBaseFields.set(fieldIdKeyFromFieldId(fieldId), true);
			}
		}
	}
}

function assignRootChange(
	table: RootNodeTable,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	detachId: ChangeAtomId,
	nodeId: NodeId,
	detachLocation: FieldId | undefined,
	rebaseVersion: RebaseVersion,
): void {
	assert(
		rebaseVersion >= 2 || detachLocation !== undefined,
		"All root changes need a detach location to support compatibility with older client versions",
	);

	setInChangeAtomIdMap(table.nodeChanges, detachId, nodeId);
	setInChangeAtomIdMap(nodeToParent, nodeId, { root: detachId });

	table.detachLocations.set(detachId, 1, detachLocation);
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
	): RangeQueryResult<NodeId | undefined> {
		let countToProcess = count;

		const newIdEntry = firstAttachIdFromDetachId(
			this.table.baseChange.rootNodes,
			baseDetachId,
			count,
		);
		countToProcess = newIdEntry.length;

		const baseAttachEntry = getFirstFieldForAttach(
			this.table.baseChange,
			newIdEntry.value,
			countToProcess,
		);

		countToProcess = baseAttachEntry.length;

		let result: RangeQueryResult<NodeId | undefined>;
		if (baseAttachEntry.value === undefined) {
			// The detached nodes are still detached in the new change's input context.
			result = rangeQueryChangeAtomIdMap(
				this.table.newChange.rootNodes.nodeChanges,
				newIdEntry.value,
				countToProcess,
			);

			countToProcess = result.length;
		} else {
			// The base detach was part of a move.
			// We check if we've previously seen a node change at the move destination.
			result = this.table.movedNodeIds.getFirst(baseDetachId, countToProcess);
			countToProcess = result.length;
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
		let countToProcess = count;

		const newAttachIdEntry = firstAttachIdFromDetachId(
			this.table.newChange.rootNodes,
			newDetachId,
			countToProcess,
		);
		countToProcess = newAttachIdEntry.length;

		const newAttachEntry = getFirstAttachField(
			this.table.newChange.crossFieldKeys,
			newAttachIdEntry.value,
			countToProcess,
		);

		countToProcess = newAttachEntry.length;

		const baseRootIdEntry = firstDetachIdFromAttachId(
			this.table.baseChange.rootNodes,
			baseAttachId,
			countToProcess,
		);
		countToProcess = baseRootIdEntry.length;

		const baseDetachId = baseRootIdEntry.value;

		if (!areEqualChangeAtomIds(newDetachId, baseAttachId)) {
			this.table.attachDetachRenames.set(baseAttachId, countToProcess, newDetachId);
		}

		// Both changes can have the same ID if they came from inverse changesets
		const hasNewAttachWithBaseAttachId =
			newAttachEntry.value !== undefined &&
			areEqualChangeAtomIds(baseAttachId, newAttachIdEntry.value);

		if (!hasNewAttachWithBaseAttachId) {
			// The new attach may still exist in the composed changeset so we do not remove it here.
			// The new attach will typically cancel with a base detach,
			// in which case the cross-field key will be removed in `composeDetachAttach`.
			this.table.removedCrossFieldKeys.set(
				{ ...baseAttachId, target: NodeMoveType.Attach },
				countToProcess,
				true,
			);
		}

		const baseDetachEntry = getFirstDetachField(
			this.table.baseChange.crossFieldKeys,
			baseDetachId,
			countToProcess,
		);

		countToProcess = baseDetachEntry.length;

		const hasBaseDetachWithNewDetachId =
			baseDetachEntry.value !== undefined && areEqualChangeAtomIds(newDetachId, baseDetachId);

		if (!hasBaseDetachWithNewDetachId) {
			// The base detach may still exist in the composed changeset so we do not remove it here.
			// The base detach will typically cancel with a new attach,
			// in which case the cross-field key will be removed in `composeDetachAttach`.
			this.table.removedCrossFieldKeys.set(
				{ ...newDetachId, target: NodeMoveType.Detach },
				countToProcess,
				true,
			);
		}

		if (newAttachEntry.value === undefined) {
			const newOutputDetachLocationEntry =
				this.table.newChange.rootNodes.outputDetachLocations.getFirst(
					newDetachId,
					countToProcess,
				);

			countToProcess = newOutputDetachLocationEntry.length;
		}

		if (countToProcess < count) {
			const remainingCount = count - countToProcess;
			this.composeAttachDetach(
				offsetChangeAtomId(baseAttachId, countToProcess),
				offsetChangeAtomId(newDetachId, countToProcess),
				remainingCount,
			);
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
				target: NodeMoveType.Detach,
			},
			1,
		);

		if (detachFields.length > 0) {
			// The base attach is part of a move in the base changeset.
			this.table.movedNodeIds.set(baseDetachId, 1, newChanges);

			if (newChanges !== undefined) {
				this.invalidateBaseFields(detachFields);
			}
		} else {
			const baseNodeId = getFromChangeAtomIdMap(
				this.table.baseChange.rootNodes.nodeChanges,
				baseDetachId,
			);

			if (baseNodeId === undefined) {
				assignRootChange(
					this.table.composedRootNodes,
					this.table.movedNodeToParent,
					baseDetachId,
					newChanges,
					this.fieldId,
					this.table.rebaseVersion,
				);
			} else {
				addNodesToCompose(this.table, baseNodeId, newChanges);
			}
		}
	}

	public composeDetachAttach(
		baseDetachId: ChangeAtomId,
		newAttachId: ChangeAtomId,
		count: number,
	): void {
		if (!areEqualChangeAtomIds(baseDetachId, newAttachId)) {
			// The pin will have `baseDetachId` as both its detach and attach ID.
			// So we remove `newAttachId` unless that is equal to the pin's detach ID.
			this.table.removedCrossFieldKeys.set(
				{ target: NodeMoveType.Attach, ...newAttachId },
				count,
				true,
			);
		}

		// We add `baseDetachId` as an attach ID.
		this.table.addedCrossFieldKeys.set(
			{ target: NodeMoveType.Attach, ...baseDetachId },
			count,
			this.fieldId,
		);

		// In the case where `baseDetachId` is part of a rollback of a move in change2,
		// change2 will also have a detach with `baseDetachId`.
		// We make sure that `baseDetachId` is registered in this field in the composed change.
		// In other cases, this line is unnecessary but harmless.
		this.table.addedCrossFieldKeys.set(
			{ target: NodeMoveType.Detach, ...baseDetachId },
			count,
			this.fieldId,
		);

		// We remove any rename from `baseDetachId`, since it is now reattached with the same ID.
		this.table.deletedRenames.set(baseDetachId, count, true);
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

function makeModularChangeset(props?: {
	rebaseVersion: RebaseVersion;
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
	noChangeConstraint?: NoChangeConstraint;
	noChangeConstraintOnRevert?: NoChangeConstraint;
	builds?: ChangeAtomIdBTree<TreeChunk>;
	destroys?: ChangeAtomIdBTree<number>;
	refreshers?: ChangeAtomIdBTree<TreeChunk>;
}): ModularChangeset {
	const p = props ?? { maxId: -1, rebaseVersion: 1 };
	const changeset: Mutable<ModularChangeset> = {
		rebaseVersion: p.rebaseVersion,
		fieldChanges: p.fieldChanges ?? new Map<FieldKey, FieldChange>(),
		nodeChanges: p.nodeChanges ?? newChangeAtomIdBTree(),
		rootNodes: p.rootNodes ?? newRootTable(),
		nodeToParent: p.nodeToParent ?? newChangeAtomIdBTree(),
		nodeAliases: p.nodeAliases ?? newChangeAtomIdBTree(),
		crossFieldKeys: p.crossFieldKeys ?? newCrossFieldRangeTable(),
	};

	if (p.revisions !== undefined && p.revisions.length > 0) {
		changeset.revisions = p.revisions;
	}
	if (p.maxId >= 0) {
		changeset.maxId = brand(p.maxId);
	}
	if (p.constraintViolationCount !== undefined && p.constraintViolationCount > 0) {
		changeset.constraintViolationCount = p.constraintViolationCount;
	}
	if (
		p.constraintViolationCountOnRevert !== undefined &&
		p.constraintViolationCountOnRevert > 0
	) {
		changeset.constraintViolationCountOnRevert = p.constraintViolationCountOnRevert;
	}
	if (p.noChangeConstraint !== undefined) {
		changeset.noChangeConstraint = p.noChangeConstraint;
	}
	if (p.noChangeConstraintOnRevert !== undefined) {
		changeset.noChangeConstraintOnRevert = p.noChangeConstraintOnRevert;
	}
	if (p.builds !== undefined && p.builds.size > 0) {
		changeset.builds = p.builds;
	}
	if (p.destroys !== undefined && p.destroys.size > 0) {
		changeset.destroys = p.destroys;
	}
	if (p.refreshers !== undefined && p.refreshers.size > 0) {
		changeset.refreshers = p.refreshers;
	}

	return changeset;
}

export class ModularEditBuilder extends EditBuilder<ModularChangeset> {
	private transactionDepth: number = 0;
	private idAllocator: IdAllocator;
	private readonly codecOptions: CodecWriteOptions;
	public readonly rebaseVersion: RebaseVersion;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, ModularChangeset>,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
		changeReceiver: (change: TaggedChange<ModularChangeset>) => void,
		codecOptions: CodecWriteOptions,
		rebaseVersionOverride?: RebaseVersion,
	) {
		super(family, changeReceiver);
		this.idAllocator = idAllocatorFromMaxId();
		this.codecOptions = codecOptions;
		// TODO: make this dependent on the CodecWriteOptions
		this.rebaseVersion = rebaseVersionOverride ?? 1;
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
	 * Builds a new tree to use in an edit.
	 *
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

		const builds = newChangeAtomIdBTree<TreeChunk>();
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
			rebaseVersion: this.rebaseVersion,
			path: field,
			fieldChange: { fieldKind, change },
			nodeChanges: newChangeAtomIdBTree(),
			nodeToParent: newChangeAtomIdBTree(),
			crossFieldKeys: newCrossFieldRangeTable(),
			rootNodes: newRootTable(),
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
							rebaseVersion: this.rebaseVersion,
							maxId: this.idAllocator.getMaxId(),
							builds: change.builds,
							rootNodes: renameTableFromRenameDescriptions(change.renames ?? []),
							revisions: [{ revision: change.revision }],
						})
					: buildModularChangesetFromField({
							rebaseVersion: this.rebaseVersion,
							path: change.field,
							fieldChange: {
								fieldKind: change.fieldKind,
								change: change.change,
							},
							nodeChanges: newChangeAtomIdBTree(),
							nodeToParent: newChangeAtomIdBTree(),
							crossFieldKeys: newCrossFieldRangeTable(),
							rootNodes: newRootTable(),
							idAllocator: this.idAllocator,
							localCrossFieldKeys: getChangeHandler(
								this.fieldKinds,
								change.fieldKind,
							).getCrossFieldKeys(change.change),
							revision: change.revision,
						}),
			);
		});
		const revInfo = [...revisions].map((revision) => ({ revision }));
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
					rebaseVersion: this.rebaseVersion,
					path,
					nodeChange,
					nodeChanges: newChangeAtomIdBTree(),
					nodeToParent: newChangeAtomIdBTree(),
					crossFieldKeys: newCrossFieldRangeTable(),
					rootNodes: newRootTable(),
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
					rebaseVersion: this.rebaseVersion,
					path,
					nodeChange,
					nodeChanges: newChangeAtomIdBTree(),
					nodeToParent: newChangeAtomIdBTree(),
					crossFieldKeys: newCrossFieldRangeTable(),
					rootNodes: newRootTable(),
					idAllocator: this.idAllocator,
					revision,
				}),
				revision,
			),
		);
	}

	public addNoChangeConstraint(revision: RevisionTag): void {
		if (lt(this.codecOptions.minVersionForCollab, FluidClientVersion.v2_80)) {
			throw new UsageError(
				`No change constraints require min client version of at least ${FluidClientVersion.v2_80}`,
			);
		}

		const changeset = makeModularChangeset({
			rebaseVersion: this.rebaseVersion,
			maxId: -1,
			noChangeConstraint: { violated: false },
		});

		this.applyChange(tagChange(changeset, revision));
	}

	public addNoChangeConstraintOnRevert(revision: RevisionTag): void {
		if (lt(this.codecOptions.minVersionForCollab, FluidClientVersion.v2_80)) {
			throw new UsageError(
				`No change constraints require min client version of at least ${FluidClientVersion.v2_80}`,
			);
		}

		const changeset = makeModularChangeset({
			rebaseVersion: this.rebaseVersion,
			maxId: -1,
			noChangeConstraintOnRevert: { violated: false },
		});

		this.applyChange(tagChange(changeset, revision));
	}
}

export function buildModularChangesetFromField(props: {
	rebaseVersion: RebaseVersion;
	path: NormalizedFieldUpPath;
	fieldChange: FieldChange;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<NodeLocation>;
	crossFieldKeys: CrossFieldKeyTable;
	rootNodes: RootNodeTable;
	localCrossFieldKeys?: CrossFieldKeyRange[];
	revision: RevisionTag;
	idAllocator?: IdAllocator;
	childId?: NodeId;
}): ModularChangeset {
	const {
		rebaseVersion,
		path,
		fieldChange,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		rootNodes,
		idAllocator = idAllocatorFromMaxId(),
		localCrossFieldKeys = [],
		childId,
		revision,
	} = props;
	const fieldChanges: FieldChangeMap = new Map([[path.field, fieldChange]]);

	if (path.parent === undefined) {
		const field = { nodeId: undefined, field: path.field };
		for (const { key, count } of localCrossFieldKeys) {
			crossFieldKeys.set(key, count, field);
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
			rebaseVersion,
			fieldChanges,
			nodeChanges,
			nodeToParent,
			crossFieldKeys,
			rootNodes,
			maxId: idAllocator.getMaxId(),
			revisions: [{ revision }],
		});
	}

	const nodeChangeset: NodeChangeset = {
		fieldChanges,
	};

	const parentId: NodeId = { localId: brand(idAllocator.allocate()), revision };
	const fieldId = { nodeId: parentId, field: path.field };

	for (const { key, count } of localCrossFieldKeys) {
		crossFieldKeys.set(key, count, { nodeId: parentId, field: path.field });
	}

	if (childId !== undefined) {
		setInChangeAtomIdMap(nodeToParent, childId, {
			field: fieldId,
		});
	}

	return buildModularChangesetFromNode({
		rebaseVersion,
		path: path.parent,
		nodeChange: nodeChangeset,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		rootNodes,
		idAllocator,
		revision,
		nodeId: parentId,
	});
}

function buildModularChangesetFromNode(props: {
	rebaseVersion: RebaseVersion;
	path: NormalizedUpPath;
	nodeChange: NodeChangeset;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<NodeLocation>;
	crossFieldKeys: CrossFieldKeyTable;
	rootNodes: RootNodeTable;
	idAllocator: IdAllocator;
	revision: RevisionTag;
	nodeId?: NodeId;
}): ModularChangeset {
	const {
		path,
		idAllocator,
		revision,
		nodeChanges,
		nodeChange,
		nodeId = { localId: brand(idAllocator.allocate()), revision },
	} = props;
	setInChangeAtomIdMap(nodeChanges, nodeId, nodeChange);

	if (isDetachedUpPathRoot(path)) {
		const rootId: ChangeAtomId = {
			revision: path.detachedNodeId.major,
			localId: brand(path.detachedNodeId.minor),
		};

		props.rootNodes.nodeChanges.set(
			[path.detachedNodeId.major, brand(path.detachedNodeId.minor)],
			nodeId,
		);

		setInChangeAtomIdMap(props.nodeToParent, nodeId, {
			root: rootId,
		});

		return makeModularChangeset({
			rebaseVersion: props.rebaseVersion,
			rootNodes: props.rootNodes,
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

export interface FieldEditDescription {
	type: "field";
	field: NormalizedFieldUpPath;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
	revision: RevisionTag;
}

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
	detachLocation: FieldId | undefined;
}

function renameTableFromRenameDescriptions(renames: RenameDescription[]): RootNodeTable {
	const table = newRootTable();
	for (const rename of renames) {
		addNodeRename(table, rename.oldId, rename.newId, rename.count, rename.detachLocation);
	}

	return table;
}

export type EditDescription = FieldEditDescription | GlobalEditDescription;

function getRevInfoFromTaggedChanges(changes: TaggedChange<ModularChangeset>[]): {
	revInfos: RevisionInfo[];
	maxId: ChangesetLocalId;
} {
	let maxId = -1;
	const revInfos: RevisionInfo[] = [];
	const revisions = new Set<RevisionTag>();
	for (const taggedChange of changes) {
		const change = taggedChange.change;
		maxId = Math.max(change.maxId ?? -1, maxId);
		const infosToAdd = revisionInfoFromTaggedChange(taggedChange);
		for (const info of infosToAdd) {
			if (!revisions.has(info.revision)) {
				revisions.add(info.revision);
				revInfos.push(info);
			}
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

function fieldChangeFromId(change: ModularChangeset, id: FieldId): FieldChange {
	const fieldId = normalizeFieldId(id, change.nodeAliases);
	const fieldMap = fieldMapFromNodeId(
		change.fieldChanges,
		change.nodeChanges,
		change.nodeAliases,
		fieldId.nodeId,
	);
	return fieldMap.get(id.field) ?? fail(0xb25 /* No field exists for the given ID */);
}

function fieldMapFromNodeId(
	rootFieldMap: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	aliases: ChangeAtomIdBTree<NodeId>,
	nodeId: NodeId | undefined,
): FieldChangeMap {
	if (nodeId === undefined) {
		return rootFieldMap;
	}

	const node = nodeChangeFromId(nodes, aliases, nodeId);
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

function nodeChangeFromId(
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	aliases: ChangeAtomIdBTree<NodeId>,
	id: NodeId,
): NodeChangeset {
	const normalizedId = normalizeNodeId(id, aliases);
	const node = getFromChangeAtomIdMap(nodes, normalizedId);
	assert(node !== undefined, 0x9ca /* Unknown node ID */);
	return node;
}

function fieldIdFromFieldIdKey([revision, localId, field]: FieldIdKey): FieldId {
	const nodeId = localId === undefined ? undefined : { revision, localId };
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
	replacer: RevisionReplacer,
): NodeLocation {
	return location.field === undefined
		? { root: replacer.getUpdatedAtomId(location.root) }
		: { field: replaceFieldIdRevision(location.field, replacer) };
}

function replaceFieldIdRevision(fieldId: FieldId, replacer: RevisionReplacer): FieldId {
	if (fieldId.nodeId === undefined) {
		return fieldId;
	}

	return {
		...fieldId,
		nodeId: replacer.getUpdatedAtomId(fieldId.nodeId),
	};
}

export function getNodeParent(changeset: ModularChangeset, nodeId: NodeId): NodeLocation {
	const normalizedNodeId = normalizeNodeId(nodeId, changeset.nodeAliases);
	const location = getFromChangeAtomIdMap(changeset.nodeToParent, normalizedNodeId);
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

function getFirstFieldForAttach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return getFirstFieldForCrossFieldKey(
		changeset,
		{
			...attachId,
			target: NodeMoveType.Attach,
		},
		count,
	);
}

function getFirstFieldForDetach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return getFirstFieldForCrossFieldKey(
		changeset,
		{
			...attachId,
			target: NodeMoveType.Detach,
		},
		count,
	);
}

function getFirstFieldForCrossFieldKey(
	changeset: ModularChangeset,
	key: CrossFieldKey,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const result = changeset.crossFieldKeys.getFirst(key, count);
	if (result.value === undefined) {
		return result;
	}

	return { ...result, value: normalizeFieldId(result.value, changeset.nodeAliases) };
}

export function getNewRootIdFromOldRootId(
	changeset: ModularChangeset,
	oldId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const entry = changeset.rootNodes.oldToNewId.getFirst(oldId, count);
	return { ...entry, value: entry.value ?? oldId };
}

export function getOldRootIdFromNewRootId(
	changeset: ModularChangeset,
	newId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const entry = changeset.rootNodes.newToOldId.getFirst(newId, count);
	return { ...entry, value: entry.value ?? newId };
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
	return fieldId.nodeId === undefined
		? fieldId
		: { ...fieldId, nodeId: normalizeNodeId(fieldId.nodeId, nodeAliases) };
}

/**
 * @returns The canonical form of nodeId, according to nodeAliases
 */
export function normalizeNodeId(
	nodeId: NodeId,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): NodeId {
	let currentId = nodeId;
	let cycleProbeId: NodeId | undefined = nodeId;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}

		currentId = dealiased;

		if (cycleProbeId !== undefined) {
			cycleProbeId = getFromChangeAtomIdMap(nodeAliases, cycleProbeId);
		}

		if (cycleProbeId !== undefined) {
			cycleProbeId = getFromChangeAtomIdMap(nodeAliases, cycleProbeId);
		}

		assert(!areEqualChangeAtomIdOpts(cycleProbeId, currentId), "Alias cycle detected");
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

function areEqualFieldIds(a: FieldId, b: FieldId): boolean {
	return areEqualChangeAtomIdOpts(a.nodeId, b.nodeId) && a.field === b.field;
}

function firstAttachIdFromDetachId(
	roots: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const result = roots.oldToNewId.getFirst(detachId, count);
	return { ...result, value: result.value ?? detachId };
}

function firstDetachIdFromAttachId(
	roots: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
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
		rebasedTable.delete({ ...entry.start, target: NodeMoveType.Detach }, entry.length);
	}

	for (const entry of newDetachLocations.entries()) {
		rebasedTable.set(
			{ ...entry.start, target: NodeMoveType.Detach },
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
		firstIntermediateRenames: newChangeAtomIdTransform(),
		nodeChanges: newChangeAtomIdBTree(),
		detachLocations: newChangeAtomIdRangeMap(),
		outputDetachLocations: newChangeAtomIdRangeMap(),
	};
}

function rebaseRoots(
	change: ModularChangeset,
	base: ModularChangeset,
	affectedBaseFields: TupleBTree<FieldIdKey, boolean>,
	nodesToRebase: [newChangeset: NodeId, baseChangeset: NodeId][],
	rebasedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
	rebaseVersion: RebaseVersion,
): RootNodeTable {
	const rebasedRoots = newRootTable();
	for (const renameEntry of change.rootNodes.oldToNewId.entries()) {
		rebaseRename(change.rootNodes, rebasedRoots, renameEntry, base, affectedBaseFields);
	}

	for (const [detachIdKey, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const changes = base.rootNodes.nodeChanges.get(detachIdKey);
		if (changes !== undefined) {
			nodesToRebase.push([nodeId, changes]);
		}

		const detachId = makeChangeAtomId(detachIdKey[1], detachIdKey[0]);
		const attachId = firstAttachIdFromDetachId(base.rootNodes, detachId, 1).value;
		const baseAttachEntry = base.crossFieldKeys.getFirst(
			{ target: NodeMoveType.Attach, ...attachId },
			1,
		);
		if (baseAttachEntry.value === undefined) {
			const renamedDetachId = firstAttachIdFromDetachId(base.rootNodes, detachId, 1).value;
			const baseOutputDetachLocation = base.rootNodes.outputDetachLocations.getFirst(
				renamedDetachId,
				1,
			).value;

			if (baseOutputDetachLocation !== undefined) {
				affectedBaseFields.set(fieldIdKeyFromFieldId(baseOutputDetachLocation), true);
			}

			const detachLocation =
				baseOutputDetachLocation ??
				change.rootNodes.detachLocations.getFirst(detachId, 1).value;

			// Note that `baseOutputDetachLocation` may contain a node ID from the base changeset.
			// We will replace the detach location entry with the node ID from the rebased changeset in `fixupRebasedDetachLocations`
			assignRootChange(
				rebasedRoots,
				rebasedNodeToParent,
				renamedDetachId,
				nodeId,
				detachLocation,
				rebaseVersion,
			);
		} else {
			affectedBaseFields.set(fieldIdKeyFromFieldId(baseAttachEntry.value), true);
			rebasedNodeToParent.delete(detachIdKey);
		}
	}

	for (const entry of change.rootNodes.outputDetachLocations.entries()) {
		rebasedRoots.outputDetachLocations.set(entry.start, entry.length, entry.value);
	}

	return rebasedRoots;
}

function rebaseRename(
	newRoots: RootNodeTable,
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
			...baseRenameEntry.value,
			target: NodeMoveType.Attach,
		},
		count,
	);

	count = baseAttachEntry.length;

	if (baseAttachEntry.value === undefined) {
		const baseOutputDetachLocation = base.rootNodes.outputDetachLocations.getFirst(
			baseRenameEntry.value,
			1,
		).value;

		if (baseOutputDetachLocation !== undefined) {
			affectedBaseFields.set(fieldIdKeyFromFieldId(baseOutputDetachLocation), true);
		}

		const detachEntry = newRoots.detachLocations.getFirst(renameEntry.start, count);
		count = detachEntry.length;

		const detachLocation = baseOutputDetachLocation ?? detachEntry.value;

		// Note that `baseOutputDetachLocation` may contain a node ID from the base changeset.
		// We will replace the detach location entry with the node ID from the rebased changeset in `fixupRebasedDetachLocations`
		addNodeRename(
			rebasedRoots,
			baseRenameEntry.value,
			renameEntry.value,
			count,
			detachLocation,
		);
	} else {
		// The renamed nodes are attached in the input context of the rebased change.
		// This rename represents an intention to detach these nodes.
		// The rebased change should have a detach in the field where the base change attaches the nodes,
		// so we need to ensure that field is processed.
		const fieldId = normalizeFieldId(baseAttachEntry.value, base.nodeAliases);
		affectedBaseFields.set(fieldIdKeyFromFieldId(fieldId), true);

		const intermediateRenameEntry = newRoots.firstIntermediateRenames.getFirst(
			renameEntry.start,
			count,
		);
		count = intermediateRenameEntry.length;

		if (intermediateRenameEntry.value !== undefined) {
			// The rebased change will detach these nodes with `intermediateRenameEntry.value` as the ID.
			// We still need a rename from that detach ID to the final output ID.
			addNodeRename(
				rebasedRoots,
				intermediateRenameEntry.value,
				renameEntry.value,
				count,
				undefined,
			);
		}
	}

	const countRemaining = renameEntry.length - count;
	if (countRemaining > 0) {
		rebaseRename(
			newRoots,
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

/**
 * For each root detach location, replaces any node ID from the base changeset
 * with the corresponding ID in the new changeset.
 */
function fixupRebasedDetachLocations(table: RebaseTable): void {
	for (const {
		start,
		length,
		value: detachLocation,
	} of table.rebasedRootNodes.detachLocations.entries()) {
		const normalizedDetachLocation = normalizeFieldId(
			detachLocation,
			table.baseChange.nodeAliases,
		);

		if (normalizedDetachLocation.nodeId !== undefined) {
			const rebasedNodeId = getFromChangeAtomIdMap(
				table.baseToRebasedNodeId,
				normalizedDetachLocation.nodeId,
			);

			if (rebasedNodeId !== undefined) {
				table.rebasedRootNodes.detachLocations.set(start, length, {
					...normalizedDetachLocation,
					nodeId: rebasedNodeId,
				});
			}
		}
	}
}

function addNodesToCompose(table: ComposeTable, id1: NodeId, id2: NodeId): void {
	const normalizedId1 = normalizeNodeId(id1, table.baseChange.nodeAliases);
	const normalizedId2 = normalizeNodeId(id2, table.newChange.nodeAliases);
	if (getFromChangeAtomIdMap(table.newToBaseNodeId, normalizedId2) === undefined) {
		setInChangeAtomIdMap(table.newToBaseNodeId, normalizedId2, normalizedId1);
		table.pendingCompositions.nodeIdsToCompose.push([normalizedId1, normalizedId2]);
	}
}

function composeRevInfos(
	revisions1: readonly RevisionInfo[] | undefined,
	revisions2: readonly RevisionInfo[] | undefined,
): readonly RevisionInfo[] {
	if (
		revisions1?.length === 1 &&
		revisions2?.length === 1 &&
		revisions1[0]?.revision === revisions2[0]?.revision
	) {
		// XXX: Shouldn't this branch handle the case where there are multiple revisions in each array?
		// This is a special case where we are composing two changesets from the same transaction.
		// We return one of the input arrays to avoid duplicating revision entries.
		return revisions1;
	}
	const result: RevisionInfo[] = [...(revisions1 ?? []), ...(revisions2 ?? [])];
	return result;
}

function composeCrossFieldKeyTables(
	table1: CrossFieldKeyTable,
	table2: CrossFieldKeyTable,
	removedCrossFieldKeys: CrossFieldRangeTable<boolean>,
	addedCrossFieldKeys: CrossFieldRangeTable<FieldId>,
): CrossFieldKeyTable {
	// If change1 contains a rollback inverse of a move from change2,
	// may both have the same cross-field keys.
	// The colliding keys represent moves of the same nodes.
	// Composition typically preserves the first detach (from change1) and last attach (from change2).
	// Note that it is also common for colliding keys to be removed in `composeDetachAttach`.
	const mergeEntries = (key: CrossFieldKey, value1: FieldId, value2: FieldId): FieldId =>
		key.target === NodeMoveType.Detach ? value1 : value2;

	const composedTable = RangeMap.union(table1, table2, mergeEntries);

	for (const entry of removedCrossFieldKeys.entries()) {
		composedTable.delete(entry.start, entry.length);
	}

	for (const entry of addedCrossFieldKeys.entries()) {
		composedTable.set(entry.start, entry.length, entry.value);
	}

	return composedTable;
}

function composeRootTables(
	change1: ModularChangeset,
	change2: ModularChangeset,
	composedNodeToParent: ChangeAtomIdBTree<NodeLocation>,
	pendingCompositions: PendingCompositions,
): RootNodeTable {
	const composedTable = cloneRootTable(change1.rootNodes);

	composeRootRenames(change1, change2, composedTable);

	for (const [[revision2, id2], nodeId2] of change2.rootNodes.nodeChanges.entries()) {
		const detachId2 = { revision: revision2, localId: id2 };
		const detachId1 = firstDetachIdFromAttachId(change1.rootNodes, detachId2, 1).value;
		const nodeId1 = getFromChangeAtomIdMap(change1.rootNodes.nodeChanges, detachId1);

		if (nodeId1 === undefined) {
			const fieldId = getFieldsForCrossFieldKey(
				change1,
				{ ...detachId1, target: NodeMoveType.Detach },
				1,
			)[0];

			if (fieldId === undefined) {
				assignRootChange(
					composedTable,
					composedNodeToParent,
					detachId1,
					nodeId2,
					change1.rootNodes.detachLocations.getFirst(detachId1, 1).value ??
						change2.rootNodes.detachLocations.getFirst(detachId2, 1).value,
					Math.max(change1.rebaseVersion, change2.rebaseVersion) as RebaseVersion,
				);
			} else {
				// In this case, this node is attached in the input context of change1,
				// and is represented in detachFieldId.
				pendingCompositions.affectedBaseFields.set(
					[fieldId.nodeId?.revision, fieldId.nodeId?.localId, fieldId.field],
					true,
				);
			}
		} else {
			pendingCompositions.nodeIdsToCompose.push([nodeId1, nodeId2]);
		}
	}

	return composedTable;
}

function composeRootRenames(
	change1: ModularChangeset,
	change2: ModularChangeset,
	composedRoots: RootNodeTable,
): void {
	for (const renameEntry of change2.rootNodes.oldToNewId.entries()) {
		// Notes on the validity of overwriting apparently conflicting renames:
		// It is possible for `change1` and `change2` to both have a rename from the same root ID,
		// or for both to have a rename to the same root ID.
		// These cases should only be possible when `change1` contains a rollback of a revision in `change2`,
		// as otherwise detach IDs are not reused.
		// These scenarios can be divided into two classes.
		//
		// 1. The conflicting renames refer to different nodes
		// `change1` may rename node A to `renameEntry.value`, while `change2` renames node B to the same value.
		// This is only legal if `change2` also renames node A to some other ID.
		// If we process `change2`'s rename of node A before its rename of node B, we will not encounter a conflict.
		// If we process the rename of node B first, we can safely overwrite change1's rename of node A,
		// as it will be recovered when processing `change2`'s rename of node A.
		//
		// This case can occur when `change1` contains a rollback of an optional field clear,
		// and `change2` contains a rebased version of that clear which detaches a different node.
		//
		// 2. The conflicting renames refer to the same node
		// `change2` may rename node A from `renameEntry.start`, while `change1` also renames node A from `renameEntry.start`.
		// This should only be possible if `change1` attaches node A after its rename, and `change2` detaches it before its rename.
		// We can safely overwrite the first rename, as we `composeAttachDetach` should be called for this node,
		// and the correct rename will be created then (and then overwrite this rename again in `applyPendingComposeRenames`).
		//
		// This case can happen when both changes contains a composite move,
		// and the detach of `change1`'s move is a rollback of the detach part of `change2`'s composite move.
		// The moves in both `change1` and `change2` will have the same detach ID, but different renames for that ID.
		// For an example of the above scenario,
		// see the ModularChangeFamily integration composition test "[return2, move1] and [move2, move3]".
		composeRootRename(
			composedRoots,
			renameEntry.start,
			renameEntry.value,
			renameEntry.length,
			change1,
			change2,
			RenameSource.Change2,
			RenameCollisionPolicy.Overwrite,
		);
	}
}

function applyPendingComposedRenames(
	change1: ModularChangeset,
	change2: ModularChangeset,
	composedRoots: RootNodeTable,
	attachDetachRenames: ChangeAtomIdRangeMap<ChangeAtomId>,
	deletedRenames: ChangeAtomIdRangeMap<true>,
): void {
	for (const entry of attachDetachRenames.entries()) {
		composeRootRename(
			composedRoots,
			entry.start,
			entry.value,
			entry.length,
			change1,
			change2,
			RenameSource.AttachDetach,
			RenameCollisionPolicy.Error,
		);
	}

	for (const entry of deletedRenames.entries()) {
		deleteNodeRenameFrom(composedRoots, entry.start, entry.length);
	}
}

export function cloneRootTable(table: RootNodeTable): RootNodeTable {
	return {
		oldToNewId: table.oldToNewId.clone(),
		newToOldId: table.newToOldId.clone(),
		firstIntermediateRenames: table.firstIntermediateRenames.clone(),
		nodeChanges: brand(table.nodeChanges.clone()),
		detachLocations: table.detachLocations.clone(),
		outputDetachLocations: table.outputDetachLocations.clone(),
	};
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

function doesChangeAttachNodes(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResultFragment<boolean>[] {
	return table
		.getAll2({ ...id, target: NodeMoveType.Attach }, count)
		.map((entry) => ({ ...entry, value: entry.value !== undefined }));
}

function doesChangeDetachNodes(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResultFragment<boolean>[] {
	return table
		.getAll2({ ...id, target: NodeMoveType.Detach }, count)
		.map((entry) => ({ ...entry, value: entry.value !== undefined }));
}

export function getFirstDetachField(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return table.getFirst({ ...id, target: NodeMoveType.Detach }, count);
}

function getDetachFieldForAttach(
	table: CrossFieldKeyTable,
	roots: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const renameEntry = firstDetachIdFromAttachId(roots, attachId, count);
	return getFirstDetachField(table, renameEntry.value, renameEntry.length);
}

export function getFirstAttachField(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return table.getFirst({ target: NodeMoveType.Attach, ...id }, count);
}

function getAttachFieldForDetach(
	table: CrossFieldKeyTable,
	roots: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const renameEntry = firstAttachIdFromDetachId(roots, detachId, count);
	return getFirstAttachField(table, renameEntry.value, renameEntry.length);
}

export function addNodeRename(
	table: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
	detachLocation: FieldId | undefined,
): void {
	if (areEqualChangeAtomIds(oldId, newId)) {
		return;
	}

	for (const entry of table.oldToNewId.getAll2(oldId, count)) {
		assert(
			entry.value === undefined ||
				areEqualChangeAtomIds(entry.value, offsetChangeAtomId(newId, entry.offset)),
			"New rename conflicts with existing rename",
		);
	}

	for (const entry of table.newToOldId.getAll2(newId, count)) {
		assert(
			entry.value === undefined ||
				areEqualChangeAtomIds(entry.value, offsetChangeAtomId(oldId, entry.offset)),
			"New rename conflicts with existing rename",
		);
	}

	table.oldToNewId.set(oldId, count, newId);
	table.newToOldId.set(newId, count, oldId);

	if (detachLocation !== undefined) {
		table.detachLocations.set(oldId, count, detachLocation);
	}
}

/**
 * Deletes any renames from `id`.
 */
function deleteNodeRenameFrom(roots: RootNodeTable, id: ChangeAtomId, count: number): void {
	for (const entry of roots.oldToNewId.getAll(id, count)) {
		deleteNodeRenameEntry(roots, entry.start, entry.value, entry.length);
	}
}

/**
 * Deletes any renames to `id`.
 */
function deleteNodeRenameTo(roots: RootNodeTable, id: ChangeAtomId, count: number): void {
	for (const entry of roots.newToOldId.getAll(id, count)) {
		deleteNodeRenameEntry(roots, entry.value, entry.start, entry.length);
	}
}

enum RenameSource {
	Change2,
	AttachDetach,
}

enum RenameCollisionPolicy {
	Error,
	Overwrite,
}

// XXX: Break this function into smaller pieces
/**
 * Adds to a rename table, composing with renames which should be applied before or after the inserted rename.
 * @param table - The table to insert the rename into.
 * @param oldId - The root ID to rename from.
 * @param newId - The root ID to rename to.
 * @param newIntermediateId - The first intermediate ID to rename to.
 * @param count - The length of the range of roots being renames.
 * @param renamesBefore - If renamesBefore has a rename from X to `oldId`, the inserted rename will compose to a rename from X to `newId`.
 * @param renamesAfter - If renamesAfter has a rename from `newId` to X, the inserted rename will compose to a rename from `oldId` to X.
 * @param getDetachLocation - A function which provides the detach location for the rename, given the composed ID to rename from.
 */
function insertRootRename(
	table: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	newIntermediateId: ChangeAtomId | undefined,
	getOutputDetachLocation: (
		composedOldId: ChangeAtomId,
		composedNewId: ChangeAtomId,
		count: number,
	) => RangeQueryResult<FieldId | undefined>,
	count: number,
	renamesBefore: RootNodeTable | undefined,
	renamesAfter: RootNodeTable | undefined,
	getDetachLocation: (
		oldId: ChangeAtomId,
		count: number,
	) => RangeQueryResult<FieldId | undefined>,
	collisionPolicy: RenameCollisionPolicy = RenameCollisionPolicy.Error,
): void {
	let countProcessed = count;

	let composedOldId = oldId;
	if (renamesBefore !== undefined) {
		const rename1Entry = renamesBefore.newToOldId.getFirst(oldId, countProcessed);
		countProcessed = rename1Entry.length;

		if (rename1Entry.value !== undefined) {
			composedOldId = rename1Entry.value;
		}
	}

	const intermediateRenameEntry = table.firstIntermediateRenames.getFirst(
		composedOldId,
		countProcessed,
	);
	countProcessed = intermediateRenameEntry.length;

	let composedNewId = newId;
	if (renamesAfter !== undefined) {
		const rename2Entry = renamesAfter.oldToNewId.getFirst(newId, countProcessed);
		countProcessed = rename2Entry.length;

		if (rename2Entry.value !== undefined) {
			composedNewId = rename2Entry.value;
		}
	}

	const detachLocationEntry = getDetachLocation(composedOldId, countProcessed);
	countProcessed = detachLocationEntry.length;

	// Beyond this point we do not make new queries which would change `countProcessed`.
	// Now that we know the range of IDs we're processing, we apply edits to the table.
	if (!areEqualChangeAtomIds(composedOldId, oldId)) {
		// The rename we're inserting composed with a rename to `composedOldId`.
		// We delete that existing rename here before adding the composed entry.
		deleteNodeRenameFrom(table, composedOldId, countProcessed);
	}

	if (!areEqualChangeAtomIds(composedNewId, newId)) {
		// The rename we're inserting composed with a rename from `composedNewId`.
		// We delete that existing rename here before adding the composed entry.
		deleteNodeRenameTo(table, composedNewId, countProcessed);
	}

	if (collisionPolicy === RenameCollisionPolicy.Overwrite) {
		deleteNodeRenameFrom(table, composedOldId, countProcessed);
		deleteNodeRenameTo(table, composedNewId, countProcessed);
	}

	addNodeRename(
		table,
		composedOldId,
		composedNewId,
		countProcessed,
		detachLocationEntry.value,
	);

	if (areEqualChangeAtomIds(composedOldId, composedNewId)) {
		// The renames cancelling out implies that the detach location of the root is not changed by the composed changeset.
		if (!areEqualChangeAtomIds(composedOldId, oldId)) {
			// We're removing a rename from `composedOldId` to `oldId`,
			// so we also remove any output detach location listed under `oldId`.
			table.outputDetachLocations.delete(oldId, countProcessed);
		}

		if (!areEqualChangeAtomIdOpts(composedNewId, newId)) {
			// We're removing a rename from `newId` to `composedNewId`,
			// so we also remove any output detach location listed under `composedNewId`.
			table.outputDetachLocations.delete(composedNewId, countProcessed);
		}
	} else {
		if (!areEqualChangeAtomIds(composedOldId, oldId)) {
			// We previously had a rename from `composedOldId` to `oldId`,
			// so there may have been an output detach location for `oldId`,
			// We remove that entry, since the final output ID for that root is now `composedNewId`.
			table.outputDetachLocations.delete(oldId, countProcessed);
		}

		const outputDetachLocationEntry = getOutputDetachLocation(
			composedOldId,
			composedNewId,
			countProcessed,
		);
		countProcessed = outputDetachLocationEntry.length;

		if (outputDetachLocationEntry.value !== undefined) {
			table.outputDetachLocations.set(
				composedNewId,
				countProcessed,
				outputDetachLocationEntry.value,
			);
		}

		const renameToOldId = areEqualChangeAtomIds(oldId, composedOldId) ? undefined : oldId;
		const firstRenameId =
			intermediateRenameEntry.value ?? renameToOldId ?? newIntermediateId ?? newId;
		if (!areEqualChangeAtomIds(firstRenameId, composedNewId)) {
			table.firstIntermediateRenames.set(composedOldId, countProcessed, firstRenameId);
		}
	}

	tryRemoveDetachLocation(table, composedOldId, countProcessed);
	tryRemoveDetachLocation(table, oldId, countProcessed);

	const countRemaining = count - countProcessed;
	if (countRemaining > 0) {
		const offsetIntermediateRename =
			newIntermediateId === undefined
				? undefined
				: offsetChangeAtomId(newIntermediateId, countProcessed);

		insertRootRename(
			table,
			offsetChangeAtomId(oldId, countProcessed),
			offsetChangeAtomId(newId, countProcessed),
			offsetIntermediateRename,
			getOutputDetachLocation,
			countRemaining,
			renamesBefore,
			renamesAfter,
			getDetachLocation,
			collisionPolicy,
		);
	}
}

function composeRootRename(
	composedTable: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
	change1: ModularChangeset,
	change2: ModularChangeset,
	renameSource: RenameSource,
	collisionPolicy: RenameCollisionPolicy,
): void {
	// If the rename is from change2, we don't want to compose it with other renames from change2.
	// Note that a single changeset can have renames which would appear to compose with each other.
	// If a changeset has renames [A -> B] and [B -> C], they represent renames of two different nodes,
	// with the [B -> C] rename taking place first.
	// They do not represent the rename [A -> C].
	const renamesAfter = renameSource === RenameSource.Change2 ? undefined : change2.rootNodes;

	const getDetachLocation = (
		composedOldId: ChangeAtomId,
		countQueried: number,
	): RangeQueryResult<FieldId | undefined> => {
		let countProcessed = countQueried;
		const detachEntry = getFirstDetachField(
			change1.crossFieldKeys,
			composedOldId,
			countProcessed,
		);
		countProcessed = detachEntry.length;

		if (detachEntry.value !== undefined) {
			// The renamed nodes are attached in the input context of the composed change.
			return { value: undefined, length: detachEntry.length };
		}

		const detachLocationEntry1 = change1.rootNodes.detachLocations.getFirst(
			composedOldId,
			countProcessed,
		);
		countProcessed = detachLocationEntry1.length;

		if (detachLocationEntry1.value !== undefined) {
			return detachLocationEntry1;
		}

		// If `change1` may have no detach location entry if `composedOldId` is a build in `change1`.
		const attachLocationEntry1 = getFirstAttachField(
			change1.crossFieldKeys,
			composedOldId,
			countProcessed,
		);
		countProcessed = attachLocationEntry1.length;

		// These nodes may be detached in `change1`'s input context, but not have a detach location entry
		// if they are built and attached without a rename in `change1`.
		// In that case, their detach location is the first place they are attached.
		if (attachLocationEntry1.value !== undefined) {
			return attachLocationEntry1;
		}

		return change2.rootNodes.detachLocations.getFirst(oldId, countProcessed);
	};

	const getOutputDetachLocation = (
		composedOldId: ChangeAtomId,
		composedNewId: ChangeAtomId,
		length: number,
	): RangeQueryResult<FieldId | undefined> => {
		let countProcessed = length;
		const outputDetachEntry2 = change2.rootNodes.outputDetachLocations.getFirst(
			composedNewId,
			countProcessed,
		);
		countProcessed = outputDetachEntry2.length;

		if (outputDetachEntry2.value !== undefined) {
			return outputDetachEntry2;
		}

		const attachEntry = getFirstAttachField(
			change2.crossFieldKeys,
			composedNewId,
			countProcessed,
		);
		countProcessed = attachEntry.length;

		if (attachEntry.value !== undefined) {
			// These nodes are reattached, so there is no output detach location.
			return { value: undefined, length: countProcessed };
		}

		const detachEntry = getDetachFieldForAttach(
			change2.crossFieldKeys,
			change2.rootNodes,
			composedNewId,
			countProcessed,
		);
		countProcessed = detachEntry.length;

		if (detachEntry.value !== undefined) {
			return detachEntry;
		}

		const outputIdEntry1 = firstAttachIdFromDetachId(
			change1.rootNodes,
			composedOldId,
			countProcessed,
		);
		countProcessed = outputIdEntry1.length;

		return change1.rootNodes.outputDetachLocations.getFirst(
			outputIdEntry1.value,
			outputIdEntry1.length,
		);
	};

	for (const intermediateRenameEntry of change2.rootNodes.firstIntermediateRenames.getAll2(
		oldId,
		count,
	)) {
		const offsetOldId = offsetChangeAtomId(oldId, intermediateRenameEntry.offset);
		const offsetNewId = offsetChangeAtomId(newId, intermediateRenameEntry.offset);

		insertRootRename(
			composedTable,
			offsetOldId,
			offsetNewId,
			intermediateRenameEntry.value,
			getOutputDetachLocation,
			intermediateRenameEntry.length,
			change1.rootNodes,
			renamesAfter,
			getDetachLocation,
			collisionPolicy,
		);
	}
}

function tryRemoveDetachLocation(
	roots: RootNodeTable,
	rootId: ChangeAtomId,
	count: number,
): void {
	let countProcessed = count;
	const renameEntry = roots.oldToNewId.getFirst(rootId, countProcessed);
	countProcessed = renameEntry.length;

	const outputDetachEntry = roots.outputDetachLocations.getFirst(rootId, countProcessed);
	countProcessed = outputDetachEntry.length;

	const nodeChangeEntry = rangeQueryChangeAtomIdMap(roots.nodeChanges, rootId, countProcessed);
	countProcessed = nodeChangeEntry.length;

	if (
		nodeChangeEntry.value === undefined &&
		renameEntry.value === undefined &&
		outputDetachEntry.value === undefined
	) {
		roots.detachLocations.delete(rootId, countProcessed);
	}

	const countRemaining = count - countProcessed;
	if (countRemaining > 0) {
		tryRemoveDetachLocation(roots, offsetChangeAtomId(rootId, countProcessed), countRemaining);
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
	roots.firstIntermediateRenames.delete(oldId, count);
	tryRemoveDetachLocation(roots, oldId, count);
}

function replaceRootTableRevision(
	table: RootNodeTable,
	replacer: RevisionReplacer,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): RootNodeTable {
	const oldToNewId = table.oldToNewId.mapEntries(
		(id) => replacer.getUpdatedAtomId(id),
		(id) => replacer.getUpdatedAtomId(id),
	);

	const newToOldId = table.newToOldId.mapEntries(
		(id) => replacer.getUpdatedAtomId(id),
		(id) => replacer.getUpdatedAtomId(id),
	);

	const firstIntermediateRenames = table.firstIntermediateRenames.mapEntries(
		(id) => replacer.getUpdatedAtomId(id),
		(id) => replacer.getUpdatedAtomId(id),
	);

	const nodeChanges: ChangeAtomIdBTree<NodeId> = replaceIdMapRevisions(
		table.nodeChanges,
		replacer,
		(nodeId) => replacer.getUpdatedAtomId(normalizeNodeId(nodeId, nodeAliases)),
	);

	const detachLocations = table.detachLocations.mapEntries(
		(id) => replacer.getUpdatedAtomId(id),
		(fieldId) => replaceFieldIdRevision(normalizeFieldId(fieldId, nodeAliases), replacer),
	);

	const outputDetachLocations = table.outputDetachLocations.mapEntries(
		(id) => replacer.getUpdatedAtomId(id),
		(fieldId) => replaceFieldIdRevision(normalizeFieldId(fieldId, nodeAliases), replacer),
	);

	return {
		oldToNewId,
		newToOldId,
		firstIntermediateRenames,
		nodeChanges,
		detachLocations,
		outputDetachLocations,
	};
}

function newDetachedEntryMap(): ChangeAtomIdRangeMap<DetachedNodeEntry> {
	return new RangeMap(offsetChangeAtomId, subtractChangeAtomIds, offsetDetachedNodeEntry);
}

function offsetDetachedNodeEntry(entry: DetachedNodeEntry, count: number): DetachedNodeEntry {
	assert(
		count <= 1 || entry.nodeChange === undefined,
		"Cannot split an entry with a node change",
	);

	return entry.detachId === undefined
		? entry
		: { ...entry, detachId: offsetChangeAtomId(entry.detachId, count) };
}

function getFieldsWithRootMoves(
	roots: RootNodeTable,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): TupleBTree<FieldIdKey, boolean> {
	const fields: TupleBTree<FieldIdKey, boolean> = newFieldIdKeyBTree();
	for (const { start: rootId, value: fieldId, length } of roots.detachLocations.entries()) {
		let isRootMoved = false;
		for (const renameEntry of roots.oldToNewId.getAll2(rootId, length)) {
			if (renameEntry.value !== undefined) {
				isRootMoved = true;
			}
		}

		for (const outputDetachEntry of roots.outputDetachLocations.getAll2(rootId, length)) {
			if (outputDetachEntry.value !== undefined) {
				isRootMoved = true;
			}
		}

		if (isRootMoved) {
			fields.set(fieldIdKeyFromFieldId(normalizeFieldId(fieldId, nodeAliases)), true);
		}
	}

	return fields;
}

function getFieldToRootChanges(
	roots: RootNodeTable,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): TupleBTree<FieldIdKey, ChangeAtomId[]> {
	const fields: TupleBTree<FieldIdKey, ChangeAtomId[]> = newFieldIdKeyBTree();
	for (const rootIdKey of roots.nodeChanges.keys()) {
		const rootId: ChangeAtomId = { revision: rootIdKey[0], localId: rootIdKey[1] };
		const detachLocation = roots.detachLocations.getFirst(rootId, 1).value;
		if (detachLocation !== undefined) {
			const fieldIdKey = fieldIdKeyFromFieldId(normalizeFieldId(detachLocation, nodeAliases));
			let rootsInField = fields.get(fieldIdKey);
			if (rootsInField === undefined) {
				rootsInField = [];
				fields.set(fieldIdKey, rootsInField);
			}

			rootsInField.push(rootId);
		}
	}

	return fields;
}

function getFirstRenameId(
	roots: RootNodeTable,
	inputRootId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId | undefined> {
	const intermediateEntry = roots.firstIntermediateRenames.getFirst(inputRootId, count);
	if (intermediateEntry.value !== undefined) {
		return intermediateEntry;
	}

	return roots.oldToNewId.getFirst(inputRootId, count);
}

function muteRootChanges(roots: RootNodeTable): RootNodeTable {
	return {
		oldToNewId: newChangeAtomIdTransform(),
		newToOldId: newChangeAtomIdTransform(),
		firstIntermediateRenames: newChangeAtomIdTransform(),
		nodeChanges: brand(roots.nodeChanges.clone()),
		detachLocations: roots.detachLocations.clone(),
		outputDetachLocations: newChangeAtomIdRangeMap(),
	};
}

export function validateChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	const unreachableNodes: ChangeAtomIdBTree<NodeLocation> = brand(change.nodeToParent.clone());

	const unreachableCFKs = change.crossFieldKeys.clone();

	validateFieldChanges(
		fieldKinds,
		change,
		change.fieldChanges,
		undefined,
		unreachableNodes,
		unreachableCFKs,
	);

	for (const [[revision, localId], node] of change.nodeChanges.entries()) {
		if (node.fieldChanges === undefined) {
			continue;
		}

		const nodeId = normalizeNodeId({ revision, localId }, change.nodeAliases);
		validateFieldChanges(
			fieldKinds,
			change,
			node.fieldChanges,
			nodeId,
			unreachableNodes,
			unreachableCFKs,
		);
	}

	for (const [detachIdKey, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision: detachIdKey[0], localId: detachIdKey[1] };
		const location = getNodeParent(change, nodeId);
		assert(areEqualChangeAtomIdOpts(location.root, detachId), "Inconsistent node location");

		const normalizedNodeId = normalizeNodeId(nodeId, change.nodeAliases);
		unreachableNodes.delete([normalizedNodeId.revision, normalizedNodeId.localId]);

		const fieldChanges = nodeChangeFromId(
			change.nodeChanges,
			change.nodeAliases,
			nodeId,
		).fieldChanges;

		if (fieldChanges !== undefined) {
			validateFieldChanges(
				fieldKinds,
				change,
				fieldChanges,
				normalizedNodeId,
				unreachableNodes,
				unreachableCFKs,
			);
		}
	}

	if (!containsRollbacks(change)) {
		for (const entry of change.crossFieldKeys.entries()) {
			if (entry.start.target !== NodeMoveType.Attach) {
				continue;
			}

			validateAttach(change, entry.start, entry.length);
		}
	}

	assert(unreachableNodes.size === 0, "Unreachable nodes found");
	assert(unreachableCFKs.entries().length === 0, "Unreachable cross-field keys found");
}

function containsRollbacks(change: ModularChangeset): boolean {
	if (change.revisions === undefined) {
		return false;
	}

	for (const revInfo of change.revisions) {
		if (revInfo.rollbackOf !== undefined) {
			return true;
		}
	}
	return false;
}

function validateAttach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): void {
	let countProcessed = count;
	const buildEntry = hasBuildForIdRange(changeset.builds, attachId, count);
	countProcessed = buildEntry.length;

	const detachEntry = getDetachFieldForAttach(
		changeset.crossFieldKeys,
		changeset.rootNodes,
		attachId,
		count,
	);
	countProcessed = detachEntry.length;

	const renameEntry = changeset.rootNodes.newToOldId.getFirst(attachId, countProcessed);
	countProcessed = renameEntry.length;

	assert(
		buildEntry.value || detachEntry.value !== undefined || renameEntry.value !== undefined,
		"No build, detach, or rename found for attach",
	);

	if (countProcessed < count) {
		validateAttach(
			changeset,
			offsetChangeAtomId(attachId, countProcessed),
			count - countProcessed,
		);
	}
}

function hasBuildForIdRange(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<boolean> {
	if (builds === undefined) {
		return { value: false, length: count };
	}

	const prevBuildEntry = builds.nextLowerPair([id.revision, id.localId]);

	if (prevBuildEntry !== undefined) {
		const prevBuildKey: ChangeAtomId = {
			revision: prevBuildEntry[0][0],
			localId: prevBuildEntry[0][1],
		};

		const prevBuildLength = prevBuildEntry[1].topLevelLength;
		const lastLocalId = prevBuildKey.localId + prevBuildLength - 1;
		if (prevBuildKey.revision === id.revision && lastLocalId >= id.localId) {
			return { value: true, length: Math.min(count, lastLocalId - id.localId + 1) };
		}
	}

	const buildEntry = rangeQueryChangeAtomIdMap(builds, id, count);
	const length =
		buildEntry.value === undefined ? buildEntry.length : buildEntry.value.topLevelLength;

	const hasBuild = buildEntry.value !== undefined;
	return { value: hasBuild, length };
}

/**
 * Asserts that each node has a correct entry in `change.nodeToParent`,
 * and each cross field key has a correct entry in `change.crossFieldKeys`.
 * @returns the number of children found.
 */
function validateFieldChanges(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	change: ModularChangeset,
	fieldChanges: FieldChangeMap,
	nodeParent: NodeId | undefined,
	unreachableNodes: ChangeAtomIdBTree<NodeLocation>,
	unreachableCFKs: CrossFieldRangeTable<FieldId>,
): void {
	for (const [field, fieldChange] of fieldChanges.entries()) {
		const fieldId = { nodeId: nodeParent, field };
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		for (const [child, _index] of handler.getNestedChanges(fieldChange.change)) {
			const parentFieldId = getNodeParent(change, child);
			assert(
				parentFieldId.field !== undefined && areEqualFieldIds(parentFieldId.field, fieldId),
				0xa4e /* Inconsistent node parentage */,
			);

			unreachableNodes.delete([child.revision, child.localId]);
		}

		for (const keyRange of handler.getCrossFieldKeys(fieldChange.change)) {
			const fields = getFieldsForCrossFieldKey(change, keyRange.key, keyRange.count);
			assert(fields.length > 0, "Unregistered cross-field key");
			for (const fieldFromLookup of fields) {
				assert(
					areEqualFieldIds(fieldFromLookup, fieldId),
					0xa4f /* Inconsistent cross field keys */,
				);
			}

			unreachableCFKs.delete(keyRange.key, keyRange.count);
		}
	}
}

export function newFieldIdKeyBTree<V>(): TupleBTree<FieldIdKey, V> {
	return newTupleBTree(compareFieldIdKeys);
}

const compareFieldIdKeys = createTupleComparator([
	comparePartialRevisions,
	comparePartialChangesetLocalIds,
	compareStrings<FieldKey>,
]);
