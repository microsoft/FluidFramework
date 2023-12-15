/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	EditBuilder,
	ChangeRebaser,
	FieldKindIdentifier,
	FieldKey,
	UpPath,
	TaggedChange,
	RevisionTag,
	tagChange,
	makeAnonChange,
	ChangeFamilyEditor,
	FieldUpPath,
	ChangesetLocalId,
	isEmptyFieldChanges,
	RevisionMetadataSource,
	RevisionInfo,
	revisionMetadataSourceFromInfo,
	ChangeAtomIdMap,
	makeDetachedNodeId,
	ITreeCursor,
	emptyDelta,
	DeltaFieldMap,
	DeltaFieldChanges,
	DeltaDetachedNodeBuild,
	DeltaRoot,
	ITreeCursorSynchronous,
	DeltaDetachedNodeId,
} from "../../core";
import { RevisionTagCodec } from "../../shared-tree-core";
import {
	brand,
	forEachInNestedMap,
	getOrAddEmptyToMap,
	getOrAddInMap,
	IdAllocationState,
	IdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	isReadonlyArray,
	Mutable,
} from "../../util";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator";
import { TreeChunk, chunkTree, defaultChunkPolicy } from "../chunked-forest";
import {
	CrossFieldManager,
	CrossFieldMap,
	CrossFieldQuerySet,
	CrossFieldTarget,
	addCrossFieldQuery,
	getFirstFromCrossFieldMap,
	setInCrossFieldMap,
} from "./crossFieldQueries";
import {
	FieldChangeHandler,
	NodeExistenceState,
	RebaseRevisionMetadata,
} from "./fieldChangeHandler";
import { FieldKind, FieldKindWithEditor, withEditor } from "./fieldKind";
import { convertGenericChange, genericFieldKind, newGenericChangeset } from "./genericFieldKind";
import { GenericChangeset } from "./genericFieldKindTypes";
import { makeModularChangeCodecFamily } from "./modularChangeCodecs";
import {
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
	NodeExistsConstraint,
} from "./modularChangeTypes";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 */
export class ModularChangeFamily
	implements ChangeFamily<ModularEditBuilder, ModularChangeset>, ChangeRebaser<ModularChangeset>
{
	public static readonly emptyChange: ModularChangeset = makeModularChangeset();

	public readonly codecs: ICodecFamily<ModularChangeset>;

	public constructor(
		public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		codecOptions: ICodecOptions,
	) {
		this.codecs = makeModularChangeCodecFamily(
			this.fieldKinds,
			new RevisionTagCodec(),
			codecOptions,
		);
	}

	public get rebaser(): ChangeRebaser<ModularChangeset> {
		return this;
	}

	/**
	 * Produces an equivalent list of `FieldChangeset`s that all target the same {@link FieldKind}.
	 * @param changes - The list of `FieldChange`s whose `FieldChangeset`s needs to be normalized.
	 * @returns An object that contains both the equivalent list of `FieldChangeset`s that all
	 * target the same {@link FieldKind}, and the `FieldKind` that they target.
	 * The returned `FieldChangeset`s may be a shallow copy of the input `FieldChange`s.
	 */
	private normalizeFieldChanges(
		changes: readonly FieldChange[],
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): {
		fieldKind: FieldKindWithEditor;
		changesets: FieldChangeset[];
	} {
		// TODO: Handle the case where changes have conflicting field kinds
		const nonGenericChange = changes.find(
			(change) => change.fieldKind !== genericFieldKind.identifier,
		);
		if (nonGenericChange === undefined) {
			// All the changes are generic
			return { fieldKind: genericFieldKind, changesets: changes.map((c) => c.change) };
		}
		const kind = nonGenericChange.fieldKind;
		const fieldKind = getFieldKind(this.fieldKinds, kind);
		const handler = fieldKind.changeHandler;
		const normalizedChanges = changes.map((change) => {
			if (change.fieldKind === genericFieldKind.identifier) {
				// The cast is based on the `fieldKind` check above
				const genericChange = change.change as unknown as GenericChangeset;
				return convertGenericChange(
					genericChange,
					handler,
					(children) =>
						this.composeNodeChanges(
							children,
							genId,
							newCrossFieldTable(),
							revisionMetadata,
						),
					genId,
					revisionMetadata,
				) as FieldChangeset;
			}
			return change.change;
		});
		return { fieldKind, changesets: normalizedChanges };
	}

	public compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		const { revInfos, maxId } = getRevInfoFromTaggedChanges(changes);
		if (changes.length === 1) {
			const { fieldChanges, builds, constraintViolationCount } = changes[0].change;
			return makeModularChangeset(
				fieldChanges,
				maxId,
				revInfos,
				constraintViolationCount,
				builds,
			);
		}
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);
		const idState: IdAllocationState = { maxId };
		const genId: IdAllocator = idAllocatorFromState(idState);
		const crossFieldTable = newCrossFieldTable<ComposeData>();

		const changesWithoutConstraintViolations = changes.filter(
			(change) => (change.change.constraintViolationCount ?? 0) === 0,
		);

		const composedFields = this.composeFieldMaps(
			changesWithoutConstraintViolations.map((change) =>
				tagChange(change.change.fieldChanges, revisionFromTaggedChange(change)),
			),
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			for (const field of fieldsToUpdate) {
				const amendedChange = getChangeHandler(
					this.fieldKinds,
					field.fieldKind,
				).rebaser.amendCompose(
					field.change,
					(children) =>
						this.composeNodeChanges(children, genId, crossFieldTable, revisionMetadata),
					genId,
					newCrossFieldManager(crossFieldTable),
					revisionMetadata,
				);
				field.change = brand(amendedChange);
			}
		}

		assert(
			crossFieldTable.invalidatedFields.size === 0,
			0x59b /* Should not need more than one amend pass. */,
		);
		const allBuilds: ChangeAtomIdMap<TreeChunk> = new Map();
		for (const taggedChange of changes) {
			const revision = revisionFromTaggedChange(taggedChange);
			const change = taggedChange.change;
			if (change.builds) {
				for (const [revisionKey, innerMap] of change.builds) {
					const setRevisionKey = revisionKey ?? revision;
					const innerDstMap = getOrAddInMap(allBuilds, setRevisionKey, new Map());
					for (const [id, tree] of innerMap) {
						// Check for duplicate builds and prefer earlier ones.
						// There are two scenarios where we might get duplicate builds:
						// - In compositions of rebase sandwiches:
						// In that case, the trees are identical and it doesn't matter which one we pick.
						// - In compositions of commits that needed to include repair data refreshers (e.g., undos):
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
							innerDstMap.set(id, tree);
						}
					}
				}
			}
		}
		return makeModularChangeset(
			this.pruneFieldMap(composedFields),
			idState.maxId,
			revInfos,
			undefined,
			allBuilds,
		);
	}

	private composeFieldMaps(
		changes: TaggedChange<FieldChangeMap>[],
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<ComposeData>,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const fieldChanges = new Map<FieldKey, FieldChange[]>();
		for (const change of changes) {
			for (const [key, fieldChange] of change.change) {
				const fieldChangeToCompose =
					fieldChange.revision !== undefined || change.revision === undefined
						? fieldChange
						: {
								...fieldChange,
								revision: change.revision,
						  };

				getOrAddEmptyToMap(fieldChanges, key).push(fieldChangeToCompose);
			}
		}

		const composedFields: FieldChangeMap = new Map();
		for (const [field, changesForField] of fieldChanges) {
			const { fieldKind, changesets } = this.normalizeFieldChanges(
				changesForField,
				genId,
				revisionMetadata,
			);
			assert(
				changesets.length === changesForField.length,
				0x4a8 /* Number of changes should be constant when normalizing */,
			);

			const manager = newCrossFieldManager(crossFieldTable);
			const taggedChangesets = changesets.map((change, i) =>
				tagChange(change, changesForField[i].revision),
			);
			const composedChange = fieldKind.changeHandler.rebaser.compose(
				taggedChangesets,
				(children) =>
					this.composeNodeChanges(children, genId, crossFieldTable, revisionMetadata),
				genId,
				manager,
				revisionMetadata,
			);

			const composedField: FieldChange = {
				fieldKind: fieldKind.identifier,
				change: brand(composedChange),
			};

			addFieldData(manager, composedField);

			// TODO: Could optimize by checking that composedField is non-empty
			composedFields.set(field, composedField);
		}
		return composedFields;
	}

	private composeNodeChanges(
		changes: TaggedChange<NodeChangeset>[],
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<ComposeData>,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const fieldChanges: TaggedChange<FieldChangeMap>[] = [];
		let nodeExistsConstraint: NodeExistsConstraint | undefined;
		for (const change of changes) {
			// Composition is part of two codepaths:
			//   1. Combining multiple changesets into a transaction
			//   2. Generating a state update after rebasing a branch that has
			//        more than one changeset
			// In the first codepath, none of the constraints will be violated and
			// we need the constraint to be stored on the given node in the transaction.
			// In the second path, the constraint may have been violated, but the state is tracked
			// as part of `constraintViolationCount` and the change won't be rebased further.
			if (change.change.nodeExistsConstraint !== undefined) {
				nodeExistsConstraint = { ...change.change.nodeExistsConstraint };
			}

			if (change.change.fieldChanges !== undefined) {
				fieldChanges.push(tagChange(change.change.fieldChanges, change.revision));
			}
		}

		const composedFieldChanges = this.composeFieldMaps(
			fieldChanges,
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
			genId,
			crossFieldTable,
			revisionMetadata,
		);

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
					(nodeChangeset) => nodeChangeset,
					genId,
					newCrossFieldManager(crossFieldTable),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}

			// TODO: See if we there's a reasonable way to assert that
			// running a third pass would produce the same results.
		}

		const revInfo = change.change.revisions;
		return makeModularChangeset(
			invertedFields,
			idState.maxId,
			revInfo === undefined
				? undefined
				: (isRollback
						? revInfo.map(({ revision }) => ({ revision, rollbackOf: revision }))
						: Array.from(revInfo)
				  ).reverse(),
			change.change.constraintViolationCount,
		);
	}

	private invertFieldMap(
		changes: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes.change) {
			const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

			const manager = newCrossFieldManager(crossFieldTable);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(
				{ revision, change: fieldChange.change },
				(childChanges) =>
					this.invertNodeChange(
						{ revision, change: childChanges },
						genId,
						crossFieldTable,
						revisionMetadata,
					),
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

			addFieldData(manager, fieldChange);
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: TaggedChange<NodeChangeset>,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				{ ...change, change: change.change.fieldChanges },
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
			rebasedFieldToContext: new Map(),
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

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			constraintState = newConstraintState(change.constraintViolationCount ?? 0);
			for (const field of fieldsToUpdate) {
				// TODO: Should we copy the context table out before this loop?
				const context = crossFieldTable.rebasedFieldToContext.get(field);
				assert(context !== undefined, 0x852 /* Every field should have a context */);
				const {
					fieldKind,
					changesets: [fieldChangeset, baseChangeset],
				} = this.normalizeFieldChanges(
					[context.newChange, context.baseChange],
					genId,
					revisionMetadata,
				);

				field.change = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					tagChange(baseChangeset, context.baseRevision),
					(node) => node,
					genId,
					newCrossFieldManager(crossFieldTable),
					rebaseMetadata,
				);
			}
		}

		return makeModularChangeset(
			this.pruneFieldMap(rebasedFields),
			idState.maxId,
			change.revisions,
			constraintState.violationCount,
			change.builds,
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
				changesets: [fieldChangeset, baseChangeset],
			} = this.normalizeFieldChanges([fieldChange, baseChanges], genId, revisionMetadata);

			const { revision } = over;
			const taggedBaseChange = { revision, change: baseChangeset };
			const manager = newCrossFieldManager(crossFieldTable);

			const rebaseChild = (
				child: NodeChangeset | undefined,
				baseChild: NodeChangeset | undefined,
				stateChange: NodeExistenceState | undefined,
			) =>
				this.rebaseNodeChange(
					child,
					{ revision, change: baseChild },
					genId,
					crossFieldTable,
					fieldFilter,
					revisionMetadata,
					constraintState,
					stateChange,
				);

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

			addFieldData(manager, rebasedFieldChange);
			crossFieldTable.rebasedFieldToContext.set(rebasedFieldChange, {
				baseChange: baseChanges,
				baseRevision: revision,
				newChange: fieldChange,
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
					changesets: [fieldChangeset, baseChangeset],
				} = this.normalizeFieldChanges([fieldChange, baseChanges], genId, revisionMetadata);

				const manager = newCrossFieldManager(crossFieldTable);
				const rebasedChangeset = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					tagChange(baseChangeset, over.revision),
					(child, baseChild) => {
						assert(
							baseChild === undefined,
							0x5b6 /* This field should not have any base changes */,
						);
						return this.rebaseNodeChange(
							child,
							tagChange(undefined, over.revision),
							genId,
							crossFieldTable,
							fieldFilter,
							revisionMetadata,
							constraintState,
							existenceState,
						);
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
				addFieldData(manager, rebasedFieldChange);
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
		if (change === undefined && over.change?.fieldChanges === undefined) {
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

		// If there's a node exists constraint and we deleted or revived the node, update constraint state
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

		return rebasedChange;
	}

	private pruneFieldMap(changeset: FieldChangeMap): FieldChangeMap | undefined {
		const prunedChangeset: FieldChangeMap = new Map();
		for (const [field, fieldChange] of changeset) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);

			const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (node) =>
				this.pruneNodeChange(node),
			);

			if (!handler.isEmpty(prunedFieldChangeset)) {
				prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
			}
		}

		return prunedChangeset.size > 0 ? prunedChangeset : undefined;
	}

	private pruneNodeChange(changeset: NodeChangeset): NodeChangeset | undefined {
		const prunedFields =
			changeset.fieldChanges !== undefined
				? this.pruneFieldMap(changeset.fieldChanges)
				: undefined;

		const prunedChange = { ...changeset, fieldChanges: prunedFields };
		if (prunedChange.fieldChanges === undefined) {
			delete prunedChange.fieldChanges;
		}

		return isEmptyNodeChangeset(prunedChange) ? undefined : prunedChange;
	}

	public buildEditor(changeReceiver: (change: ModularChangeset) => void): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver);
	}
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
	yield* relevantRemovedRootsFromFields(change.fieldChanges, revision, fieldKinds);
}

