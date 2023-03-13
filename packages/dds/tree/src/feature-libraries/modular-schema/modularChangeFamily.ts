/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ChangeEncoder,
	ChangeFamily,
	ProgressiveEditBuilder,
	ProgressiveEditBuilderBase,
	ChangeRebaser,
	FieldKindIdentifier,
	AnchorSet,
	Delta,
	FieldKey,
	UpPath,
	Value,
	TaggedChange,
	ReadonlyRepairDataStore,
	RevisionTag,
	tagChange,
	makeAnonChange,
	ChangeFamilyEditor,
} from "../../core";
import {
	addToNestedSet,
	brand,
	getOrAddEmptyToMap,
	getOrAddInNestedMap,
	JsonCompatibleReadOnly,
	Mutable,
	NestedMap,
	nestedSetContains,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util";
import { dummyRepairDataStore } from "../fakeRepairDataStore";
import {
	ChangesetLocalId,
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	idAllocatorFromMaxId,
} from "./crossFieldQueries";
import {
	FieldChangeHandler,
	FieldChangeMap,
	FieldChange,
	FieldChangeset,
	NodeChangeset,
	ValueChange,
	ModularChangeset,
	IdAllocator,
	RevisionInfo,
	RevisionMetadataSource,
} from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { convertGenericChange, GenericChangeset, genericFieldKind } from "./genericFieldKind";
import { decodeJsonFormat0, encodeForJsonFormat0 } from "./modularChangeEncoding";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 *
 * @sealed
 * @alpha
 */
export class ModularChangeFamily
	implements ChangeFamily<ModularEditBuilder, ModularChangeset>, ChangeRebaser<ModularChangeset>
{
	public readonly encoder: ChangeEncoder<ModularChangeset>;

	public constructor(public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		this.encoder = new ModularChangeEncoder(this.fieldKinds);
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
		fieldKind: FieldKind;
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
		let maxId = -1;
		const revInfos: RevisionInfo[] = [];
		for (const taggedChange of changes) {
			const change = taggedChange.change;
			maxId = Math.max(change.maxId ?? -1, maxId);
			if (change.revisions !== undefined) {
				revInfos.push(...change.revisions);
			} else if (taggedChange.revision !== undefined) {
				const info: Mutable<RevisionInfo> = { tag: taggedChange.revision };
				if (taggedChange.isRollback === true) {
					info.isRollback = true;
				}
				revInfos.push(info);
			}
		}
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<ComposeData>();

		const changesWithoutConstraintViolations = changes.filter(
			(change) => (change.change.constraintViolationCount ?? 0) === 0,
		);

		const composedFields = this.composeFieldMaps(
			changesWithoutConstraintViolations.map((change) =>
				tagChange(change.change.changes, change.revision),
			),
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		if (crossFieldTable.fieldsToUpdate.size > 0) {
			const fieldsToUpdate = crossFieldTable.fieldsToUpdate;
			crossFieldTable.fieldsToUpdate = new Set();
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
			crossFieldTable.fieldsToUpdate.size === 0,
			0x59b /* Should not need more than one amend pass. */,
		);
		return makeModularChangeset(composedFields, maxId, revInfos);
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
			let composedField: FieldChange;
			if (changesForField.length === 1) {
				composedField = changesForField[0];
			} else {
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

				composedField = {
					fieldKind: fieldKind.identifier,
					change: brand(composedChange),
				};

				addFieldData(manager, composedField);
			}

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
		let valueChange: ValueChange | undefined;
		let valueConstraint: Value | undefined;
		for (const change of changes) {
			// Use the first defined value constraint before any value changes.
			// Any value constraints defined after a value change can never be violated so they are ignored in the composition.
			if (
				change.change.valueConstraint !== undefined &&
				valueConstraint === undefined &&
				valueChange === undefined
			) {
				valueConstraint = { ...change.change.valueConstraint };
			}
			if (change.change.valueChange !== undefined) {
				valueChange = { ...change.change.valueChange };
				valueChange.revision ??= change.revision;
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
		if (valueChange !== undefined) {
			composedNodeChange.valueChange = valueChange;
		}

		if (composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		if (valueConstraint !== undefined) {
			composedNodeChange.valueConstraint = valueConstraint;
		}

		return composedNodeChange;
	}

	/**
	 * @param change - The change to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * performing a sandwich rebase.
	 * @param repairStore - The store to query for repair data.
	 */
	public invert(
		change: TaggedChange<ModularChangeset>,
		isRollback: boolean,
		repairStore?: ReadonlyRepairDataStore,
	): ModularChangeset {
		let maxId = change.change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<InvertData>();
		const resolvedRepairStore = repairStore ?? dummyRepairDataStore;

		const invertedFields = this.invertFieldMap(
			tagChange(change.change.changes, change.revision),
			genId,
			resolvedRepairStore,
			undefined,
			crossFieldTable,
		);

		if (crossFieldTable.fieldsToUpdate.size > 0) {
			const fieldsToUpdate = crossFieldTable.fieldsToUpdate;
			crossFieldTable.fieldsToUpdate = new Set();
			for (const { fieldKey, fieldChange, path, originalRevision } of fieldsToUpdate) {
				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.amendInvert(
					fieldChange.change,
					originalRevision,
					(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] =>
						resolvedRepairStore.getNodes(revision, path, fieldKey, index, count),
					genId,
					newCrossFieldManager(crossFieldTable),
				);
				fieldChange.change = brand(amendedChange);
			}
		}

		assert(
			crossFieldTable.fieldsToUpdate.size === 0,
			0x59c /* Should not need more than one amend pass. */,
		);

		const revInfo = change.change.revisions;
		return makeModularChangeset(
			invertedFields,
			maxId,
			revInfo === undefined
				? undefined
				: (isRollback
						? revInfo.map(({ tag }) => ({ tag, isRollback: true }))
						: Array.from(revInfo)
				  ).reverse(),
			change.change.constraintViolationCount,
		);
	}

	private invertFieldMap(
		changes: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		repairStore: ReadonlyRepairDataStore,
		path: UpPath | undefined,
		crossFieldTable: CrossFieldTable<InvertData>,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes.change) {
			const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

			const reviver = (
				revisionTag: RevisionTag,
				index: number,
				count: number,
			): Delta.ProtoNode[] => repairStore.getNodes(revisionTag, path, field, index, count);

			const manager = newCrossFieldManager(crossFieldTable);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(
				{ revision, change: fieldChange.change },
				(childChanges, index) =>
					this.invertNodeChange(
						{ revision, change: childChanges },
						genId,
						crossFieldTable,
						repairStore,
						index === undefined
							? undefined
							: {
									parent: path,
									parentField: field,
									parentIndex: index,
							  },
					),
				reviver,
				genId,
				manager,
			);

			const invertedFieldChange: FieldChange = {
				...fieldChange,
				change: brand(invertedChange),
			};
			invertedFields.set(field, invertedFieldChange);

			const invertData: InvertData = {
				fieldKey: field,
				fieldChange: invertedFieldChange,
				path,
				originalRevision: changes.revision,
			};

			addFieldData(manager, invertData);
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: TaggedChange<NodeChangeset>,
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<InvertData>,
		repairStore: ReadonlyRepairDataStore,
		path?: UpPath,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.change.valueChange !== undefined) {
			assert(
				!("revert" in change.change.valueChange),
				0x4a9 /* Inverting inverse changes is currently not supported */,
			);
			assert(
				path !== undefined,
				0x59d /* Only existing nodes can have their value restored */,
			);
			const revision = change.change.valueChange.revision ?? change.revision;
			assert(revision !== undefined, 0x59e /* Unable to revert to undefined revision */);
			inverse.valueChange = { value: repairStore.getValue(revision, path) };
		}

		if (change.change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				{ ...change, change: change.change.fieldChanges },
				genId,
				repairStore,
				path,
				crossFieldTable,
			);
		}

		return inverse;
	}

	public rebase(
		change: ModularChangeset,
		over: TaggedChange<ModularChangeset>,
	): ModularChangeset {
		let maxId = change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<RebaseData>();
		const constraintState = newConstraintState(change.constraintViolationCount ?? 0);
		const revInfos: RevisionInfo[] = [];
		if (over.change.revisions !== undefined) {
			revInfos.push(...over.change.revisions);
		}
		if (change.revisions !== undefined) {
			revInfos.push(...change.revisions);
		}
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);
		const rebasedFields = this.rebaseFieldMap(
			change.changes,
			tagChange(over.change.changes, over.revision),
			genId,
			crossFieldTable,
			revisionMetadata,
			constraintState,
		);

		if (crossFieldTable.fieldsToUpdate.size > 0) {
			const fieldsToUpdate = crossFieldTable.fieldsToUpdate;
			crossFieldTable.fieldsToUpdate = new Set();
			for (const { fieldChange, baseChange } of fieldsToUpdate) {
				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.amendRebase(
					fieldChange.change,
					baseChange,
					genId,
					newCrossFieldManager(crossFieldTable),
					revisionMetadata,
				);
				fieldChange.change = brand(amendedChange);
			}
		}

		assert(
			crossFieldTable.fieldsToUpdate.size === 0,
			0x59f /* Should not need more than one amend pass. */,
		);

		return makeModularChangeset(
			rebasedFields,
			maxId,
			change.revisions,
			constraintState.violationCount,
		);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<RebaseData>,
		revisionMetadata: RevisionMetadataSource,
		constraintState: ConstraintState,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of change) {
			const baseChanges = over.change.get(field);
			if (baseChanges === undefined) {
				rebasedFields.set(field, fieldChange);
			} else {
				const {
					fieldKind,
					changesets: [fieldChangeset, baseChangeset],
				} = this.normalizeFieldChanges([fieldChange, baseChanges], genId, revisionMetadata);

				const { revision } = fieldChange.revision !== undefined ? fieldChange : over;
				const taggedBaseChange = { revision, change: baseChangeset };
				const manager = newCrossFieldManager(crossFieldTable);
				const rebasedField = fieldKind.changeHandler.rebaser.rebase(
					fieldChangeset,
					taggedBaseChange,
					(child, baseChild) =>
						this.rebaseNodeChange(
							child,
							{ revision, change: baseChild },
							genId,
							crossFieldTable,
							revisionMetadata,
							constraintState,
						),
					genId,
					manager,
					revisionMetadata,
				);

				const rebasedFieldChange: FieldChange = {
					fieldKind: fieldKind.identifier,
					change: brand(rebasedField),
				};

				const rebaseData: RebaseData = {
					fieldChange: rebasedFieldChange,
					baseChange: taggedBaseChange,
				};

				addFieldData(manager, rebaseData);
				rebasedFields.set(field, rebasedFieldChange);
			}
		}

		return rebasedFields;
	}

	private rebaseNodeChange(
		change: NodeChangeset,
		over: TaggedChange<NodeChangeset>,
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<RebaseData>,
		revisionMetadata: RevisionMetadataSource,
		constraintState: ConstraintState,
	): NodeChangeset {
		const fieldChanges =
			change.fieldChanges === undefined || over.change.fieldChanges === undefined
				? change.fieldChanges
				: this.rebaseFieldMap(
						change.fieldChanges,
						{
							...over,
							change: over.change.fieldChanges,
						},
						genId,
						crossFieldTable,
						revisionMetadata,
						constraintState,
				  );

		const changeSet: NodeChangeset = {
			...change,
			fieldChanges,
		};

		// We only care if a violated constraint is fixed or if a non-violated
		// constraint becomes violated
		if (changeSet.valueConstraint !== undefined && over.change.valueChange !== undefined) {
			const violatedByOver =
				over.change.valueChange.value !== changeSet.valueConstraint.value;

			if (changeSet.valueConstraint.violated !== violatedByOver) {
				changeSet.valueConstraint = {
					...changeSet.valueConstraint,
					violated: violatedByOver,
				};
				constraintState.violationCount += violatedByOver ? 1 : -1;
			}
		}

		return changeSet;
	}

	public rebaseAnchors(anchors: AnchorSet, over: ModularChangeset): void {
		anchors.applyDelta(this.intoDelta(over));
	}

	public intoDelta(change: ModularChangeset): Delta.Root {
		return this.intoDeltaImpl(change.changes);
	}

	/**
	 * @param change - The change to convert into a delta.
	 * @param repairStore - The store to query for repair data.
	 * @param path - The path of the node being altered by the change as defined by the input context.
	 * Undefined for the root and for nodes that do not exist in the input context.
	 */
	private intoDeltaImpl(change: FieldChangeMap): Delta.Root {
		const delta: Map<FieldKey, Delta.MarkList> = new Map();
		for (const [field, fieldChange] of change) {
			const deltaField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).intoDelta(
				fieldChange.change,
				(childChange): Delta.Modify => this.deltaFromNodeChange(childChange),
			);
			delta.set(field, deltaField);
		}
		return delta;
	}

	private deltaFromNodeChange(change: NodeChangeset): Delta.Modify {
		const modify: Mutable<Delta.Modify> = {
			type: Delta.MarkType.Modify,
		};

		const valueChange = change.valueChange;
		if (valueChange !== undefined) {
			modify.setValue = valueChange.value;
		}

		if (change.fieldChanges !== undefined) {
			modify.fields = this.intoDeltaImpl(change.fieldChanges);
		}

		return modify;
	}

	public buildEditor(
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver, anchors);
	}
}

