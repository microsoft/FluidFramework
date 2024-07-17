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
	revisionMetadataSourceFromInfo,
	type ChangeAtomId,
} from "../../core/index.js";
import {
	type IdAllocationState,
	type IdAllocator,
	type Mutable,
	type NestedSet,
	addToNestedSet,
	brand,
	deleteFromNestedMap,
	fail,
	forEachInNestedMap,
	getOrAddInMap,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	nestedMapFromFlatList,
	nestedMapToFlatList,
	nestedSetContains,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
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
import {
	convertGenericChange,
	genericFieldKind,
	newGenericChangeset,
} from "./genericFieldKind.js";
import type { GenericChangeset } from "./genericFieldKindTypes.js";
import type {
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
	NodeId,
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
		change1: FieldChange | undefined,
		change2: FieldChange | undefined,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): {
		fieldKind: FieldKindWithEditor;
		change1: FieldChangeset | undefined;
		change2: FieldChangeset | undefined;
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
		fieldChange: FieldChange | undefined,
		handler: FieldChangeHandler<T>,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeset | undefined {
		if (fieldChange === undefined) {
			return undefined;
		}

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
			makeAnonChange({ fieldChanges: new Map(), nodeChanges: new Map() }),
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

		const crossFieldTable = newComposeTable();

		const composedFields = this.composeFieldMaps(
			getActiveFieldChanges(change1.change),
			getActiveFieldChanges(change2.change),
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const composedNodeChanges: ChangeAtomIdMap<NodeChangeset> = new Map();
		for (const [id1, id2] of crossFieldTable.nodeIdPairs) {
			this.composeNodesById(
				change1.change.nodeChanges,
				change2.change.nodeChanges,
				composedNodeChanges,
				id1,
				id2,
				genId,
				crossFieldTable,
				revisionMetadata,
			);
		}

		crossFieldTable.nodeIdPairs.length = 0;

		while (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			for (const fieldChange of fieldsToUpdate) {
				const context = crossFieldTable.fieldToContext.get(fieldChange);
				assert(
					context !== undefined,
					0x8cc /* Should have context for every invalidated field */,
				);
				const { change1: fieldChange1, change2: fieldChange2, composedChange } = context;

				const rebaser = getChangeHandler(this.fieldKinds, composedChange.fieldKind).rebaser;
				const composeNodes = (
					child1: NodeId | undefined,
					child2: NodeId | undefined,
				): NodeId => {
					if (
						child2 !== undefined &&
						!nestedSetContains(crossFieldTable.nodeIds, child2.revision, child2.localId)
					) {
						crossFieldTable.nodeIdPairs.push([child1, child2]);
						if (child1 !== undefined && child2 !== undefined) {
							addToNestedSet(crossFieldTable.nodeIds, child2.revision, child2.localId);
						}
					}
					return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
				};

				const amendedChange = rebaser.compose(
					fieldChange1,
					fieldChange2,
					composeNodes,
					genId,
					newCrossFieldManager(crossFieldTable, fieldChange, false),
					revisionMetadata,
				);
				composedChange.change = brand(amendedChange);

				// Process any newly discovered nodes.
				for (const [taggedId1, taggedId2] of crossFieldTable.nodeIdPairs) {
					this.composeNodesById(
						change1.change.nodeChanges,
						change2.change.nodeChanges,
						composedNodeChanges,
						taggedId1,
						taggedId2,
						genId,
						crossFieldTable,
						revisionMetadata,
					);
				}

				crossFieldTable.nodeIdPairs.length = 0;
			}
		}

		const { allBuilds, allDestroys, allRefreshers } = composeBuildsDestroysAndRefreshers([
			change1,
			change2,
		]);

		return makeModularChangeset(
			this.pruneFieldMap(composedFields, composedNodeChanges),
			composedNodeChanges,
			idState.maxId,
			revInfos,
			undefined,
			allBuilds,
			allDestroys,
			allRefreshers,
		);
	}

	private composeFieldMaps(
		change1: FieldChangeMap | undefined,
		change2: FieldChangeMap | undefined,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const composedFields: FieldChangeMap = new Map();
		const fields = new Set<FieldKey>();
		for (const field of change1?.keys() ?? []) {
			fields.add(field);
		}

		for (const field of change2?.keys() ?? []) {
			fields.add(field);
		}

		for (const field of fields) {
			const fieldChange1 = change1?.get(field);
			const fieldChange2 = change2?.get(field);

			const {
				fieldKind,
				change1: normalizedFieldChange1,
				change2: normalizedFieldChange2,
			} = this.normalizeFieldChanges(fieldChange1, fieldChange2, genId, revisionMetadata);

			const manager = newCrossFieldManager(crossFieldTable, fieldChange1 ?? fieldChange2);
			const change1Normalized =
				normalizedFieldChange1 ?? fieldKind.changeHandler.createEmpty();
			const change2Normalized =
				normalizedFieldChange2 ?? fieldKind.changeHandler.createEmpty();

			const composedChange = fieldKind.changeHandler.rebaser.compose(
				change1Normalized,
				change2Normalized,
				(child1, child2) => {
					crossFieldTable.nodeIdPairs.push([child1, child2]);
					if (child2 !== undefined) {
						addToNestedSet(crossFieldTable.nodeIds, child2.revision, child2.localId);
					}
					return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
				},
				genId,
				manager,
				revisionMetadata,
			);

			const composedField: FieldChange = {
				fieldKind: fieldKind.identifier,
				change: brand(composedChange),
			};

			const fieldKey =
				fieldChange1 ?? fieldChange2 ?? fail("At least one field should have changes");

			crossFieldTable.fieldToContext.set(fieldKey, {
				change1: change1Normalized,
				change2: change2Normalized,
				composedChange: composedField,
			});

			// TODO: Could optimize by checking that composedField is non-empty
			composedFields.set(field, composedField);
		}

		return composedFields;
	}

	private composeNodesById(
		nodeChanges1: ChangeAtomIdMap<NodeChangeset>,
		nodeChanges2: ChangeAtomIdMap<NodeChangeset>,
		composedNodeChanges: ChangeAtomIdMap<NodeChangeset>,
		id1: NodeId | undefined,
		id2: NodeId | undefined,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const nodeChangeset1 =
			id1 !== undefined
				? tryGetFromNestedMap(nodeChanges1, id1.revision, id1.localId) ??
					fail("Unknown node ID")
				: {};

		const nodeChangeset2 =
			id2 !== undefined
				? tryGetFromNestedMap(nodeChanges2, id2.revision, id2.localId) ??
					fail("Unknown node ID")
				: {};

		const composedNodeChangeset = this.composeNodeChanges(
			nodeChangeset1,
			nodeChangeset2,
			idAllocator,
			crossFieldTable,
			revisionMetadata,
		);

		const nodeId = id1 ?? id2 ?? fail("Should not compose two undefined node IDs");
		setInNestedMap(
			composedNodeChanges,
			nodeId.revision,
			nodeId.localId,
			composedNodeChangeset,
		);
	}

	private composeNodeChanges(
		change1: NodeChangeset | undefined,
		change2: NodeChangeset | undefined,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const nodeExistsConstraint =
			change1?.nodeExistsConstraint ?? change2?.nodeExistsConstraint;

		const composedFieldChanges = this.composeFieldMaps(
			change1?.fieldChanges,
			change2?.fieldChanges,
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

		return composedNodeChange;
	}

	/**
	 * @param change - The change to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * performing a sandwich rebase.
	 */
	public invert(
		change: TaggedChange<ModularChangeset>,
		isRollback: boolean,
	): ModularChangeset {
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
				change.change.maxId,
				[],
				undefined,
				undefined,
				destroys,
			);
		}

		const idState: IdAllocationState = { maxId: change.change.maxId ?? -1 };
		// This idState is used for the whole of the IdAllocator's lifetime, which allows
		// this function to read the updated idState.maxId after more IDs are allocated.
		// TODO: add a getMax function to IdAllocator to make for a clearer contract.
		const genId: IdAllocator = idAllocatorFromState(idState);
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
					newCrossFieldManager(crossFieldTable, fieldChange),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		return makeModularChangeset(
			invertedFields,
			invertedNodes,
			idState.maxId,
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
			const manager = newCrossFieldManager(crossFieldTable, fieldChange);
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
			fieldToContext: new Map(),
			rebasedNodeCache: new Map(),
			nodeIdPairs: [],
		};

		let constraintState = newConstraintState(change.constraintViolationCount ?? 0);

		const getBaseRevisions = (): RevisionTag[] =>
			revisionInfoFromTaggedChange(over).map((info) => info.revision);

		const rebaseMetadata: RebaseRevisionMetadata = {
			...revisionMetadata,
			getRevisionToRebase: () => taggedChange.revision,
			getBaseRevisions,
		};

		const rebasedFields = this.rebaseFieldMap(
			change.fieldChanges,
			over.change.fieldChanges,
			genId,
			crossFieldTable,
			rebaseMetadata,
		);

		const rebasedNodes: ChangeAtomIdMap<NodeChangeset> = new Map();
		for (const [newId, baseId] of crossFieldTable.nodeIdPairs) {
			const newNodeChange =
				newId !== undefined
					? tryGetFromNestedMap(change.nodeChanges, newId.revision, newId.localId)
					: undefined;

			const baseNodeChange =
				baseId !== undefined
					? tryGetFromNestedMap(over.change.nodeChanges, baseId.revision, baseId.localId) ??
						fail("Unknown node ID")
					: {};

			const rebasedNode = this.rebaseNodeChange(
				newNodeChange,
				baseNodeChange,
				genId,
				crossFieldTable,
				rebaseMetadata,
			);

			if (rebasedNode !== undefined) {
				const nodeId = newId ?? baseId ?? fail("Should not have two undefined IDs");
				setInNestedMap(rebasedNodes, nodeId.revision, nodeId.localId, rebasedNode);
			}
		}

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			constraintState = newConstraintState(change.constraintViolationCount ?? 0);
			for (const field of fieldsToUpdate) {
				// TODO: Should we copy the context table out before this loop?
				const context = crossFieldTable.fieldToContext.get(field);
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

				context.rebasedChange.change = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					baseChangeset,
					(curr, base, existenceState) => curr ?? base,
					genId,
					newCrossFieldManager(crossFieldTable, field),
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
			this.pruneFieldMap(rebasedFields, rebasedNodes),
			rebasedNodes,
			idState.maxId,
			change.revisions,
			constraintState.violationCount,
			change.builds,
			change.destroys,
			change.refreshers,
		);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: FieldChangeMap,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();

		// Rebase fields contained in the base changeset
		for (const [field, baseChanges] of over) {
			const fieldChange: FieldChange = change.get(field) ?? {
				fieldKind: genericFieldKind.identifier,
				change: brand(newGenericChangeset()),
			};
			const {
				fieldKind,
				change1: fieldChangeset,
				change2: baseChangeset,
			} = this.normalizeFieldChanges(fieldChange, baseChanges, genId, revisionMetadata);

			const manager = newCrossFieldManager(crossFieldTable, fieldChange);

			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				_attachState: NodeAttachState | undefined,
			): ChangeAtomId => {
				crossFieldTable.nodeIdPairs.push([child, baseChild]);
				return (
					child ??
					// The fact `child` is undefined means that the changeset to rebase does not include changes for
					// this node or its descendants. However, it's possible that it will after rebasing.
					// In that case, we will need a NodeId to represent these changes under in the rebased changeset.
					// We adopt `baseChild` for this purpose.
					baseChild ??
					fail("Should not have two undefined node IDs")
				);
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

			crossFieldTable.fieldToContext.set(fieldChange, {
				baseChange: baseChanges,
				newChange: fieldChange,
				rebasedChange: rebasedFieldChange,
			});
		}

		// Rebase the fields of the new changeset which don't have a corresponding base field.
		for (const [field, fieldChange] of change) {
			if (!over?.has(field)) {
				const baseChanges: FieldChange = {
					fieldKind: genericFieldKind.identifier,
					change: brand(newGenericChangeset()),
				};

				const {
					fieldKind,
					change1: fieldChangeset,
					change2: baseChangeset,
				} = this.normalizeFieldChanges(fieldChange, baseChanges, genId, revisionMetadata);

				// TODO: Don't we need to add an entry in the context table?
				const manager = newCrossFieldManager(crossFieldTable, fieldChange);
				const rebasedChangeset = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					baseChangeset,
					(child, baseChild) => {
						assert(
							baseChild === undefined,
							0x5b6 /* This field should not have any base changes */,
						);

						crossFieldTable.nodeIdPairs.push([child, undefined]);

						return child;
					},
					genId,
					manager,
					revisionMetadata,
				);
				const rebasedFieldChange: FieldChange = {
					fieldKind: fieldKind.identifier,
					change: brand(rebasedChangeset),
				};
				rebasedFields.set(field, rebasedFieldChange);
			}
		}

		return rebasedFields;
	}

	private rebaseNodeChange(
		change: NodeChangeset | undefined,
		over: NodeChangeset | undefined,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
	): NodeChangeset | undefined {
		const key = change ?? over;
		if (key === undefined) {
			return undefined;
		}

		const baseMap: FieldChangeMap = over?.fieldChanges ?? new Map();

		const fieldChanges = this.rebaseFieldMap(
			change?.fieldChanges ?? new Map(),
			baseMap,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const rebasedChange: NodeChangeset = {};

		if (fieldChanges.size > 0) {
			rebasedChange.fieldChanges = fieldChanges;
		}

		if (change?.nodeExistsConstraint !== undefined) {
			rebasedChange.nodeExistsConstraint = change.nodeExistsConstraint;
		}

		crossFieldTable.rebasedNodeCache.set(key, rebasedChange);
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
		changeset: FieldChangeMap,
		nodeMap: ChangeAtomIdMap<NodeChangeset>,
	): FieldChangeMap | undefined {
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
		const changeset = tryGetFromNestedMap(nodeMap, nodeId.revision, nodeId.localId);
		assert(changeset !== undefined, 0x930 /* Unknown node ID */);

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
			setInNestedMap(nodeMap, nodeId.revision, nodeId.localId, prunedChange);
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

		const updated: Mutable<ModularChangeset> = {
			...change,
			fieldChanges: updatedFields,
			nodeChanges: updatedNodes,
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
			const updatedFieldChange = getFieldKind(
				this.fieldKinds,
				fieldChange.fieldKind,
			).changeHandler.rebaser.replaceRevisions(fieldChange.change, oldRevisions, newRevision);

			updatedFields.set(field, { ...fieldChange, change: updatedFieldChange });
		}

		return updatedFields;
	}

	public buildEditor(changeReceiver: (change: ModularChangeset) => void): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver);
	}
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
			const nodeChangeset = tryGetFromNestedMap(nodeChanges, node.revision, node.localId);
			assert(nodeChangeset !== undefined, 0x931 /* Unknown node ID */);
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
				const nodeChange = tryGetFromNestedMap(
					nodeChanges,
					childChange.revision,
					childChange.localId,
				);

				assert(nodeChange !== undefined, 0x932 /* Unknown node ID */);
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

