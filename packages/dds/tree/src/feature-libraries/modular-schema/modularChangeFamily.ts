/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import { ICodecFamily } from "../../codec/index.js";
import {
	ChangeAtomIdMap,
	ChangeEncodingContext,
	ChangeFamily,
	ChangeFamilyEditor,
	ChangeRebaser,
	ChangesetLocalId,
	CursorLocationType,
	DeltaDetachedNodeBuild,
	DeltaDetachedNodeDestruction,
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaRoot,
	EditBuilder,
	FieldKey,
	FieldKindIdentifier,
	FieldUpPath,
	ITreeCursorSynchronous,
	RevisionInfo,
	RevisionMetadataSource,
	RevisionTag,
	TaggedChange,
	UpPath,
	emptyDelta,
	isEmptyFieldChanges,
	makeAnonChange,
	makeDetachedNodeId,
	mapCursorField,
	revisionMetadataSourceFromInfo,
	tagChange,
	taggedAtomId,
	taggedOptAtomId,
} from "../../core/index.js";
import {
	IdAllocationState,
	IdAllocator,
	Mutable,
	NestedSet,
	addToNestedSet,
	brand,
	deleteFromNestedMap,
	fail,
	forEachInNestedMap,
	getOrAddInMap,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	nestedSetContains,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import {
	TreeChunk,
	chunkFieldSingle,
	chunkTree,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator.js";

import {
	CrossFieldManager,
	CrossFieldMap,
	CrossFieldTarget,
	getFirstFromCrossFieldMap,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
import {
	FieldChangeHandler,
	NodeExistenceState,
	RebaseRevisionMetadata,
} from "./fieldChangeHandler.js";
import { FieldKindWithEditor, withEditor } from "./fieldKindWithEditor.js";
import { convertGenericChange, genericFieldKind, newGenericChangeset } from "./genericFieldKind.js";
import { GenericChangeset } from "./genericFieldKindTypes.js";
import {
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
					"Should not have two changesets to compose",
				);

				return child1 ?? child2 ?? fail("Should not compose two undefined node IDs");
			},
			genId,
			revisionMetadata,
		) as FieldChangeset;

		return convertedChange;
	}

	public compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		const activeChanges = changes.filter(
			(change) => (change.change.constraintViolationCount ?? 0) === 0,
		);

		const { revInfos, maxId } = getRevInfoFromTaggedChanges(changes);
		const idState: IdAllocationState = { maxId };

		return activeChanges.reduce(
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
			change1.change.fieldChanges,
			change1.revision,
			change2.change.fieldChanges,
			change2.revision,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const composedNodeChanges: ChangeAtomIdMap<NodeChangeset> = new Map();
		for (const [taggedId1, taggedId2] of crossFieldTable.nodeIdPairs) {
			this.composeNodesById(
				change1.change.nodeChanges,
				change2.change.nodeChanges,
				composedNodeChanges,
				taggedId1?.change,
				taggedId1?.revision,
				taggedId2?.change,
				taggedId2?.revision,
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

				const rebaser = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser;
				const composeNodes = (
					child1: NodeId | undefined,
					child2: NodeId | undefined,
				): NodeId => {
					if (
						child2 !== undefined &&
						!nestedSetContains(crossFieldTable.nodeIds, child2.revision, child2.localId)
					) {
						const taggedId1 =
							child1 !== undefined
								? tagChange(child1, fieldChange1.revision)
								: undefined;

						const taggedId2 =
							child2 !== undefined
								? tagChange(child2, fieldChange2.revision)
								: undefined;

						crossFieldTable.nodeIdPairs.push([taggedId1, taggedId2]);
						if (child1 !== undefined && child2 !== undefined) {
							addToNestedSet(
								crossFieldTable.nodeIds,
								child2.revision,
								child2.localId,
							);
						}
					}
					return (
						taggedOptAtomId(child1, fieldChange1.revision) ??
						taggedOptAtomId(child2, fieldChange2.revision) ??
						fail("Should not compose two undefined nodes")
					);
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
						taggedId1?.change,
						taggedId1?.revision,
						taggedId2?.change,
						taggedId2?.revision,
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
		revision1: RevisionTag | undefined,
		change2: FieldChangeMap | undefined,
		revision2: RevisionTag | undefined,
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
			const taggedChange1 = tagChange(
				normalizedFieldChange1 ?? fieldKind.changeHandler.createEmpty(),
				fieldChange1?.revision ?? revision1,
			);
			const taggedChange2 = tagChange(
				normalizedFieldChange2 ?? fieldKind.changeHandler.createEmpty(),
				fieldChange2?.revision ?? revision2,
			);

			const composedChange = fieldKind.changeHandler.rebaser.compose(
				taggedChange1,
				taggedChange2,
				(child1, child2) => {
					const taggedId1 =
						child1 !== undefined
							? tagChange(child1, taggedChange1.revision)
							: undefined;

					const taggedId2 =
						child2 !== undefined
							? tagChange(child2, taggedChange2.revision)
							: undefined;

					crossFieldTable.nodeIdPairs.push([taggedId1, taggedId2]);
					if (child2 !== undefined) {
						addToNestedSet(crossFieldTable.nodeIds, child2.revision, child2.localId);
					}
					return (
						taggedOptAtomId(child1, revision1) ??
						taggedOptAtomId(child2, revision2) ??
						fail("Should not compose two undefined nodes")
					);
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
				change1: taggedChange1,
				change2: taggedChange2,
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
		revision1: RevisionTag | undefined,
		id2: NodeId | undefined,
		revision2: RevisionTag | undefined,
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
			revision1,
			nodeChangeset2,
			revision2,
			idAllocator,
			crossFieldTable,
			revisionMetadata,
		);

		const nodeId =
			taggedOptAtomId(id1, revision1) ??
			taggedOptAtomId(id2, revision2) ??
			fail("Should not compose two undefined node IDs");
		setInNestedMap(composedNodeChanges, nodeId.revision, nodeId.localId, composedNodeChangeset);
	}

	private composeNodeChanges(
		change1: NodeChangeset | undefined,
		revision1: RevisionTag | undefined,
		change2: NodeChangeset | undefined,
		revision2: RevisionTag | undefined,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const nodeExistsConstraint = change1?.nodeExistsConstraint ?? change2?.nodeExistsConstraint;

		const composedFieldChanges = this.composeFieldMaps(
			change1?.fieldChanges,
			revision1,
			change2?.fieldChanges,
			revision2,
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
	 * @param repairStore - The store to query for repair data.
	 */
	public invert(change: TaggedChange<ModularChangeset>, isRollback: boolean): ModularChangeset {
		// Return an empty inverse for changes with constraint violations
		if ((change.change.constraintViolationCount ?? 0) > 0) {
			return makeModularChangeset();
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
			tagChange(change.change.fieldChanges, revisionFromTaggedChange(change)),
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
					// TODO: This does not allow inheriting revision from parent
					tagChange(nodeChangeset, change.revision),
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
				const { invertedField, revision } = context;

				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.invert(
					tagChange(originalFieldChange, revision),
					isRollback,
					genId,
					newCrossFieldManager(crossFieldTable, fieldChange),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		// Rollback changesets destroy the nodes created by the change being rolled back.
		const destroys = isRollback
			? invertBuilds(change.change.builds, change.revision)
			: undefined;

		// Destroys only occur in rollback changesets, which are never inverted.
		assert(
			change.change.destroys === undefined,
			0x89a /* Unexpected destroys in change to invert */,
		);

		const revInfo = change.change.revisions;
		return makeModularChangeset(
			invertedFields,
			invertedNodes,
			idState.maxId,
			revInfo === undefined
				? undefined
				: (isRollback
						? revInfo.map(({ revision }) => ({ revision, rollbackOf: revision }))
						: Array.from(revInfo)
				  ).reverse(),
			change.change.constraintViolationCount,
			undefined,
			destroys,
		);
	}

	private invertFieldMap(
		changes: TaggedChange<FieldChangeMap>,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes.change) {
			const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

			const manager = newCrossFieldManager(crossFieldTable, fieldChange);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(
				{ revision, change: fieldChange.change },
				isRollback,
				genId,
				manager,
				revisionMetadata,
			);

			const invertedFieldChange: FieldChange = {
				...fieldChange,
				change: brand(invertedChange),
			};
			invertedFields.set(field, invertedFieldChange);

			crossFieldTable.originalFieldToContext.set(fieldChange, {
				invertedField: invertedFieldChange,
				revision,
			});
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: TaggedChange<NodeChangeset>,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				{ ...change, change: change.change.fieldChanges },
				isRollback,
				genId,
				crossFieldTable,
				revisionMetadata,
			);
		}

		return inverse;
	}

	public rebase(
		change: ModularChangeset,
		over: TaggedChange<ModularChangeset>,
		revisionMetadata: RevisionMetadataSource,
	): ModularChangeset {
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

		const getBaseRevisions = () =>
			revisionInfoFromTaggedChange(over).map((info) => info.revision);

		const rebaseMetadata = {
			...revisionMetadata,
			getBaseRevisions,
		};

		const rebasedFields = this.rebaseFieldMap(
			change.fieldChanges,
			tagChange(over.change.fieldChanges, revisionFromTaggedChange(over)),
			genId,
			crossFieldTable,
			() => true,
			rebaseMetadata,
			constraintState,
		);

		const rebasedNodes: ChangeAtomIdMap<NodeChangeset> = new Map();
		for (const [newId, taggedBaseId, existenceState] of crossFieldTable.nodeIdPairs) {
			const newNodeChange =
				newId !== undefined
					? tryGetFromNestedMap(change.nodeChanges, newId.revision, newId.localId)
					: undefined;

			const taggedBaseNodeChange =
				taggedBaseId !== undefined
					? tagChange(
							tryGetFromNestedMap(
								over.change.nodeChanges,
								taggedBaseId.change.revision,
								taggedBaseId.change.localId,
							) ?? fail("Unknown node ID"),
							taggedBaseId.revision,
					  )
					: makeAnonChange({});

			const rebasedNode = this.rebaseNodeChange(
				newNodeChange,
				taggedBaseNodeChange,
				genId,
				crossFieldTable,
				() => true,
				rebaseMetadata,
				constraintState,
				existenceState,
			);

			if (rebasedNode !== undefined) {
				const nodeId =
					newId ??
					taggedAtomId(
						taggedBaseId?.change ?? fail("Should not have two undefined IDs"),
						taggedBaseId?.revision,
					);

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
					tagChange(baseChangeset, context.baseRevision),
					(curr, base, existenceState) => curr,
					genId,
					newCrossFieldManager(crossFieldTable, field),
					rebaseMetadata,
				);
			}
		}

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
		over: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		fieldFilter: (baseChange: FieldChange, newChange: FieldChange | undefined) => boolean,
		revisionMetadata: RebaseRevisionMetadata,
		constraintState: ConstraintState,
		existenceState: NodeExistenceState = NodeExistenceState.Alive,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();

		// Rebase fields contained in the base changeset
		for (const [field, baseChanges] of over.change) {
			if (!fieldFilter(baseChanges, change.get(field))) {
				continue;
			}

			const fieldChange: FieldChange = change.get(field) ?? {
				fieldKind: genericFieldKind.identifier,
				change: brand(newGenericChangeset()),
			};
			const {
				fieldKind,
				change1: fieldChangeset,
				change2: baseChangeset,
			} = this.normalizeFieldChanges(fieldChange, baseChanges, genId, revisionMetadata);

			const { revision } = over;
			const taggedBaseChange = { revision, change: baseChangeset };

			const manager = newCrossFieldManager(crossFieldTable, fieldChange);

			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				stateChange: NodeExistenceState | undefined,
			) => {
				const taggedBase =
					baseChild !== undefined ? tagChange(baseChild, over.revision) : undefined;

				crossFieldTable.nodeIdPairs.push([child, taggedBase, stateChange]);
				return (
					child ??
					// The fact `child` is undefined means that the changeset to rebase does not include changes for
					// this node or its descendants. However, it's possible that it will after rebasing.
					// In that case, we will need a NodeId to represent these changes under in the rebased changeset.
					// We adopt `baseChild` for this purpose.
					taggedAtomId(
						baseChild ?? fail("Should not have two undefined node IDs"),
						over.revision,
					)
				);
			};

			const rebasedField = fieldKind.changeHandler.rebaser.rebase(
				fieldChangeset,
				taggedBaseChange,
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
				baseRevision: revision,
				newChange: fieldChange,
				rebasedChange: rebasedFieldChange,
			});
		}

		// Rebase the fields of the new changeset which don't have a corresponding base field.
		for (const [field, fieldChange] of change) {
			if (!over.change?.has(field)) {
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
					tagChange(baseChangeset, over.revision),
					(child, baseChild) => {
						assert(
							baseChild === undefined,
							0x5b6 /* This field should not have any base changes */,
						);

						crossFieldTable.nodeIdPairs.push([child, undefined, existenceState]);
						return child;
					},
					genId,
					manager,
					revisionMetadata,
					existenceState,
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
		over: TaggedChange<NodeChangeset | undefined>,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		fieldFilter: (baseChange: FieldChange, newChange: FieldChange | undefined) => boolean,
		revisionMetadata: RebaseRevisionMetadata,
		constraintState: ConstraintState,
		existenceState: NodeExistenceState = NodeExistenceState.Alive,
	): NodeChangeset | undefined {
		const key = change ?? over.change;
		if (key === undefined) {
			return undefined;
		}

		const baseMap: TaggedChange<FieldChangeMap> =
			over.change?.fieldChanges !== undefined
				? {
						...over,
						change: over.change.fieldChanges,
				  }
				: tagChange(new Map(), over.revision);

		const fieldChanges = this.rebaseFieldMap(
			change?.fieldChanges ?? new Map(),
			baseMap,
			genId,
			crossFieldTable,
			fieldFilter,
			revisionMetadata,
			constraintState,
			existenceState,
		);

		const rebasedChange: NodeChangeset = {};

		if (fieldChanges.size > 0) {
			rebasedChange.fieldChanges = fieldChanges;
		}

		if (change?.nodeExistsConstraint !== undefined) {
			rebasedChange.nodeExistsConstraint = change.nodeExistsConstraint;
		}

		// If there's a node exists constraint and we removed or revived the node, update constraint state
		if (rebasedChange.nodeExistsConstraint !== undefined) {
			const violatedAfter = existenceState === NodeExistenceState.Dead;

			if (rebasedChange.nodeExistsConstraint.violated !== violatedAfter) {
				rebasedChange.nodeExistsConstraint = {
					...rebasedChange.nodeExistsConstraint,
					violated: violatedAfter,
				};
				constraintState.violationCount += violatedAfter ? 1 : -1;
			}
		}

		crossFieldTable.rebasedNodeCache.set(key, rebasedChange);
		return rebasedChange;
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
		assert(changeset !== undefined, "Unknown node ID");

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

	public buildEditor(changeReceiver: (change: ModularChangeset) => void): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver);
	}
}

function composeBuildsDestroysAndRefreshers(changes: TaggedChange<ModularChangeset>[]) {
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
					// This can happen in compositions of commits that needed to include repair data refreshers (e.g., undos):
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
	{ change, revision }: TaggedChange<ModularChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	yield* relevantRemovedRootsFromFields(
		change.fieldChanges,
		revision,
		change.nodeChanges,
		fieldKinds,
	);
}

function* relevantRemovedRootsFromFields(
	change: FieldChangeMap,
	revision: RevisionTag | undefined,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	for (const [_, fieldChange] of change) {
		const fieldRevision = fieldChange.revision ?? revision;
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		const delegate = function* (node: NodeId): Iterable<DeltaDetachedNodeId> {
			const nodeChangeset = tryGetFromNestedMap(nodeChanges, node.revision, node.localId);
			assert(nodeChangeset !== undefined, "Unknown node ID");
			if (nodeChangeset.fieldChanges !== undefined) {
				yield* relevantRemovedRootsFromFields(
					nodeChangeset.fieldChanges,
					fieldRevision,
					nodeChanges,
					fieldKinds,
				);
			}
		};
		yield* handler.relevantRemovedRoots(tagChange(fieldChange.change, fieldRevision), delegate);
	}
}

/**
 * Adds any refreshers missing from the provided change that are relevant to the change and
 * removes any refreshers from the provided change that are not relevant to the change.
 * This function enforces that all relevant removed roots have a corresponding build or refresher.
 *
 * @param change - The change that possibly has missing or superfluous refreshers. Not mutated by this function.
 * @param getDetachedNode - The function to retrieve a tree chunk from the corresponding detached node id.
 * @param removedRoots - The set of removed roots that should be in memory for the given change to be applied.
 * Can be retrieved by calling {@link relevantRemovedRoots}.
 */
export function updateRefreshers(
	{ change, revision }: TaggedChange<ModularChangeset>,
	getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
	removedRoots: Iterable<DeltaDetachedNodeId>,
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
			const major = root.major === revision ? undefined : root.major;
			const lengthTree = chunkLengths.get(major);

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
		assert(node !== undefined, 0x8cd /* detached node should exist */);
		setInNestedMap(refreshers, root.major, root.minor, node);
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
	// Return an empty delta for changes with constraint violations
	if ((change.constraintViolationCount ?? 0) > 0) {
		return emptyDelta;
	}

	const revision = revisionFromTaggedChange(taggedChange);
	const idAllocator = MemoizedIdRangeAllocator.fromNextId();
	const rootDelta: Mutable<DeltaRoot> = {};
	const fieldDeltas = intoDeltaImpl(
		change.fieldChanges,
		revision,
		change.nodeChanges,
		idAllocator,
		fieldKinds,
	);
	if (fieldDeltas.size > 0) {
		rootDelta.fields = fieldDeltas;
	}
	if (change.builds && change.builds.size > 0) {
		rootDelta.build = copyDetachedNodes(change.builds, revision);
	}
	if (change.destroys !== undefined && change.destroys.size > 0) {
		const destroys: DeltaDetachedNodeDestruction[] = [];
		forEachInNestedMap(change.destroys, (count, major, minor) => {
			destroys.push({
				id: makeDetachedNodeId(major ?? revision, minor),
				count,
			});
		});
		rootDelta.destroy = destroys;
	}
	if (change.refreshers && change.refreshers.size > 0) {
		rootDelta.refreshers = copyDetachedNodes(change.refreshers, revision);
	}
	return rootDelta;
}

function copyDetachedNodes(detachedNodes: ChangeAtomIdMap<TreeChunk>, revision?: RevisionTag) {
	const copiedDetachedNodes: DeltaDetachedNodeBuild[] = [];
	forEachInNestedMap(detachedNodes, (chunk, major, minor) => {
		if (chunk.topLevelLength > 0) {
			const trees = mapCursorField(chunk.cursor(), (c) =>
				cursorForMapTreeNode(mapTreeFromCursor(c)),
			);
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major ?? revision, minor),
				trees,
			});
		}
	});
	return copiedDetachedNodes.length > 0 ? copiedDetachedNodes : undefined;
}