function revisionMetadataSourceFromInfo(revInfos: readonly RevisionInfo[]): RevisionMetadataSource {
	const getIndex = (tag: RevisionTag): number => {
		const index = revInfos.findIndex((revInfo) => revInfo.tag === tag);
		assert(index !== -1, 0x5a0 /* Unable to index unknown revision */);
		return index;
	};
	const getInfo = (tag: RevisionTag): RevisionInfo => {
		return revInfos[getIndex(tag)];
	};
	return { getIndex, getInfo };
}

export function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): FieldKind {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return fieldKind;
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

interface CrossFieldTable<TFieldData> {
	srcTable: NestedMap<RevisionTag | undefined, ChangesetLocalId, unknown>;
	dstTable: NestedMap<RevisionTag | undefined, ChangesetLocalId, unknown>;
	srcDependents: NestedMap<RevisionTag | undefined, ChangesetLocalId, TFieldData>;
	dstDependents: NestedMap<RevisionTag | undefined, ChangesetLocalId, TFieldData>;
	fieldsToUpdate: Set<TFieldData>;
}

function newCrossFieldTable<T>(): CrossFieldTable<T> {
	return {
		srcTable: new Map(),
		dstTable: new Map(),
		srcDependents: new Map(),
		dstDependents: new Map(),
		fieldsToUpdate: new Set(),
	};
}

interface ConstraintState {
	violationCount: number;
}

function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
}