interface RebaseTable extends CrossFieldTable<FieldChange> {
	/**
	 * Maps from the FieldChange key used for the CrossFieldTable (which is the FieldChange being rebased)
	 * to context for the field.
	 */
	fieldToContext: Map<FieldChange, RebaseFieldContext>;
	/**
	 * This map caches the output of a prior rebasing computation for a node, keyed on that computation's input.
	 * The input for such a computation is characterized by a pair of node changesets:
	 * - The node changeset from the input changeset being rebased
	 * - The corresponding node changeset from the changeset being rebased over.
	 *
	 * Either of these may be undefined so we adopt the following convention:
	 * - If the node changeset from the changeset being rebased is defined, then we use that as the key
	 * - Otherwise, if the node changeset from the changeset being rebased over is defined, then we use that as the key
	 * - Otherwise, we don't cache the output (which will be undefined anyway).
	 *
	 * This map is needed once we switch from the initial pass (which generates a new changeset) to the second pass which
	 * performs surgery on the changeset generated in the first pass: we don't want to re-run the rebasing of nested
	 * changes. Instead we want to keep using the objects generated in the first pass and mutate them where needed.
	 */
	rebasedNodeCache: Map<NodeChangeset, NodeChangeset>;

	/**
	 * List of (newId, baseId) pairs encountered so far.
	 */
	nodeIdPairs: [NodeId | undefined, NodeId | undefined][];
}

