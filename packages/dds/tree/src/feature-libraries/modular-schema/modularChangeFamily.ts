/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeAtomIdMap,
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
	isEmptyFieldChanges,
	makeAnonChange,
	makeDetachedNodeId,
	mapCursorField,
	replaceAtomRevisions,
	revisionMetadataSourceFromInfo,
	setInChangeAtomIdMap,
	areEqualChangeAtomIds,
	getFromChangeAtomIdMap,
} from "../../core/index.js";
import {
	type IdAllocationState,
	type IdAllocator,
	type Mutable,
	brand,
	deleteFromNestedMap,
	fail,
	forEachInNestedMap,
	getOrAddInMap,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	nestedMapFromFlatList,
	nestedMapToFlatList,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
	type NestedMap,
	type RangeQueryResult,
} from "../../util/index.js";
import {
	type TreeChunk,
	chunkFieldSingle,
	chunkTree,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator.js";

import {
	type CrossFieldManager,
	type CrossFieldMap,
	CrossFieldTarget,
	getFirstFromCrossFieldMap,
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
import type {
	CrossFieldKeyRange,
	CrossFieldKeyTable,
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 */
export class ModularChangeFamily
	implements ChangeFamily<ModularEditBuilder, ModularChangeset>, ChangeRebaser<ModularChangeset>
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
		// TODO: Could this be a FieldChangeHandler instead of a FieldKindWithEditor?
		fieldKind: FieldKindWithEditor;
		change1: FieldChangeset;
		change2: FieldChangeset;
	} {
		// TODO: Handle the case where changes have conflicting field kinds
		const kind =
			change1 !== undefined && change1.fieldKind !== genericFieldKind.identifier
				? change1.fieldKind
				: change2?.fieldKind ?? genericFieldKind.identifier;

		if (kind === genericFieldKind.identifier) {
			// All the changes are generic
			return {
				fieldKind: genericFieldKind,
				change1: change1?.change,
				change2: change2?.change,
			};
		}
		const fieldKind = getFieldKind(this.fieldKinds, kind);
		const handler = fieldKind.changeHandler;
		const normalizedChange1 = this.normalizeFieldChange(
			change1,
			handler,
			genId,
			revisionMetadata,
		);
		const normalizedChange2 = this.normalizeFieldChange(
			change2,
			handler,
			genId,
			revisionMetadata,
		);
		return { fieldKind, change1: normalizedChange1, change2: normalizedChange2 };
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

		return changes.reduce(
			(change1, change2) =>
				makeAnonChange(this.composePair(change1, change2, revInfos, idState)),
			makeAnonChange({
				fieldChanges: new Map(),
				nodeChanges: new Map(),
				nodeToParent: new Map(),
				nodeAliases: new Map(),
				crossFieldKeys: newCrossFieldKeyTable(),
			}),
		).change;
	}

	private composePair(
		change1: TaggedChange<ModularChangeset>,
		change2: TaggedChange<ModularChangeset>,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangeset {
		const genId: IdAllocator = idAllocatorFromState(idState);
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);

		const crossFieldTable = newComposeTable(change1.change, change2.change);

		const composedNodeChanges: ChangeAtomIdMap<NodeChangeset> = mergeNestedMaps(
			change1.change.nodeChanges,
			change2.change.nodeChanges,
		);

		const composedNodeToParent = mergeNestedMaps(
			change1.change.nodeToParent,
			change2.change.nodeToParent,
		);

		const composedFields = this.composeFieldMaps(
			getActiveFieldChanges(change1.change),
			getActiveFieldChanges(change2.change),
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const nodeAliases: ChangeAtomIdMap<NodeId> = mergeNestedMaps(
			change1.change.nodeAliases,
			change2.change.nodeAliases,
		);

		this.composeDiscoveredFields(
			change1.change,
			change2.change,
			crossFieldTable,
			composedFields,
			composedNodeChanges,
			composedNodeToParent,
			nodeAliases,
			genId,
			revisionMetadata,
		);

		while (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			for (const fieldChange of fieldsToUpdate) {
				this.composeInvalidatedField(
					change1.change,
					change2.change,
					composedNodeChanges,
					fieldChange,
					crossFieldTable,
					genId,
					revisionMetadata,
				);

				// Process any newly discovered fields.
				this.composeDiscoveredFields(
					change1.change,
					change2.change,
					crossFieldTable,
					composedFields,
					composedNodeChanges,
					composedNodeToParent,
					nodeAliases,
					genId,
					revisionMetadata,
				);
			}
		}

		const { allBuilds, allDestroys, allRefreshers } = composeBuildsDestroysAndRefreshers([
			change1,
			change2,
		]);

		// XXX
		const composedCrossFieldKeys = mergeBTrees(
			change1.change.crossFieldKeys,
			change2.change.crossFieldKeys,
		);

		return makeModularChangeset(
			this.pruneFieldMap(composedFields, composedNodeChanges),
			composedNodeChanges,
			composedNodeToParent,
			nodeAliases,
			composedCrossFieldKeys,
			idState.maxId,
			revInfos,
			undefined,
			allBuilds,
			allDestroys,
			allRefreshers,
		);
	}

	private composeInvalidatedField(
		change1: ModularChangeset,
		change2: ModularChangeset,
		composedNodeChanges: ChangeAtomIdMap<NodeChangeset>,
		fieldChange: FieldChange,
		crossFieldTable: ComposeTable,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const context = crossFieldTable.fieldToContext.get(fieldChange);
		assert(context !== undefined, 0x8cc /* Should have context for every invalidated field */);
		const { change1: fieldChange1, change2: fieldChange2, composedChange } = context;

		const rebaser = getChangeHandler(this.fieldKinds, composedChange.fieldKind).rebaser;
		const composeNodes = (child1: NodeId | undefined, child2: NodeId | undefined): NodeId => {
			if (
				child1 !== undefined &&
				child2 !== undefined &&
				getFromChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2) === undefined
			) {
				crossFieldTable.nodeIdPairs.push([child1, child2]);
				setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
			}

			return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
		};

		const amendedChange = rebaser.compose(
			fieldChange1,
			fieldChange2,
			composeNodes,
			genId,
			new ComposeManager(crossFieldTable, fieldChange, false),
			revisionMetadata,
		);
		composedChange.change = brand(amendedChange);
	}

	private composeDiscoveredFields(
		change1: ModularChangeset,
		change2: ModularChangeset,
		table: ComposeTable,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdMap<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdMap<FieldId>,
		nodeAliases: ChangeAtomIdMap<NodeId>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		while (
			table.nodeIdPairs.length > 0 ||
			table.affectedBaseFields.length > 0 ||
			table.affectedNewFields.length > 0
		) {
			// Note that the call to `composeNodesById` can add entries to `crossFieldTable.nodeIdPairs`.
			for (const [id1, id2] of table.nodeIdPairs) {
				this.composeNodesById(
					change1.nodeChanges,
					change2.nodeChanges,
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

			table.nodeIdPairs.length = 0;

			this.composeAffectedFields(
				table,
				table.baseChange,
				table.affectedBaseFields,
				composedFields,
				composedNodes,
				true,
				genId,
				metadata,
			);

			this.composeAffectedFields(
				table,
				table.newChange,
				table.affectedNewFields,
				composedFields,
				composedNodes,
				false,
				genId,
				metadata,
			);
		}
	}

	private composeAffectedFields(
		table: ComposeTable,
		change: ModularChangeset,
		affectedFields: BTree<FieldIdKey, boolean>,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdMap<NodeChangeset>,
		areBaseFields: boolean,
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
				continue;
			}

			const emptyChange = this.createEmptyFieldChange(fieldChange.fieldKind);
			const [change1, change2] = areBaseFields
				? [fieldChange, emptyChange]
				: [emptyChange, fieldChange];

			const composedField = this.composeFieldChanges(
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
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const composedFields: FieldChangeMap = new Map();
		if (change1 === undefined || change2 === undefined) {
			return change1 ?? change2 ?? composedFields;
		}

		for (const [field, fieldChange1] of change1) {
			const fieldChange2 = change2.get(field);
			const composedField =
				fieldChange2 !== undefined
					? this.composeFieldChanges(
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

	private composeFieldChanges(
		change1: FieldChange,
		change2: FieldChange,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChange {
		const {
			fieldKind,
			change1: normalizedFieldChange1,
			change2: normalizedFieldChange2,
		} = this.normalizeFieldChanges(change1, change2, idAllocator, revisionMetadata);

		const manager = new ComposeManager(crossFieldTable, change1 ?? change2);
		const change1Normalized = normalizedFieldChange1 ?? fieldKind.changeHandler.createEmpty();
		const change2Normalized = normalizedFieldChange2 ?? fieldKind.changeHandler.createEmpty();

		const composedChange = fieldKind.changeHandler.rebaser.compose(
			change1Normalized,
			change2Normalized,
			(child1, child2) => {
				if (child1 !== undefined && child2 !== undefined) {
					crossFieldTable.nodeIdPairs.push([child1, child2]);
					setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
				}
				return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
			},
			idAllocator,
			manager,
			revisionMetadata,
		);

		const composedField: FieldChange = {
			fieldKind: fieldKind.identifier,
			change: brand(composedChange),
		};

		crossFieldTable.fieldToContext.set(change1, {
			change1: change1Normalized,
			change2: change2Normalized,
			composedChange: composedField,
		});

		crossFieldTable.newFieldToBaseField.set(change2, change1);
		return composedField;
	}

	private composeNodesById(
		nodeChanges1: ChangeAtomIdMap<NodeChangeset>,
		nodeChanges2: ChangeAtomIdMap<NodeChangeset>,
		composedNodes: ChangeAtomIdMap<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdMap<FieldId>,
		nodeAliases: ChangeAtomIdMap<NodeId>,
		id1: NodeId,
		id2: NodeId,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const nodeChangeset1 = nodeChangeFromId(nodeChanges1, id1);
		const nodeChangeset2 = nodeChangeFromId(nodeChanges2, id2);
		const composedNodeChangeset = this.composeNodeChanges(
			nodeChangeset1,
			nodeChangeset2,
			idAllocator,
			crossFieldTable,
			revisionMetadata,
		);

		setInChangeAtomIdMap(composedNodes, id1, composedNodeChangeset);

		if (!areEqualChangeAtomIds(id1, id2)) {
			deleteFromNestedMap(composedNodes, id2.revision, id2.localId);
			deleteFromNestedMap(composedNodeToParent, id2.revision, id2.localId);
			setInChangeAtomIdMap(nodeAliases, id2, id1);
		}

		crossFieldTable.composedNodes.add(composedNodeChangeset);
	}

	private composeNodeChanges(
		change1: NodeChangeset,
		change2: NodeChangeset,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const nodeExistsConstraint = change1?.nodeExistsConstraint ?? change2?.nodeExistsConstraint;

		const composedFieldChanges = this.composeFieldMaps(
			change1.fieldChanges,
			change2.fieldChanges,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const composedNodeChange: NodeChangeset = {};

		if (composedFieldChanges !== undefined && composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		if (nodeExistsConstraint !== undefined) {
			composedNodeChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return composedNodeChange;
	}

	/**
	 * @param change - The change to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * performing a sandwich rebase.
	 */
	public invert(change: TaggedChange<ModularChangeset>, isRollback: boolean): ModularChangeset {
		// Rollback changesets destroy the nodes created by the change being rolled back.
		const destroys = isRollback
			? invertBuilds(change.change.builds, change.revision)
			: undefined;

		// Destroys only occur in rollback changesets, which are never inverted.
		assert(
			change.change.destroys === undefined,
			0x89a /* Unexpected destroys in change to invert */,
		);

		if ((change.change.constraintViolationCount ?? 0) > 0) {
			return makeModularChangeset(
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				change.change.maxId,
				[],
				undefined,
				undefined,
				destroys,
			);
		}

		const genId: IdAllocator = idAllocatorFromMaxId(change.change.maxId ?? -1);
		const crossFieldTable: InvertTable = {
			...newCrossFieldTable<FieldChange>(),
			originalFieldToContext: new Map(),
		};

		const { revInfos } = getRevInfoFromTaggedChanges([change]);
		const revisionMetadata = revisionMetadataSourceFromInfo(revInfos);

		const invertedFields = this.invertFieldMap(
			change.change.fieldChanges,
			isRollback,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const invertedNodes: ChangeAtomIdMap<NodeChangeset> = new Map();
		forEachInNestedMap(change.change.nodeChanges, (nodeChangeset, revision, localId) => {
			setInNestedMap(
				invertedNodes,
				revision,
				localId,
				this.invertNodeChange(
					nodeChangeset,
					isRollback,
					genId,
					crossFieldTable,
					revisionMetadata,
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
					new CrossFieldManagerI(crossFieldTable, fieldChange),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		const crossFieldKeys = this.makeCrossFieldKeyTable(invertedFields, invertedNodes);

		return makeModularChangeset(
			invertedFields,
			invertedNodes,
			change.change.nodeToParent, // XXX
			change.change.nodeAliases,
			crossFieldKeys,
			genId.getMaxId(),
			[],
			change.change.constraintViolationCount,
			undefined,
			destroys,
		);
	}

	private invertFieldMap(
		changes: FieldChangeMap,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes) {
			const manager = new CrossFieldManagerI(crossFieldTable, fieldChange);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(fieldChange.change, isRollback, genId, manager, revisionMetadata);

			const invertedFieldChange: FieldChange = {
				...fieldChange,
				change: brand(invertedChange),
			};
			invertedFields.set(field, invertedFieldChange);

			crossFieldTable.originalFieldToContext.set(fieldChange, {
				invertedField: invertedFieldChange,
			});
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: NodeChangeset,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				change.fieldChanges,
				isRollback,
				genId,
				crossFieldTable,
				revisionMetadata,
			);
		}

		return inverse;
	}

	public rebase(
		taggedChange: TaggedChange<ModularChangeset>,
		over: TaggedChange<ModularChangeset>,
		revisionMetadata: RevisionMetadataSource,
	): ModularChangeset {
		const change = taggedChange.change;
		const maxId = Math.max(change.maxId ?? -1, over.change.maxId ?? -1);
		const idState: IdAllocationState = { maxId };
		const genId: IdAllocator = idAllocatorFromState(idState);

		const crossFieldTable: RebaseTable = {
			...newCrossFieldTable<FieldChange>(),
			newChange: change,
			baseChange: over.change,
			baseFieldToContext: new Map(),
			baseNodeToRebasedNode: new Map(),
			rebasedFields: new Set(),
			rebasedCrossFieldKeys: change.crossFieldKeys.clone(),
			nodeIdPairs: [],
			affectedNewFields: newBTree(),
			affectedBaseFields: newBTree(),
		};

		let constraintState = newConstraintState(change.constraintViolationCount ?? 0);

		const getBaseRevisions = (): RevisionTag[] =>
			revisionInfoFromTaggedChange(over).map((info) => info.revision);

		const rebaseMetadata: RebaseRevisionMetadata = {
			...revisionMetadata,
			getRevisionToRebase: () => taggedChange.revision,
			getBaseRevisions,
		};

		const rebasedNodes: ChangeAtomIdMap<NodeChangeset> = new Map();
		populateNestedMap(change.nodeChanges, rebasedNodes, true);

		const rebasedFields = this.rebaseIntersectingFields(
			crossFieldTable,
			rebasedNodes,
			genId,
			constraintState,
			rebaseMetadata,
		);

		this.rebaseFieldsWithoutBaseChanges(
			rebasedFields,
			rebasedNodes,
			crossFieldTable,
			genId,
			rebaseMetadata,
		);

		this.rebaseFieldsWithoutNewChanges(
			rebasedFields,
			rebasedNodes,
			crossFieldTable,
			genId,
			rebaseMetadata,
		);

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			constraintState = newConstraintState(change.constraintViolationCount ?? 0);
			for (const field of fieldsToUpdate) {
				const context = crossFieldTable.baseFieldToContext.get(field);
				assert(context !== undefined, 0x852 /* Every field should have a context */);
				const {
					fieldKind,
					change1: fieldChangeset,
					change2: baseChangeset,
				} = this.normalizeFieldChanges(
					context.newChange,
					context.baseChange,
					genId,
					revisionMetadata,
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

				context.rebasedChange.change = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					baseChangeset,
					rebaseChild,
					genId,
					new RebaseManager(crossFieldTable, field, context.fieldId),
					rebaseMetadata,
				);
			}
		}

		this.updateConstraintsForFields(
			rebasedFields,
			NodeAttachState.Attached,
			constraintState,
			rebasedNodes,
		);

		return makeModularChangeset(
			this.pruneFieldMap(rebasedFields, rebasedNodes), // XXX
			rebasedNodes,
			change.nodeToParent, // XXX
			change.nodeAliases,
			crossFieldTable.rebasedCrossFieldKeys,
			idState.maxId,
			change.revisions,
			constraintState.violationCount,
			change.builds,
			change.destroys,
			change.refreshers,
		);
	}

	// This performs a first pass on all fields which have both new and base changes.
	// TODO: Can we also handle additional passes in this method?
	private rebaseIntersectingFields(
		crossFieldTable: RebaseTable,
		rebasedNodes: ChangeAtomIdMap<NodeChangeset>,
		genId: IdAllocator,
		constraintState: ConstraintState,
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
		// Note that the call to `rebaseNodeChanges` can add entries to `crossFieldTable.nodeIdPairs`.
		for (const [newId, baseId, _attachState] of crossFieldTable.nodeIdPairs) {
			const newNodeChange = nodeChangeFromId(change.nodeChanges, newId);
			const baseNodeChange = nodeChangeFromId(baseChange.nodeChanges, baseId);

			const rebasedNode = this.rebaseNodeChange(
				newId,
				newNodeChange,
				baseNodeChange,
				genId,
				crossFieldTable,
				metadata,
				constraintState,
			);

			if (rebasedNode !== undefined) {
				setInChangeAtomIdMap(rebasedNodes, newId, rebasedNode);
			}
		}

		return rebasedFields;
	}

	// This processes fields which have no base changes but have been invalidated by another field.
	private rebaseFieldsWithoutBaseChanges(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdMap<NodeChangeset>,
		crossFieldTable: RebaseTable,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		for (const [revision, localId, fieldKey] of crossFieldTable.affectedNewFields.keys()) {
			const nodeId: NodeId | undefined =
				localId !== undefined ? { revision, localId } : undefined;

			const fieldMap = fieldMapFromNodeId(rebasedFields, rebasedNodes, nodeId);

			const fieldChange = fieldMap.get(fieldKey);
			assert(fieldChange !== undefined, "Cross field key registered for empty field");

			if (crossFieldTable.rebasedFields.has(fieldChange)) {
				// This field has already been processed because there were base changes.
				continue;
			}

			// This field has no changes in the base changeset, otherwise it would have been added to `crossFieldTable.rebasedFields`
			// when processing fields with both base and new changes.
			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				stateChange: NodeAttachState | undefined,
			): NodeId | undefined => {
				assert(baseChild === undefined, "There should be no base changes in this field");
				return child;
			};

			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			const baseFieldChange: FieldChange = {
				...fieldChange,
				change: brand(handler.createEmpty()),
			};

			const fieldId: FieldId = { nodeId, field: fieldKey };
			const rebasedField = handler.rebaser.rebase(
				fieldChange.change,
				baseFieldChange.change,
				rebaseChild,
				genId,
				new RebaseManager(crossFieldTable, baseFieldChange, fieldId),
				metadata,
			);

			const rebasedFieldChange: FieldChange = { ...fieldChange, change: brand(rebasedField) };
			fieldMap.set(fieldKey, rebasedFieldChange);

			// TODO: Deduplicate these lines with other rebase locations.
			crossFieldTable.baseFieldToContext.set(baseFieldChange, {
				newChange: fieldChange,
				baseChange: baseFieldChange,
				rebasedChange: rebasedFieldChange,
				fieldId,
				baseNodeIds: [],
			});
			crossFieldTable.rebasedFields.add(rebasedFieldChange);
		}
	}

	// This processes fields which have no new changes but have been invalidated by another field.
	private rebaseFieldsWithoutNewChanges(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdMap<NodeChangeset>,
		crossFieldTable: RebaseTable,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseChange = crossFieldTable.baseChange;
		for (const [revision, localId, fieldKey] of crossFieldTable.affectedBaseFields.keys()) {
			const nodeId =
				localId !== undefined
					? normalizeNodeId({ revision, localId }, baseChange.nodeAliases)
					: undefined;

			const baseFieldChange = fieldMapFromNodeId(
				baseChange.fieldChanges,
				baseChange.nodeChanges,
				nodeId,
			).get(fieldKey);

			assert(baseFieldChange !== undefined, "Cross field key registered for empty field");
			if (crossFieldTable.baseFieldToContext.has(baseFieldChange)) {
				// This field has already been processed because there were changes to rebase.
				continue;
			}

			// This field has no changes in the new changeset, otherwise it would have been added to
			// `crossFieldTable.baseFieldToContext` when processing fields with both base and new changes.
			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				stateChange: NodeAttachState | undefined,
			): NodeId | undefined => {
				assert(child === undefined, "There should be no new changes in this field");
				return child;
			};

			const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);
			const fieldChange: FieldChange = {
				...baseFieldChange,
				change: brand(handler.createEmpty()),
			};

			const fieldId: FieldId = { nodeId, field: fieldKey };
			const rebasedField: unknown = handler.rebaser.rebase(
				fieldChange.change,
				baseFieldChange.change,
				rebaseChild,
				genId,
				new RebaseManager(crossFieldTable, baseFieldChange, fieldId),
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
				{ nodeId, field: fieldKey },
				genId,
				metadata,
			);
		}
	}

	private attachRebasedField(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdMap<NodeChangeset>,
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

		const rebasedNode = tryGetRebasedNodeFromBaseId(table, nodeId);
		if (rebasedNode !== undefined) {
			if (rebasedNode.fieldChanges === undefined) {
				rebasedNode.fieldChanges = new Map([[fieldKey, rebasedField]]);
				return;
			}

			assert(!rebasedNode.fieldChanges.has(fieldKey), "Expected an empty field");
			rebasedNode.fieldChanges.set(fieldKey, rebasedField);
			return;
		}

		const newNode: NodeChangeset = {
			fieldChanges: new Map([[fieldKey, rebasedField]]),
		};

		setInChangeAtomIdMap(rebasedNodes, nodeId, newNode);
		table.baseNodeToRebasedNode.set(
			nodeChangeFromId(table.baseChange.nodeChanges, nodeId),
			newNode,
		);

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
		rebasedNodes: ChangeAtomIdMap<NodeChangeset>,
		table: RebaseTable,
		rebasedNode: NodeId,
		parentFieldIdBase: FieldId,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseFieldChange = fieldChangeFromId(
			table.baseChange.fieldChanges,
			table.baseChange.nodeChanges,
			parentFieldIdBase,
		);

		const context = table.baseFieldToContext.get(baseFieldChange);
		if (context !== undefined) {
			// We've already processed this field.
			// The new child node can be attached when processing invalidated fields.
			// XXX: Add to rebased ancestry here as well?
			context.baseNodeIds.push(rebasedNode);
			table.invalidatedFields.add(baseFieldChange);
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
			(id1, id2) => id1 ?? id2,
			idAllocator,
			new RebaseManager(table, baseFieldChange, parentFieldIdBase),
			metadata,
		);

		// XXX: Add to rebased ancestry
		const rebasedField: FieldChange = { ...baseFieldChange, change: brand(rebasedChangeset) };

		table.baseFieldToContext.set(baseFieldChange, {
			newChange: fieldChange,
			baseChange: baseFieldChange,
			rebasedChange: rebasedField,
			fieldId: parentFieldIdBase,
			baseNodeIds: [],
		});
		table.rebasedFields.add(rebasedField);

		this.attachRebasedField(
			rebasedFields,
			rebasedNodes,
			table,
			rebasedField,
			parentFieldIdBase,
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

		for (const [field, fieldChange] of change) {
			const fieldId: FieldId = { nodeId: parentId, field };
			const baseChange = over.get(field);
			if (baseChange === undefined) {
				rebasedFields.set(field, fieldChange);
				continue;
			}

			const {
				fieldKind,
				change1: fieldChangeset,
				change2: baseChangeset,
			} = this.normalizeFieldChanges(fieldChange, baseChange, genId, revisionMetadata);

			const manager = new RebaseManager(crossFieldTable, baseChange, fieldId);

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

			const rebasedField = fieldKind.changeHandler.rebaser.rebase(
				fieldChangeset,
				baseChangeset,
				rebaseChild,
				genId,
				manager,
				revisionMetadata,
			);

			const rebasedFieldChange: FieldChange = {
				fieldKind: fieldKind.identifier,
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
		id: NodeId,
		change: NodeChangeset,
		over: NodeChangeset,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
		constraintState: ConstraintState,
	): NodeChangeset {
		const baseMap: FieldChangeMap = over?.fieldChanges ?? new Map();

		const fieldChanges =
			change.fieldChanges !== undefined && over.fieldChanges !== undefined
				? this.rebaseFieldMap(
						change?.fieldChanges ?? new Map(),
						baseMap,
						id,
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

		crossFieldTable.baseNodeToRebasedNode.set(over, rebasedChange);
		return rebasedChange;
	}

	private updateConstraintsForFields(
		fields: FieldChangeMap,
		parentAttachState: NodeAttachState,
		constraintState: ConstraintState,
		nodes: ChangeAtomIdMap<NodeChangeset>,
	): void {
		for (const field of fields.values()) {
			const handler = getChangeHandler(this.fieldKinds, field.fieldKind);
			for (const [nodeId, index] of handler.getNestedChanges(field.change)) {
				const isDetached = index === undefined;
				const attachState =
					parentAttachState === NodeAttachState.Detached || isDetached
						? NodeAttachState.Detached
						: NodeAttachState.Attached;
				this.updateConstraintsForNode(nodeId, attachState, constraintState, nodes);
			}
		}
	}

	private updateConstraintsForNode(
		nodeId: NodeId,
		attachState: NodeAttachState,
		constraintState: ConstraintState,
		nodes: ChangeAtomIdMap<NodeChangeset>,
	): void {
		const node =
			tryGetFromNestedMap(nodes, nodeId.revision, nodeId.localId) ?? fail("Unknown node ID");

		if (node.nodeExistsConstraint !== undefined) {
			const isNowViolated = attachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraint.violated !== isNowViolated) {
				node.nodeExistsConstraint = {
					...node.nodeExistsConstraint,
					violated: isNowViolated,
				};
				constraintState.violationCount += isNowViolated ? 1 : -1;
			}
		}

		if (node.fieldChanges !== undefined) {
			this.updateConstraintsForFields(node.fieldChanges, attachState, constraintState, nodes);
		}
	}

	private pruneFieldMap(
		changeset: FieldChangeMap | undefined,
		nodeMap: ChangeAtomIdMap<NodeChangeset>,
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
		nodeMap: ChangeAtomIdMap<NodeChangeset>,
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
			deleteFromNestedMap(nodeMap, nodeId.revision, nodeId.localId);
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
			change.revisions === undefined
				? [undefined]
				: change.revisions.map((revInfo) => revInfo.revision),
		);
		const updatedFields = this.replaceFieldMapRevisions(
			change.fieldChanges,
			oldRevisions,
			newRevision,
		);

		const updatedNodes: ChangeAtomIdMap<NodeChangeset> = nestedMapFromFlatList(
			nestedMapToFlatList(change.nodeChanges).map(([revision, id, nodeChangeset]) => [
				replaceRevision(revision, oldRevisions, newRevision),
				id,
				this.replaceNodeChangesetRevisions(nodeChangeset, oldRevisions, newRevision),
			]),
		);

		const updatedNodeToParent: ChangeAtomIdMap<FieldId> = nestedMapFromFlatList(
			nestedMapToFlatList(change.nodeToParent).map(([revision, id, fieldId]) => [
				replaceRevision(revision, oldRevisions, newRevision),
				id,
				replaceFieldIdRevision(
					normalizeFieldId(fieldId, change.nodeAliases),
					oldRevisions,
					newRevision,
				),
			]),
		);

		const updated: Mutable<ModularChangeset> = {
			...change,
			fieldChanges: updatedFields,
			nodeChanges: updatedNodes,
			nodeToParent: updatedNodeToParent,

			// We've updated all references to old node IDs, so we no longer need an alias table.
			nodeAliases: new Map(),
			crossFieldKeys: replaceCrossFieldKeyTableRevisions(
				change.crossFieldKeys,
				oldRevisions,
				newRevision,
				change.nodeAliases,
			),
		};

		if (change.builds !== undefined) {
			updated.builds = replaceIdMapRevisions(change.builds, oldRevisions, newRevision);
		}

		if (change.destroys !== undefined) {
			updated.destroys = replaceIdMapRevisions(change.destroys, oldRevisions, newRevision);
		}

		if (change.refreshers !== undefined) {
			updated.refreshers = replaceIdMapRevisions(
				change.refreshers,
				oldRevisions,
				newRevision,
			);
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
		nodes: ChangeAtomIdMap<NodeChangeset>,
	): CrossFieldKeyTable {
		const keys: CrossFieldKeyTable = newCrossFieldKeyTable();
		this.populateCrossFieldKeyTableForFieldMap(keys, fields, undefined);
		forEachInNestedMap(nodes, (node, revision, localId) => {
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
			for (const key of keys) {
				table.set(key, { nodeId: parent, field: fieldKey });
			}
		}
	}

	public buildEditor(changeReceiver: (change: ModularChangeset) => void): ModularEditBuilder {
		return new ModularEditBuilder(this, this.fieldKinds, changeReceiver);
	}

	private createEmptyFieldChange(fieldKind: FieldKindIdentifier): FieldChange {
		const emptyChange = getChangeHandler(this.fieldKinds, fieldKind).createEmpty();
		return { fieldKind, change: brand(emptyChange) };
	}
}

function replaceCrossFieldKeyTableRevisions(
	table: CrossFieldKeyTable,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
	nodeAliases: ChangeAtomIdMap<NodeId>,
): CrossFieldKeyTable {
	const updated: CrossFieldKeyTable = newBTree();
	table.forEachPair(([target, revision, id, count], field) => {
		const updatedKey: CrossFieldKeyRange = [
			target,
			replaceRevision(revision, oldRevisions, newRevision),
			id,
			count,
		];

		const normalizedFieldId = normalizeFieldId(field, nodeAliases);
		const updatedNodeId =
			normalizedFieldId.nodeId !== undefined
				? replaceAtomRevisions(normalizedFieldId.nodeId, oldRevisions, newRevision)
				: undefined;

		const updatedValue: FieldId = {
			...normalizedFieldId,
			nodeId: updatedNodeId,
		};

		updated.set(updatedKey, updatedValue);
	});

	return updated;
}

function replaceRevision(
	revision: RevisionTag | undefined,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): RevisionTag | undefined {
	return oldRevisions.has(revision) ? newRevision : revision;
}

function replaceIdMapRevisions<T>(
	map: ChangeAtomIdMap<T>,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): ChangeAtomIdMap<T> {
	return nestedMapFromFlatList(
		nestedMapToFlatList(map).map(([revision, id, value]) => [
			replaceRevision(revision, oldRevisions, newRevision),
			id,
			value,
		]),
	);
}

interface BuildsDestroysAndRefreshers {
	readonly allBuilds: ChangeAtomIdMap<TreeChunk>;
	readonly allDestroys: ChangeAtomIdMap<number>;
	readonly allRefreshers: ChangeAtomIdMap<TreeChunk>;
}

function composeBuildsDestroysAndRefreshers(
	changes: TaggedChange<ModularChangeset>[],
): BuildsDestroysAndRefreshers {
	const allBuilds: ChangeAtomIdMap<TreeChunk> = new Map();
	const allDestroys: ChangeAtomIdMap<number> = new Map();
	const allRefreshers: ChangeAtomIdMap<TreeChunk> = new Map();
	for (const taggedChange of changes) {
		const revision = revisionFromTaggedChange(taggedChange);
		const change = taggedChange.change;
		if (change.builds) {
			for (const [revisionKey, innerMap] of change.builds) {
				const setRevisionKey = revisionKey ?? revision;
				const innerDstMap = getOrAddInMap(
					allBuilds,
					setRevisionKey,
					new Map<ChangesetLocalId, TreeChunk>(),
				);
				for (const [id, chunk] of innerMap) {
					// Check for duplicate builds and prefer earlier ones.
					// This can happen in compositions of commits that needed to include detached tree refreshers (e.g., undos):
					// In that case, it's possible for the refreshers to contain different trees because the latter
					// refresher may already reflect the changes made by the commit that includes the earlier
					// refresher. This composition includes the changes made by the commit that includes the
					// earlier refresher, so we need to include the build for the earlier refresher, otherwise
					// the produced changeset will build a tree one which those changes have already been applied
					// and also try to apply the changes again, effectively applying them twice.
					// Note that it would in principle be possible to adopt the later build and exclude from the
					// composition all the changes already reflected on the tree, but that is not something we
					// care to support at this time.
					if (!innerDstMap.has(id)) {
						// Check for earlier destroys that this build might cancel-out with.
						const destroyCount = tryGetFromNestedMap(allDestroys, setRevisionKey, id);
						if (destroyCount === undefined) {
							innerDstMap.set(id, chunk);
						} else {
							assert(
								destroyCount === chunk.topLevelLength,
								0x89b /* Expected build and destroy to have the same length */,
							);
							deleteFromNestedMap(allDestroys, setRevisionKey, id);
						}
					}
				}
				if (innerDstMap.size === 0) {
					allBuilds.delete(setRevisionKey);
				}
			}
		}
		if (change.destroys !== undefined) {
			for (const [revisionKey, innerMap] of change.destroys) {
				const setRevisionKey = revisionKey ?? revision;
				const innerDstMap = getOrAddInMap(
					allDestroys,
					setRevisionKey,
					new Map<ChangesetLocalId, number>(),
				);
				for (const [id, count] of innerMap) {
					// Check for earlier builds that this destroy might cancel-out with.
					const chunk = tryGetFromNestedMap(allBuilds, setRevisionKey, id);
					if (chunk === undefined) {
						innerDstMap.set(id, count);
					} else {
						assert(
							count === chunk.topLevelLength,
							0x89c /* Expected build and destroy to have the same length */,
						);
						deleteFromNestedMap(allBuilds, setRevisionKey, id);
					}
				}
				if (innerDstMap.size === 0) {
					allDestroys.delete(setRevisionKey);
				}
			}
		}
		// add all refreshers while preferring earlier ones
		if (change.refreshers) {
			populateNestedMap(change.refreshers, allRefreshers, false);
		}
	}
	return { allBuilds, allDestroys, allRefreshers };
}

function invertBuilds(
	builds: ChangeAtomIdMap<TreeChunk> | undefined,
	fallbackRevision: RevisionTag | undefined,
): ChangeAtomIdMap<number> | undefined {
	if (builds !== undefined) {
		const destroys: ChangeAtomIdMap<number> = new Map();
		for (const [revision, innerBuildMap] of builds) {
			const initializedRevision = revision ?? fallbackRevision;
			const innerDestroyMap: Map<ChangesetLocalId, number> = new Map();
			for (const [id, chunk] of innerBuildMap) {
				innerDestroyMap.set(id, chunk.topLevelLength);
			}
			destroys.set(initializedRevision, innerDestroyMap);
		}
		return destroys;
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
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	for (const [_, fieldChange] of change) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		const delegate = function* (node: NodeId): Iterable<DeltaDetachedNodeId> {
			const nodeChangeset = nodeChangeFromId(nodeChanges, node);
			if (nodeChangeset.fieldChanges !== undefined) {
				yield* relevantRemovedRootsFromFields(
					nodeChangeset.fieldChanges,
					nodeChanges,
					fieldKinds,
				);
			}
		};
		yield* handler.relevantRemovedRoots(fieldChange.change, delegate);
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
	const refreshers: ChangeAtomIdMap<TreeChunk> = new Map();
	const chunkLengths: Map<RevisionTag | undefined, BTree<number, number>> = new Map();

	if (change.builds !== undefined) {
		for (const [major, buildsMap] of change.builds) {
			const lengthTree = getOrAddInMap(chunkLengths, major, new BTree());
			for (const [id, chunk] of buildsMap) {
				lengthTree.set(id, chunk.topLevelLength);
			}
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
			setInNestedMap(refreshers, root.major, root.minor, node);
		}
	}

	const {
		fieldChanges,
		nodeChanges,
		maxId,
		revisions,
		constraintViolationCount,
		builds,
		destroys,
	} = change;

	return makeModularChangeset(
		fieldChanges,
		nodeChanges,
		change.nodeToParent,
		change.nodeAliases,
		change.crossFieldKeys,
		maxId,
		revisions,
		constraintViolationCount,
		builds,
		destroys,
		refreshers,
	);
}

/**
 * @param change - The change to convert into a delta.
 * @param fieldKinds - The field kinds to delegate to.
 */
export function intoDelta(
	taggedChange: TaggedChange<ModularChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaRoot {
	const change = taggedChange.change;
	const idAllocator = MemoizedIdRangeAllocator.fromNextId();
	const rootDelta: Mutable<DeltaRoot> = {};

	if ((change.constraintViolationCount ?? 0) === 0) {
		// If there are no constraint violations, then tree changes apply.
		const fieldDeltas = intoDeltaImpl(
			change.fieldChanges,
			change.nodeChanges,
			idAllocator,
			fieldKinds,
		);
		if (fieldDeltas.size > 0) {
			rootDelta.fields = fieldDeltas;
		}
	}

	// Constraint violations should not prevent nodes from being built
	if (change.builds && change.builds.size > 0) {
		rootDelta.build = copyDetachedNodes(change.builds);
	}
	if (change.destroys !== undefined && change.destroys.size > 0) {
		const destroys: DeltaDetachedNodeDestruction[] = [];
		forEachInNestedMap(change.destroys, (count, major, minor) => {
			destroys.push({
				id: makeDetachedNodeId(major, minor),
				count,
			});
		});
		rootDelta.destroy = destroys;
	}
	if (change.refreshers && change.refreshers.size > 0) {
		rootDelta.refreshers = copyDetachedNodes(change.refreshers);
	}
	return rootDelta;
}

function copyDetachedNodes(
	detachedNodes: ChangeAtomIdMap<TreeChunk>,
): DeltaDetachedNodeBuild[] | undefined {
	const copiedDetachedNodes: DeltaDetachedNodeBuild[] = [];
	forEachInNestedMap(detachedNodes, (chunk, major, minor) => {
		if (chunk.topLevelLength > 0) {
			const trees = mapCursorField(chunk.cursor(), (c) =>
				cursorForMapTreeNode(mapTreeFromCursor(c)),
			);
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major, minor),
				trees,
			});
		}
	});
	return copiedDetachedNodes.length > 0 ? copiedDetachedNodes : undefined;
}

/**
 * @param change - The change to convert into a delta.
 */
function intoDeltaImpl(
	change: FieldChangeMap,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();
	for (const [field, fieldChange] of change) {
		const deltaField = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			fieldChange.change,
			(childChange): DeltaFieldMap => {
				const nodeChange = nodeChangeFromId(nodeChanges, childChange);
				return deltaFromNodeChange(nodeChange, nodeChanges, idAllocator, fieldKinds);
			},
			idAllocator,
		);
		if (!isEmptyFieldChanges(deltaField)) {
			delta.set(field, deltaField);
		}
	}
	return delta;
}

function deltaFromNodeChange(
	change: NodeChangeset,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, nodeChanges, idAllocator, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

/**
 * @internal
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
	return change.fieldChanges === undefined && change.nodeExistsConstraint === undefined;
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
	srcTable: CrossFieldMap<unknown>;
	dstTable: CrossFieldMap<unknown>;
	srcDependents: CrossFieldMap<TFieldData>;
	dstDependents: CrossFieldMap<TFieldData>;
	invalidatedFields: Set<TFieldData>;
}

interface InvertTable extends CrossFieldTable<FieldChange> {
	originalFieldToContext: Map<FieldChange, InvertContext>;
}

interface InvertContext {
	invertedField: FieldChange;
}

// XXX: We want to have a cross field table for each field, so that the field can iterate the set of keys touched
// Each field should also have the set of base node IDs which should be included
// Probably we should merge this information with RebaseFieldContext
// What is the key for this table?
// Need to support both new and base field ID, reconciling them when we discover they are the same?
interface RebaseTable extends CrossFieldTable<FieldChange> {
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from the FieldChange key used for the CrossFieldTable (which is the base FieldChange)
	 * to the context for the field.
	 */
	readonly baseFieldToContext: Map<FieldChange, RebaseFieldContext>;
	readonly baseNodeToRebasedNode: Map<NodeChangeset, NodeChangeset>;
	readonly rebasedFields: Set<FieldChange>;
	readonly rebasedCrossFieldKeys: CrossFieldKeyTable;

	/**
	 * List of (newId, baseId) pairs encountered so far.
	 */
	readonly nodeIdPairs: [NodeId, NodeId, NodeAttachState | undefined][];

	readonly affectedNewFields: BTree<FieldIdKey, boolean>;
	readonly affectedBaseFields: BTree<FieldIdKey, boolean>;
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

function newComposeTable(baseChange: ModularChangeset, newChange: ModularChangeset): ComposeTable {
	return {
		...newCrossFieldTable<FieldChange>(),
		baseChange,
		newChange,
		fieldToContext: new Map(),
		newFieldToBaseField: new Map(),
		newToBaseNodeId: new Map(),
		nodeIdPairs: [],
		composedNodes: new Set(),
		affectedBaseFields: newBTree(),
		affectedNewFields: newBTree(),
	};
}

interface ComposeTable extends CrossFieldTable<FieldChange> {
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from an input changeset for a field (from change1 if it has one, from change2 otherwise) to the context for that field.
	 */
	readonly fieldToContext: Map<FieldChange, ComposeFieldContext>;
	readonly newFieldToBaseField: Map<FieldChange, FieldChange>;

	// TODO: This could just be new IDs
	readonly nodeIdPairs: [NodeId, NodeId][];
	readonly newToBaseNodeId: ChangeAtomIdMap<NodeId>;
	readonly composedNodes: Set<NodeChangeset>;
	readonly affectedBaseFields: BTree<FieldIdKey, boolean>;
	readonly affectedNewFields: BTree<FieldIdKey, boolean>;
}

interface ComposeFieldContext {
	change1: FieldChangeset;
	change2: FieldChangeset;
	composedChange: FieldChange;
}

function newCrossFieldTable<T>(): CrossFieldTable<T> {
	return {
		srcTable: new Map(),
		dstTable: new Map(),
		srcDependents: new Map(),
		dstDependents: new Map(),
		invalidatedFields: new Set(),
	};
}

/**
 * @internal
 */
interface ConstraintState {
	violationCount: number;
}

function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
}

class CrossFieldManagerI<T> implements CrossFieldManager {
	public constructor(
		protected readonly crossFieldTable: CrossFieldTable<T>,
		private readonly currentFieldKey: T,
		protected readonly allowInval = true,
	) {}

	public set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const lastChangedId = (id as number) + count - 1;
			let firstId = id;
			while (firstId <= lastChangedId) {
				const dependentEntry = getFirstFromCrossFieldMap(
					this.getDependents(target),
					revision,
					firstId,
					lastChangedId - firstId + 1,
				);
				if (dependentEntry.value !== undefined) {
					this.crossFieldTable.invalidatedFields.add(dependentEntry.value);
				}

				firstId = brand(firstId + dependentEntry.length);
			}
		}
		setInCrossFieldMap(this.getMap(target), revision, id, count, newValue);
	}

	public get(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		addDependency: boolean,
	): RangeQueryResult<unknown> {
		if (addDependency) {
			// We assume that if there is already an entry for this ID it is because
			// a field handler has called compose on the same node multiple times.
			// In this case we only want to update the latest version, so we overwrite the dependency.
			setInCrossFieldMap(
				this.getDependents(target),
				revision,
				id,
				count,
				this.currentFieldKey,
			);
		}
		return getFirstFromCrossFieldMap(this.getMap(target), revision, id, count);
	}

	public moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {}

	private getMap(target: CrossFieldTarget): CrossFieldMap<unknown> {
		return target === CrossFieldTarget.Source
			? this.crossFieldTable.srcTable
			: this.crossFieldTable.dstTable;
	}

	private getDependents(target: CrossFieldTarget): CrossFieldMap<T> {
		return target === CrossFieldTarget.Source
			? this.crossFieldTable.srcDependents
			: this.crossFieldTable.dstDependents;
	}
}

class RebaseManager extends CrossFieldManagerI<FieldChange> {
	public constructor(
		table: RebaseTable,
		currentField: FieldChange,
		private readonly fieldId: FieldId,
		allowInval = true,
	) {
		super(table, currentField, allowInval);
	}

	public override set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const newFieldIds = getFieldsForCrossFieldKey(this.table.newChange, [
				target,
				revision,
				id,
				count,
			]);

			if (newFieldIds.length > 0) {
				for (const newFieldId of newFieldIds) {
					this.table.affectedNewFields.set(
						[newFieldId.nodeId?.revision, newFieldId.nodeId?.localId, newFieldId.field],
						true,
					);
				}
			} else {
				const baseFieldIds = getFieldsForCrossFieldKey(this.table.baseChange, [
					target,
					revision,
					id,
					count,
				]);

				assert(
					baseFieldIds.length > 0,
					"Cross field key not registered in base or new change",
				);

				for (const baseFieldId of baseFieldIds) {
					this.table.affectedBaseFields.set(
						[
							baseFieldId.nodeId?.revision,
							baseFieldId.nodeId?.localId,
							baseFieldId.field,
						],
						true,
					);
				}
			}
		}

		super.set(target, revision, id, count, newValue, invalidateDependents);
	}

	public override moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {
		super.moveKey(target, revision, id, count);
		// XXX: Need custom setter which handles key ranges
		this.table.rebasedCrossFieldKeys.set([target, revision, id, count], this.fieldId);
	}

	private get table(): RebaseTable {
		return this.crossFieldTable as RebaseTable;
	}
}

// TODO: Deduplicate this with RebaseTable
class ComposeManager extends CrossFieldManagerI<FieldChange> {
	public constructor(table: ComposeTable, currentField: FieldChange, allowInval = true) {
		super(table, currentField, allowInval);
	}

	public override set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const newFieldIds = getFieldsForCrossFieldKey(this.table.newChange, [
				target,
				revision,
				id,
				count,
			]);

			if (newFieldIds.length > 0) {
				for (const newFieldId of newFieldIds) {
					this.table.affectedNewFields.set(
						[newFieldId.nodeId?.revision, newFieldId.nodeId?.localId, newFieldId.field],
						true,
					);
				}
			} else {
				const baseFieldIds = getFieldsForCrossFieldKey(this.table.baseChange, [
					target,
					revision,
					id,
					count,
				]);

				assert(
					baseFieldIds.length > 0,
					"Cross field key not registered in base or new change",
				);

				for (const baseFieldId of baseFieldIds) {
					this.table.affectedBaseFields.set(
						[
							baseFieldId.nodeId?.revision,
							baseFieldId.nodeId?.localId,
							baseFieldId.field,
						],
						true,
					);
				}
			}
		}

		super.set(target, revision, id, count, newValue, invalidateDependents);
	}

	private get table(): ComposeTable {
		return this.crossFieldTable as ComposeTable;
	}
}

function makeModularChangeset(
	fieldChanges: FieldChangeMap | undefined = undefined,
	nodeChanges: ChangeAtomIdMap<NodeChangeset> | undefined = undefined,
	nodeToParent: ChangeAtomIdMap<FieldId> | undefined = undefined,
	nodeAliases: ChangeAtomIdMap<NodeId> | undefined = undefined,
	crossFieldKeys: CrossFieldKeyTable | undefined = undefined,
	maxId: number = -1,
	revisions: readonly RevisionInfo[] | undefined = undefined,
	constraintViolationCount: number | undefined = undefined,
	builds?: ChangeAtomIdMap<TreeChunk>,
	destroys?: ChangeAtomIdMap<number>,
	refreshers?: ChangeAtomIdMap<TreeChunk>,
): ModularChangeset {
	const changeset: Mutable<ModularChangeset> = {
		fieldChanges: fieldChanges ?? new Map(),
		nodeChanges: nodeChanges ?? new Map(),
		nodeToParent: nodeToParent ?? new Map(),
		nodeAliases: nodeAliases ?? new Map(),
		crossFieldKeys: crossFieldKeys ?? newCrossFieldKeyTable(),
	};

	if (revisions !== undefined && revisions.length > 0) {
		changeset.revisions = revisions;
	}
	if (maxId >= 0) {
		changeset.maxId = brand(maxId);
	}
	if (constraintViolationCount !== undefined && constraintViolationCount > 0) {
		changeset.constraintViolationCount = constraintViolationCount;
	}
	if (builds !== undefined && builds.size > 0) {
		changeset.builds = builds;
	}
	if (destroys !== undefined && destroys.size > 0) {
		changeset.destroys = destroys;
	}
	if (refreshers !== undefined && refreshers.size > 0) {
		changeset.refreshers = refreshers;
	}
	return changeset;
}

export class ModularEditBuilder extends EditBuilder<ModularChangeset> {
	private transactionDepth: number = 0;
	private idAllocator: IdAllocator;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, ModularChangeset>,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		changeReceiver: (change: ModularChangeset) => void,
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
	 * @returns A description of the edit that can be passed to `submitChanges`.
	 */
	public buildTrees(
		firstId: ChangesetLocalId,
		content: ITreeCursorSynchronous,
	): GlobalEditDescription {
		if (content.mode === CursorLocationType.Fields && content.getFieldLength() === 0) {
			return { type: "global" };
		}
		const builds: ChangeAtomIdMap<TreeChunk> = new Map();
		const innerMap = new Map();
		builds.set(undefined, innerMap);
		const chunk =
			content.mode === CursorLocationType.Fields
				? chunkFieldSingle(content, defaultChunkPolicy)
				: chunkTree(content, defaultChunkPolicy);
		innerMap.set(firstId, chunk);

		return {
			type: "global",
			builds,
		};
	}

	/**
	 * Adds a change to the edit builder
	 * @param field - the field which is being edited
	 * @param fieldKind - the kind of the field
	 * @param change - the change to the field
	 * @param maxId - the highest `ChangesetLocalId` used in this change
	 */
	public submitChange(
		field: FieldUpPath,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
	): void {
		const crossFieldKeys = getChangeHandler(this.fieldKinds, fieldKind).getCrossFieldKeys(
			change,
		);

		const modularChange = buildModularChangesetFromField(
			field,
			{ fieldKind, change },
			new Map(),
			new Map(),
			newCrossFieldKeyTable(),
			this.idAllocator,
			crossFieldKeys,
		);
		this.applyChange(modularChange);
	}

	public submitChanges(changes: EditDescription[]): void {
		const modularChange = this.buildChanges(changes);
		this.applyChange(modularChange);
	}

	public buildChanges(changes: EditDescription[]): ModularChangeset {
		const changeMaps = changes.map((change) =>
			makeAnonChange(
				change.type === "global"
					? makeModularChangeset(
							undefined,
							undefined,
							undefined,
							undefined,
							undefined,
							this.idAllocator.getMaxId(),
							undefined,
							undefined,
							change.builds,
					  )
					: buildModularChangesetFromField(
							change.field,
							{
								fieldKind: change.fieldKind,
								change: change.change,
							},
							new Map(),
							new Map(),
							newCrossFieldKeyTable(),
							this.idAllocator,
							getChangeHandler(this.fieldKinds, change.fieldKind).getCrossFieldKeys(
								change.change,
							),
					  ),
			),
		);
		const composedChange: Mutable<ModularChangeset> =
			this.changeFamily.rebaser.compose(changeMaps);

		const maxId: ChangesetLocalId = brand(this.idAllocator.getMaxId());
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		return composedChange;
	}

	public generateId(count?: number): ChangesetLocalId {
		return brand(this.idAllocator.allocate(count));
	}

	public addNodeExistsConstraint(path: UpPath): void {
		const nodeChange: NodeChangeset = {
			nodeExistsConstraint: { violated: false },
		};

		this.applyChange(
			buildModularChangesetFromNode(
				path,
				nodeChange,
				new Map(),
				new Map(),
				newCrossFieldKeyTable(),
				this.idAllocator,
			),
		);
	}
}

function buildModularChangesetFromField(
	path: FieldUpPath,
	fieldChange: FieldChange,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	nodeToParent: ChangeAtomIdMap<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator = idAllocatorFromMaxId(),
	localCrossFieldKeys: CrossFieldKeyRange[] = [],
	childId: NodeId | undefined = undefined,
): ModularChangeset {
	const fieldChanges: FieldChangeMap = new Map([[path.field, fieldChange]]);

	if (path.parent === undefined) {
		for (const key of localCrossFieldKeys) {
			crossFieldKeys.set(key, { nodeId: undefined, field: path.field });
		}

		if (childId !== undefined) {
			setInChangeAtomIdMap(nodeToParent, childId, {
				nodeId: undefined,
				field: path.field,
			});
		}

		return makeModularChangeset(
			fieldChanges,
			nodeChanges,
			nodeToParent,
			undefined,
			crossFieldKeys,
			idAllocator.getMaxId(),
		);
	}

	const nodeChangeset: NodeChangeset = {
		fieldChanges,
	};

	const parentId: NodeId = { localId: brand(idAllocator.allocate()) };

	for (const key of localCrossFieldKeys) {
		crossFieldKeys.set(key, { nodeId: parentId, field: path.field });
	}

	if (childId !== undefined) {
		setInChangeAtomIdMap(nodeToParent, childId, {
			nodeId: parentId,
			field: path.field,
		});
	}

	return buildModularChangesetFromNode(
		path.parent,
		nodeChangeset,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
		parentId,
	);
}

function buildModularChangesetFromNode(
	path: UpPath,
	nodeChange: NodeChangeset,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	nodeToParent: ChangeAtomIdMap<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
	nodeId: NodeId = { localId: brand(idAllocator.allocate()) },
): ModularChangeset {
	setInChangeAtomIdMap(nodeChanges, nodeId, nodeChange);
	const fieldChangeset = genericFieldKind.changeHandler.editor.buildChildChange(
		path.parentIndex,
		nodeId,
	);

	const fieldChange: FieldChange = {
		fieldKind: genericFieldKind.identifier,
		change: fieldChangeset,
	};

	return buildModularChangesetFromField(
		{ parent: path.parent, field: path.parentField },
		fieldChange,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
		[],
		nodeId,
	);
}

/**
 * @internal
 */
export interface FieldEditDescription {
	type: "field";
	field: FieldUpPath;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

/**
 * @internal
 */
export interface GlobalEditDescription {
	type: "global";
	builds?: ChangeAtomIdMap<TreeChunk>;
}

/**
 * @internal
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

function revisionFromTaggedChange(change: TaggedChange<ModularChangeset>): RevisionTag | undefined {
	return change.revision ?? revisionFromRevInfos(change.change.revisions);
}

function revisionFromRevInfos(
	revInfos: undefined | readonly RevisionInfo[],
): RevisionTag | undefined {
	if (revInfos === undefined || revInfos.length !== 1) {
		return undefined;
	}
	return revInfos[0].revision;
}

function mergeBTrees<K, V>(tree1: BTree<K, V>, tree2: BTree<K, V>): BTree<K, V> {
	const result = tree1.clone();
	tree2.forEachPair((k, v) => {
		result.set(k, v);
	});

	return result;
}

function mergeNestedMaps<K1, K2, V>(
	map1: NestedMap<K1, K2, V>,
	map2: NestedMap<K1, K2, V>,
): NestedMap<K1, K2, V> {
	// XXX: Should assert there are no collisions?
	return nestedMapFromFlatList([...nestedMapToFlatList(map1), ...nestedMapToFlatList(map2)]);
}

function fieldChangeFromId(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdMap<NodeChangeset>,
	id: FieldId,
): FieldChange {
	const fieldMap = fieldMapFromNodeId(fields, nodes, id.nodeId);
	return fieldMap.get(id.field) ?? fail("No field exists for the given ID");
}

function fieldMapFromNodeId(
	rootFieldMap: FieldChangeMap,
	nodes: ChangeAtomIdMap<NodeChangeset>,
	nodeId: NodeId | undefined,
): FieldChangeMap {
	if (nodeId === undefined) {
		return rootFieldMap;
	}

	const node = nodeChangeFromId(nodes, nodeId);
	assert(node.fieldChanges !== undefined, "Expected node to have field changes");
	return node.fieldChanges;
}

function tryGetRebasedNodeFromBaseId(
	table: RebaseTable,
	baseId: NodeId,
): NodeChangeset | undefined {
	const baseNode = nodeChangeFromId(table.baseChange.nodeChanges, baseId);
	return table.baseNodeToRebasedNode.get(baseNode);
}

function nodeChangeFromId(nodes: ChangeAtomIdMap<NodeChangeset>, id: NodeId): NodeChangeset {
	const node = getFromChangeAtomIdMap(nodes, id);
	assert(node !== undefined, "Unknown node ID");
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
	assert(parentId !== undefined, "Parent field should be defined");
	return normalizeFieldId(parentId, changeset.nodeAliases);
}

export function getFieldsForCrossFieldKey(
	changeset: ModularChangeset,
	[target, revision, id, count]: CrossFieldKeyRange,
): FieldId[] {
	let firstLocalId: number = id;
	const lastLocalId = firstLocalId + count - 1;

	const fields: FieldId[] = [];

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const entry = changeset.crossFieldKeys.getPairOrNextLower([target, revision, id, Infinity]);
		if (entry === undefined) {
			return fields;
		}

		const [entryKey, fieldId] = entry;
		const [entryTarget, entryRevision, entryId, entryCount] = entryKey;
		if (entryTarget !== target || entryRevision !== revision) {
			return fields;
		}

		const entryLastId = entryId + entryCount - 1;

		if (entryId > firstLocalId || entryLastId < firstLocalId) {
			// TODO: We should probably assert that the ID ranges have no overlap.
			return fields;
		}

		fields.push(normalizeFieldId(fieldId, changeset.nodeAliases));
		if (entryLastId >= lastLocalId) {
			return fields;
		}

		firstLocalId = entryLastId + 1;
	}
}

function normalizeFieldId(fieldId: FieldId, nodeAliases: ChangeAtomIdMap<NodeId>): FieldId {
	return fieldId.nodeId !== undefined
		? { ...fieldId, nodeId: normalizeNodeId(fieldId.nodeId, nodeAliases) }
		: fieldId;
}

function normalizeNodeId(nodeId: NodeId, nodeAliases: ChangeAtomIdMap<NodeId>): NodeId {
	const dealiased = getFromChangeAtomIdMap(nodeAliases, nodeId);
	return dealiased !== undefined ? normalizeNodeId(dealiased, nodeAliases) : nodeId;
}

function getActiveFieldChanges(changes: ModularChangeset): FieldChangeMap {
	return (changes.constraintViolationCount ?? 0) === 0
		? changes.fieldChanges
		: new Map<FieldKey, FieldChange>();
}

export function newCrossFieldKeyTable(): CrossFieldKeyTable {
	return newBTree();
}

// XXX: Can we use branding to ensure that we never create changesets with B trees with a default comparator?
function newBTree<K extends unknown[], V>(): BTree<K, V> {
	return new BTree<K, V>(undefined, compareTuples);
}

// This assumes that the arrays are the same length.
function compareTuples(arrayA: unknown[], arrayB: unknown[]): number {
	for (let i = 0; i < arrayA.length; i++) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const a = arrayA[i] as any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const b = arrayB[i] as any;
		if (a < b) {
			return -1;
		} else if (a > b) {
			return 1;
		}
	}

	return 0;
}