/**
 * @param change - The change to convert into a delta.
 * @param repairStore - The store to query for repair data.
 * @param path - The path of the node being altered by the change as defined by the input context.
 * Undefined for the root and for nodes that do not exist in the input context.
 */
function intoDeltaImpl(
	change: FieldChangeMap,
	revision: RevisionTag | undefined,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();
	for (const [field, fieldChange] of change) {
		const fieldRevision = fieldChange.revision ?? revision;
		const deltaField = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			tagChange(fieldChange.change, fieldRevision),
			(childChange): DeltaFieldMap => {
				const nodeChange = tryGetFromNestedMap(
					nodeChanges,
					childChange.revision,
					childChange.localId,
				);

				assert(nodeChange !== undefined, "Unknown node ID");
				return deltaFromNodeChange(
					tagChange(nodeChange, fieldRevision),
					nodeChanges,
					idAllocator,
					fieldKinds,
				);
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
	{ change, revision }: TaggedChange<NodeChangeset>,
	nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, revision, nodeChanges, idAllocator, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

/**
 * @internal
 * @param revInfos - This should describe all revisions in the rebase path, even if not part of the current base changeset.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `revInfos` must include
 * the changes [A⁻¹ X, Y, A'] for each rebase step of B.
 * @param baseRevisions - The set of revisions in the changeset being rebased over.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `baseRevisions` must include
 * revisions [A⁻¹ X, Y, A'] if rebasing over the composition of all those changes, or
 * revision [A⁻¹] for the first rebase, then [X], etc. if rebasing over edits individually.
 * @returns - RebaseRevisionMetadata to be passed to `FieldChangeRebaser.rebase`*
 */
export function rebaseRevisionMetadataFromInfo(
	revInfos: readonly RevisionInfo[],
	baseRevisions: (RevisionTag | undefined)[],
): RebaseRevisionMetadata {
	const filteredRevisions: RevisionTag[] = [];
	for (const revision of baseRevisions) {
		if (revision !== undefined) {
			filteredRevisions.push(revision);
		}
	}

	const getBaseRevisions = () => filteredRevisions;
	return {
		...revisionMetadataSourceFromInfo(revInfos),
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
	revision: RevisionTag | undefined;
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
	nodeIdPairs: [
		NodeId | undefined,
		TaggedChange<NodeId> | undefined,
		NodeExistenceState | undefined,
	][];
}

interface RebaseFieldContext {
	baseChange: FieldChange;
	baseRevision: RevisionTag | undefined;
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

	nodeIdPairs: [TaggedChange<NodeId> | undefined, TaggedChange<NodeId> | undefined][];
}

interface ComposeFieldContext {
	change1: TaggedChange<FieldChangeset>;
	change2: TaggedChange<FieldChangeset>;
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
	const getMap = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? crossFieldTable.srcTable : crossFieldTable.dstTable;

	const getDependents = (target: CrossFieldTarget) =>
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

	public submitChanges(changes: EditDescription[]) {
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
