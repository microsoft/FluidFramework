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
} from "../../core";
import {
	addToNestedSet,
	brand,
	clone,
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
	readonly encoder: ChangeEncoder<ModularChangeset>;

	constructor(readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		this.encoder = new ModularChangeEncoder(this.fieldKinds);
	}

	get rebaser(): ChangeRebaser<ModularChangeset> {
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
					(children) => this.composeNodeChanges(children, genId, newCrossFieldTable()),
					genId,
				) as FieldChangeset;
			}
			return change.change;
		});
		return { fieldKind, changesets: normalizedChanges };
	}

	compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		let maxId = changes.reduce((max, change) => Math.max(change.change.maxId ?? -1, max), -1);
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<ComposeData>();

		const composedFields = this.composeFieldMaps(
			changes.map((change) => tagChange(change.change.changes, change.revision)),
			genId,
			crossFieldTable,
		);

		while (crossFieldTable.fieldsToUpdate.size > 0) {
			const fieldsToUpdate = crossFieldTable.fieldsToUpdate;
			crossFieldTable.fieldsToUpdate = new Set();
			for (const field of fieldsToUpdate) {
				const amendedChange = getChangeHandler(
					this.fieldKinds,
					field.fieldKind,
				).rebaser.amendCompose(
					field.change,
					(children) => this.composeNodeChanges(children, genId, crossFieldTable),
					genId,
					newCrossFieldManager(crossFieldTable),
				);
				field.change = brand(amendedChange);
			}
		}
		return makeModularChangeset(composedFields, maxId);
	}

	private composeFieldMaps(
		changes: TaggedChange<FieldChangeMap>[],
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<ComposeData>,
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
					(children) => this.composeNodeChanges(children, genId, crossFieldTable),
					genId,
					manager,
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
	): NodeChangeset {
		const fieldChanges: TaggedChange<FieldChangeMap>[] = [];
		let valueChange: ValueChange | undefined;
		for (const change of changes) {
			if (change.change.valueChange !== undefined) {
				valueChange = clone(change.change.valueChange);
				valueChange.revision ??= change.revision;
			}
			if (change.change.fieldChanges !== undefined) {
				fieldChanges.push(tagChange(change.change.fieldChanges, change.revision));
			}
		}

		const composedFieldChanges = this.composeFieldMaps(fieldChanges, genId, crossFieldTable);
		const composedNodeChange: NodeChangeset = {};
		if (valueChange !== undefined) {
			composedNodeChange.valueChange = valueChange;
		}

		if (composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		return composedNodeChange;
	}

	invert(change: TaggedChange<ModularChangeset>): ModularChangeset {
		let maxId = change.change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<InvertData>();
		const invertedFields = this.invertFieldMap(
			tagChange(change.change.changes, change.revision),
			genId,
			crossFieldTable,
		);

		while (crossFieldTable.fieldsToUpdate.size > 0) {
			const fieldsToUpdate = crossFieldTable.fieldsToUpdate;
			crossFieldTable.fieldsToUpdate = new Set();
			for (const { fieldChange, originalRevision } of fieldsToUpdate) {
				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.amendInvert(
					fieldChange.change,
					originalRevision,
					genId,
					newCrossFieldManager(crossFieldTable),
				);
				fieldChange.change = brand(amendedChange);
			}
		}
		return makeModularChangeset(invertedFields, maxId);
	}

	private invertFieldMap(
		changes: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<InvertData>,
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
					),
				genId,
				manager,
			);

			const invertedFieldChange: FieldChange = {
				...fieldChange,
				change: brand(invertedChange),
			};
			invertedFields.set(field, invertedFieldChange);

			const invertData: InvertData = {
				fieldChange: invertedFieldChange,
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
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.change.valueChange !== undefined) {
			assert(
				!("revert" in change.change.valueChange),
				0x4a9 /* Inverting inverse changes is currently not supported */,
			);
			const revision = change.change.valueChange.revision ?? change.revision;
			inverse.valueChange = { revert: revision };
		}

		if (change.change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				{ ...change, change: change.change.fieldChanges },
				genId,
				crossFieldTable,
			);
		}

		return inverse;
	}

	rebase(change: ModularChangeset, over: TaggedChange<ModularChangeset>): ModularChangeset {
		let maxId = change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const crossFieldTable = newCrossFieldTable<RebaseData>();
		const rebasedFields = this.rebaseFieldMap(
			change.changes,
			tagChange(over.change.changes, over.revision),
			genId,
			crossFieldTable,
		);

		while (crossFieldTable.fieldsToUpdate.size > 0) {
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
				);
				fieldChange.change = brand(amendedChange);
			}
		}

		return makeModularChangeset(rebasedFields, maxId);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
		crossFieldTable: CrossFieldTable<RebaseData>,
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
				} = this.normalizeFieldChanges([fieldChange, baseChanges], genId);

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
						),
					genId,
					manager,
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
	): NodeChangeset {
		if (change.fieldChanges === undefined || over.change.fieldChanges === undefined) {
			return change;
		}

		return {
			...change,
			fieldChanges: this.rebaseFieldMap(
				change.fieldChanges,
				{
					...over,
					change: over.change.fieldChanges,
				},
				genId,
				crossFieldTable,
			),
		};
	}

	rebaseAnchors(anchors: AnchorSet, over: ModularChangeset): void {
		anchors.applyDelta(this.intoDelta(over));
	}

	intoDelta(change: ModularChangeset, repairStore?: ReadonlyRepairDataStore): Delta.Root {
		return this.intoDeltaImpl(change.changes, repairStore ?? dummyRepairDataStore, undefined);
	}

	/**
	 * @param change - The change to convert into a delta.
	 * @param repairStore - The store to query for repair data.
	 * @param path - The path of the node being altered by the change as defined by the input context.
	 * Undefined for the root and for nodes that do not exist in the input context.
	 */
	private intoDeltaImpl(
		change: FieldChangeMap,
		repairStore: ReadonlyRepairDataStore,
		path: UpPath | undefined,
	): Delta.Root {
		const delta: Map<FieldKey, Delta.FieldChanges> = new Map();
		for (const [field, fieldChange] of change) {
			const deltaField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).intoDelta(
				fieldChange.change,
				(childChange, index): Delta.NodeChanges | undefined =>
					this.deltaFromNodeChange(
						childChange,
						repairStore,
						index === undefined
							? undefined
							: {
									parent: path,
									parentField: field,
									parentIndex: index,
							  },
					),
				(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] =>
					repairStore.getNodes(revision, path, field, index, count),
			);
			delta.set(field, deltaField);
		}
		return delta;
	}

	private deltaFromNodeChange(
		{ valueChange, fieldChanges }: NodeChangeset,
		repairStore: ReadonlyRepairDataStore,
		path?: UpPath,
	): Delta.NodeChanges | undefined {
		if (valueChange === undefined && fieldChanges === undefined) {
			return undefined;
		}

		const modify: Mutable<Delta.NodeChanges> = {};

		if (valueChange !== undefined) {
			if ("revert" in valueChange) {
				assert(
					path !== undefined,
					0x4aa /* Only existing nodes can have their value restored */,
				);
				assert(
					valueChange.revert !== undefined,
					0x4ab /* Unable to revert to undefined revision */,
				);
				modify.setValue = repairStore.getValue(valueChange.revert, path);
			} else {
				modify.setValue = valueChange.value;
			}
		}

		if (fieldChanges !== undefined) {
			modify.fields = this.intoDeltaImpl(fieldChanges, repairStore, path);
		}

		return modify;
	}

	buildEditor(
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver, anchors);
	}
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