interface RebaseFieldContext {
	baseChange: FieldChange;
	newChange: FieldChange;
	rebasedChange: FieldChange;
}

function newComposeTable(): ComposeTable {
	return {
		...newCrossFieldTable<FieldChange>(),
		fieldToContext: new Map(),
		nodeIds: new Map(),
		nodeIdPairs: [],
	};
}

interface ComposeTable extends CrossFieldTable<FieldChange> {
	/**
	 * Maps from an input changeset for a field (from change1 if it has one, from change2 otherwise) to the context for that field.
	 */
	fieldToContext: Map<FieldChange, ComposeFieldContext>;

	/**
	 * The set of node IDs from the second changeset which have been encountered.
	 */
	nodeIds: NestedSet<RevisionTag, ChangesetLocalId>;

	nodeIdPairs: [NodeId | undefined, NodeId | undefined][];
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

interface CrossFieldManagerI<T> extends CrossFieldManager {
	table: CrossFieldTable<T>;
}

function newCrossFieldManager<T>(
	crossFieldTable: CrossFieldTable<T>,
	currentFieldKey: T,
	allowInval = true,
): CrossFieldManagerI<T> {
	const getMap = (target: CrossFieldTarget): CrossFieldMap<unknown> =>
		target === CrossFieldTarget.Source ? crossFieldTable.srcTable : crossFieldTable.dstTable;

	const getDependents = (target: CrossFieldTarget): CrossFieldMap<T> =>
		target === CrossFieldTarget.Source
			? crossFieldTable.srcDependents
			: crossFieldTable.dstDependents;

	const manager = {
		table: crossFieldTable,

		set: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
			count: number,
			newValue: unknown,
			invalidateDependents: boolean,
		) => {
			if (invalidateDependents && allowInval) {
				const lastChangedId = (id as number) + count - 1;
				let firstId = id;
				while (firstId <= lastChangedId) {
					const dependentEntry = getFirstFromCrossFieldMap(
						getDependents(target),
						revision,
						firstId,
						lastChangedId - firstId + 1,
					);
					if (dependentEntry.value !== undefined) {
						crossFieldTable.invalidatedFields.add(dependentEntry.value);
					}

					firstId = brand(firstId + dependentEntry.length);
				}
			}
			setInCrossFieldMap(getMap(target), revision, id, count, newValue);
		},

		get: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
			count: number,
			addDependency: boolean,
		) => {
			if (addDependency) {
				// We assume that if there is already an entry for this ID it is because
				// a field handler has called compose on the same node multiple times.
				// In this case we only want to update the latest version, so we overwrite the dependency.
				setInCrossFieldMap(getDependents(target), revision, id, count, currentFieldKey);
			}
			return getFirstFromCrossFieldMap(getMap(target), revision, id, count);
		},
	};

	return manager;
}