interface InvertData {
	originalRevision: RevisionTag | undefined;
	fieldKey: FieldKey;
	fieldChange: FieldChange;
	path: UpPath | undefined;
}

type ComposeData = FieldChange;

interface RebaseData {
	fieldChange: FieldChange;
	baseChange: TaggedChange<FieldChangeset>;
}

interface CrossFieldManagerI<T> extends CrossFieldManager {
	table: CrossFieldTable<T>;
	srcQueries: CrossFieldQuerySet;
	dstQueries: CrossFieldQuerySet;
	fieldInvalidated: boolean;
}

function newCrossFieldManager<T>(crossFieldTable: CrossFieldTable<T>): CrossFieldManagerI<T> {
	const srcQueries = new Map();
	const dstQueries = new Map();
	const getMap = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? crossFieldTable.srcTable : crossFieldTable.dstTable;

	const getQueries = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? srcQueries : dstQueries;

	const manager = {
		table: crossFieldTable,
		srcQueries,
		dstQueries,
		fieldInvalidated: false,
		getOrCreate: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
			newValue: unknown,
			invalidateDependents: boolean,
		) => {
			if (invalidateDependents) {
				const dependents =
					target === CrossFieldTarget.Source
						? crossFieldTable.srcDependents
						: crossFieldTable.dstDependents;
				const dependent = tryGetFromNestedMap(dependents, revision, id);
				if (dependent !== undefined) {
					crossFieldTable.fieldsToUpdate.add(dependent);
				}

				if (nestedSetContains(getQueries(target), revision, id)) {
					manager.fieldInvalidated = true;
				}
			}
			return getOrAddInNestedMap(getMap(target), revision, id, newValue);
		},
		get: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
			addDependency: boolean,
		) => {
			if (addDependency) {
				addToNestedSet(getQueries(target), revision, id);
			}
			return tryGetFromNestedMap(getMap(target), revision, id);
		},
	};

	return manager;
}