interface InvertData {
	originalRevision: RevisionTag | undefined;
	fieldChange: FieldChange;
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
		) => {
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

			return getOrAddInNestedMap(getMap(target), revision, id, newValue);
		},
		get: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: ChangesetLocalId,
		) => {
			addToNestedSet(getQueries(target), revision, id);
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

function makeModularChangeset(changes: FieldChangeMap, maxId: number): ModularChangeset {
	const changeset: ModularChangeset = { changes };
	if (maxId >= 0) {
		changeset.maxId = brand(maxId);
	}
	return changeset;
}

class ModularChangeEncoder extends ChangeEncoder<ModularChangeset> {
	constructor(private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		super();
	}

	encodeForJson(formatVersion: number, change: ModularChangeset): JsonCompatibleReadOnly {
		return encodeForJsonFormat0(this.fieldKinds, change);
	}

	decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): ModularChangeset {
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
	constructor(
		family: ChangeFamily<unknown, ModularChangeset>,
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	) {
		super(family, changeReceiver, anchors);
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
	submitChange(
		path: UpPath | undefined,
		field: FieldKey,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
		maxId: ChangesetLocalId = brand(-1),
	): void {
		const changeMap = this.buildChangeMap(path, field, fieldKind, change);
		this.applyChange(makeModularChangeset(changeMap, maxId));
	}

	submitChanges(changes: EditDescription[], maxId: ChangesetLocalId = brand(-1)) {
		const changeMaps = changes.map((change) =>
			makeAnonChange(
				makeModularChangeset(
					this.buildChangeMap(change.path, change.field, change.fieldKind, change.change),
					-1,
				),
			),
		);
		const composedChange = this.changeFamily.rebaser.compose(changeMaps);
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		this.applyChange(composedChange);
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

	setValue(path: UpPath, value: Value): void {
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