function makeModularChangeset(
	fieldChanges: FieldChangeMap | undefined = undefined,
	nodeChanges: ChangeAtomIdMap<NodeChangeset> | undefined = undefined,
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
		const modularChange = buildModularChangesetFromField(
			field,
			{ fieldKind, change },
			new Map(),
			this.idAllocator,
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
							this.idAllocator,
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
			buildModularChangesetFromNode(path, nodeChange, new Map(), this.idAllocator),
		);
	}
}

function buildModularChangesetFromField(
	path: FieldUpPath,
	fieldChange: FieldChange,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: IdAllocator = idAllocatorFromMaxId(),
): ModularChangeset {
	const fieldChanges: FieldChangeMap = new Map([[path.field, fieldChange]]);

	if (path.parent === undefined) {
		return makeModularChangeset(fieldChanges, nodeChanges, idAllocator.getMaxId());
	}

	const nodeChangeset: NodeChangeset = {
		fieldChanges,
	};

	return buildModularChangesetFromNode(path.parent, nodeChangeset, nodeChanges, idAllocator);
}

function buildModularChangesetFromNode(
	path: UpPath,
	nodeChange: NodeChangeset,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: IdAllocator,
): ModularChangeset {
	const nodeId: NodeId = { localId: brand(idAllocator.allocate()) };
	setInNestedMap(nodeChanges, nodeId.revision, nodeId.localId, nodeChange);
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
		idAllocator,
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

function revisionFromTaggedChange(
	change: TaggedChange<ModularChangeset>,
): RevisionTag | undefined {
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

function getActiveFieldChanges(changes: ModularChangeset): FieldChangeMap {
	return (changes.constraintViolationCount ?? 0) === 0
		? changes.fieldChanges
		: new Map<FieldKey, FieldChange>();
}