function addFieldData<T>(manager: CrossFieldManagerI<T>, fieldData: T) {
	for (const [revision, ids] of manager.srcQueries) {
		for (const id of ids.keys()) {
			assert(
				tryGetFromNestedMap(manager.table.srcDependents, revision, id) === undefined,
				0x564 /* TODO: Support multiple dependents per key */,
			);
			setInNestedMap(manager.table.srcDependents, revision, id, fieldData);
		}
	}

	for (const [revision, ids] of manager.dstQueries) {
		for (const id of ids.keys()) {
			assert(
				tryGetFromNestedMap(manager.table.dstDependents, revision, id) === undefined,
				0x565 /* TODO: Support multiple dependents per key */,
			);
			setInNestedMap(manager.table.dstDependents, revision, id, fieldData);
		}
	}

	if (manager.fieldInvalidated) {
		manager.table.fieldsToUpdate.add(fieldData);
	}
}

function makeModularChangeset(
	changes: FieldChangeMap,
	maxId: number = -1,
	revisions: readonly RevisionInfo[] | undefined = undefined,
	constraintViolationCount: number | undefined = undefined,
): ModularChangeset {
	const changeset: Mutable<ModularChangeset> = { changes };
	if (revisions !== undefined && revisions.length > 0) {
		changeset.revisions = revisions;
	}
	if (maxId >= 0) {
		changeset.maxId = brand(maxId);
	}
	if (constraintViolationCount !== undefined && constraintViolationCount > 0) {
		changeset.constraintViolationCount = constraintViolationCount;
	}
	return changeset;
}