function* relevantRemovedRootsFromFields(
	change: FieldChangeMap,
	revision: RevisionTag | undefined,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	for (const [_, fieldChange] of change) {
		const fieldRevision = fieldChange.revision ?? revision;
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		const delegate = function* (node: NodeChangeset): Iterable<DeltaDetachedNodeId> {
			if (node.fieldChanges !== undefined) {
				yield* relevantRemovedRootsFromFields(node.fieldChanges, fieldRevision, fieldKinds);
			}
		};
		yield* handler.relevantRemovedRoots(tagChange(fieldChange.change, fieldRevision), delegate);
	}
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
	const fieldDeltas = intoDeltaImpl(change.fieldChanges, revision, idAllocator, fieldKinds);
	if (fieldDeltas.size > 0) {
		rootDelta.fields = fieldDeltas;
	}
	if (change.builds && change.builds.size > 0) {
		const builds: DeltaDetachedNodeBuild[] = [];
		forEachInNestedMap(change.builds, (tree, major, minor) => {
			const cursor = tree.cursor();
			assert(
				cursor.getFieldLength() === 1,
				0x853 /* each encoded chunk should only contain 1 node. */,
			);
			cursor.enterNode(0);
			builds.push({
				id: makeDetachedNodeId(major ?? revision, minor),
				trees: [cursor],
			});
		});
		rootDelta.build = builds;
	}
	return rootDelta;
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
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();
	for (const [field, fieldChange] of change) {
		const fieldRevision = fieldChange.revision ?? revision;
		const deltaField = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			tagChange(fieldChange.change, fieldRevision),
			(childChange): DeltaFieldMap =>
				deltaFromNodeChange(tagChange(childChange, fieldRevision), idAllocator, fieldKinds),
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
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, revision, idAllocator, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

/**
 * @alpha
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
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
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
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

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
	rebasedFieldToContext: Map<FieldChange, FieldChangeContext>;
}

interface FieldChangeContext {
	baseChange: FieldChange;
	newChange: FieldChange;
	baseRevision: RevisionTag | undefined;
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
 * @alpha
 */
interface ConstraintState {
	violationCount: number;
}

function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
}

type ComposeData = FieldChange;

interface CrossFieldManagerI<T> extends CrossFieldManager {
	table: CrossFieldTable<T>;
	srcQueries: CrossFieldQuerySet;
	dstQueries: CrossFieldQuerySet;
	fieldInvalidated: boolean;
}

function newCrossFieldManager<T>(crossFieldTable: CrossFieldTable<T>): CrossFieldManagerI<T> {
	const srcQueries: CrossFieldQuerySet = new Map();
	const dstQueries: CrossFieldQuerySet = new Map();
	const getMap = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? crossFieldTable.srcTable : crossFieldTable.dstTable;

	const getQueries = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? srcQueries : dstQueries;

	const manager = {
		table: crossFieldTable,
		srcQueries,
		dstQueries,
		fieldInvalidated: false,
		set: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
			count: number,
			newValue: unknown,
			invalidateDependents: boolean,
		) => {
			if (invalidateDependents) {
				const dependentsMap =
					target === CrossFieldTarget.Source
						? crossFieldTable.srcDependents
						: crossFieldTable.dstDependents;

				const lastChangedId = (id as number) + count - 1;
				let firstId = id;
				while (firstId <= lastChangedId) {
					const dependentEntry = getFirstFromCrossFieldMap(
						dependentsMap,
						revision,
						firstId,
						lastChangedId - firstId + 1,
					);
					if (dependentEntry.value !== undefined) {
						crossFieldTable.invalidatedFields.add(dependentEntry.value);
					}

					firstId = brand(firstId + dependentEntry.length);
				}

				if (
					getFirstFromCrossFieldMap(getQueries(target), revision, id, count) !== undefined
				) {
					manager.fieldInvalidated = true;
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
				addCrossFieldQuery(getQueries(target), revision, id, count);
			}
			return getFirstFromCrossFieldMap(getMap(target), revision, id, count);
		},
	};

	return manager;
}

function addFieldData<T>(manager: CrossFieldManagerI<T>, fieldData: T) {
	for (const [revision, rangeMap] of manager.srcQueries) {
		for (const range of rangeMap) {
			// We assume that if there is already an entry for this ID it is because
			// a field handler has called compose on the same node multiple times.
			// In this case we only want to amend the latest version, so we overwrite the dependency.
			setInCrossFieldMap(
				manager.table.srcDependents,
				revision,
				brand(range.start),
				range.length,
				fieldData,
			);
		}
	}

	for (const [revision, rangeMap] of manager.dstQueries) {
		for (const range of rangeMap) {
			// See above comment
			setInCrossFieldMap(
				manager.table.dstDependents,
				revision,
				brand(range.start),
				range.length,
				fieldData,
			);
		}
	}

	if (manager.fieldInvalidated) {
		manager.table.invalidatedFields.add(fieldData);
	}
}

function makeModularChangeset(
	changes: FieldChangeMap | undefined = undefined,
	maxId: number = -1,
	revisions: readonly RevisionInfo[] | undefined = undefined,
	constraintViolationCount: number | undefined = undefined,
	builds?: ChangeAtomIdMap<TreeChunk>,
): ModularChangeset {
	const changeset: Mutable<ModularChangeset> = { fieldChanges: changes ?? new Map() };
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

	public apply(change: ModularChangeset): void {
		this.applyChange(change);
	}

	public buildTrees(
		firstId: ChangesetLocalId,
		newContent: ITreeCursor | readonly ITreeCursor[],
	): GlobalEditDescription {
		const content = isReadonlyArray(newContent) ? newContent : [newContent];
		const length = content.length;
		if (length === 0) {
			return { type: "global" };
		}
		const builds: ChangeAtomIdMap<TreeChunk> = new Map();
		const innerMap = new Map();
		builds.set(undefined, innerMap);
		let id = firstId;

		// TODO:YA6307 adopt more efficient representation, likely based on contiguous runs of IDs
		for (const cursor of content) {
			assert(!innerMap.has(id), 0x854 /* Unexpected duplicate build ID */);
			innerMap.set(id, chunkTree(cursor as ITreeCursorSynchronous, defaultChunkPolicy));
			id = brand((id as number) + 1);
		}
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
		maxId: ChangesetLocalId = brand(-1),
	): void {
		const changeMap = this.buildChangeMap(field, fieldKind, change);
		this.applyChange(makeModularChangeset(changeMap, maxId));
	}

	public submitChanges(changes: EditDescription[], maxId: ChangesetLocalId = brand(-1)) {
		const changeMaps = changes.map((change) =>
			makeAnonChange(
				change.type === "global"
					? makeModularChangeset(
							undefined,
							undefined,
							undefined,
							undefined,
							change.builds,
					  )
					: makeModularChangeset(
							this.buildChangeMap(change.field, change.fieldKind, change.change),
					  ),
			),
		);
		const composedChange = this.changeFamily.rebaser.compose(changeMaps);
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		this.applyChange(composedChange);
	}

	public generateId(count?: number): ChangesetLocalId {
		return brand(this.idAllocator.allocate(count));
	}

	private buildChangeMap(
		field: FieldUpPath,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
	): FieldChangeMap {
		let fieldChangeMap: FieldChangeMap = new Map([[field.field, { fieldKind, change }]]);

		let remainingPath = field.parent;
		while (remainingPath !== undefined) {
			const nodeChange: NodeChangeset = { fieldChanges: fieldChangeMap };
			const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
				remainingPath.parentIndex,
				nodeChange,
			);
			fieldChangeMap = new Map([
				[
					remainingPath.parentField,
					{ fieldKind: genericFieldKind.identifier, change: brand(fieldChange) },
				],
			]);
			remainingPath = remainingPath.parent;
		}

		return fieldChangeMap;
	}

	public addNodeExistsConstraint(path: UpPath): void {
		const nodeChange: NodeChangeset = {
			nodeExistsConstraint: { violated: false },
		};
		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
			path.parentIndex,
			nodeChange,
		);
		this.submitChange(
			{ parent: path.parent, field: path.parentField },
			genericFieldKind.identifier,
			brand(fieldChange),
		);
	}
}

/**
 * @alpha
 */
export interface FieldEditDescription {
	type: "field";
	field: FieldUpPath;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

/**
 * @alpha
 */
export interface GlobalEditDescription {
	type: "global";
	builds?: ChangeAtomIdMap<TreeChunk>;
}

/**
 * @alpha
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