class ModularChangeEncoder extends ChangeEncoder<ModularChangeset> {
	public constructor(private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		super();
	}

	public encodeForJson(formatVersion: number, change: ModularChangeset): JsonCompatibleReadOnly {
		return encodeForJsonFormat0(this.fieldKinds, change);
	}

	public decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): ModularChangeset {
		return decodeJsonFormat0(this.fieldKinds, change);
	}
}

/**
 * @sealed
 * @alpha
 */
export class ModularEditBuilder
	extends ProgressiveEditBuilderBase<ModularChangeset>
	implements ProgressiveEditBuilder<ModularChangeset>
{
	private transactionDepth: number = 0;
	private idAllocator: IdAllocator;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, ModularChangeset>,
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	) {
		super(family, changeReceiver, anchors);
		this.idAllocator = idAllocatorFromMaxId();
	}

	public override enterTransaction(): void {
		this.transactionDepth += 1;
		if (this.transactionDepth === 1) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	public override exitTransaction(): void {
		assert(this.transactionDepth > 0, "Cannot exit inexistent transaction");
		this.transactionDepth -= 1;
		if (this.transactionDepth === 0) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	public apply(change: ModularChangeset): void {
		this.applyChange(change);
	}

	/**
	 * Adds a change to the edit builder
	 * @param path - path to the parent node of the field being edited
	 * @param field - the field which is being edited
	 * @param fieldKind - the kind of the field
	 * @param change - the change to the field
	 * @param maxId - the highest `ChangesetLocalId` used in this change
	 */
	public submitChange(
		path: UpPath | undefined,
		field: FieldKey,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
		maxId: ChangesetLocalId = brand(-1),
	): void {
		const changeMap = this.buildChangeMap(path, field, fieldKind, change);
		this.applyChange(makeModularChangeset(changeMap, maxId));
	}

	public submitChanges(changes: EditDescription[], maxId: ChangesetLocalId = brand(-1)) {
		const changeMaps = changes.map((change) =>
			makeAnonChange(
				makeModularChangeset(
					this.buildChangeMap(change.path, change.field, change.fieldKind, change.change),
				),
			),
		);
		const composedChange = this.changeFamily.rebaser.compose(changeMaps);
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		this.applyChange(composedChange);
	}

	public generateId(): ChangesetLocalId {
		return this.idAllocator();
	}

	private buildChangeMap(
		path: UpPath | undefined,
		field: FieldKey,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
	): FieldChangeMap {
		let fieldChangeMap: FieldChangeMap = new Map([[field, { fieldKind, change }]]);

		let remainingPath = path;
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

	public setValue(path: UpPath, value: Value): void {
		const valueChange: ValueChange = value === undefined ? {} : { value };
		const nodeChange: NodeChangeset = { valueChange };
		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
			path.parentIndex,
			nodeChange,
		);
		this.submitChange(
			path.parent,
			path.parentField,
			genericFieldKind.identifier,
			brand(fieldChange),
		);
	}

	public addValueConstraint(path: UpPath, currentValue: Value): void {
		const nodeChange: NodeChangeset = {
			valueConstraint: { value: currentValue, violated: false },
		};
		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
			path.parentIndex,
			nodeChange,
		);
		this.submitChange(
			path.parent,
			path.parentField,
			genericFieldKind.identifier,
			brand(fieldChange),
		);
	}
}

/**
 * @alpha
 */
export interface EditDescription {
	path: UpPath | undefined;
	field: FieldKey;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}
