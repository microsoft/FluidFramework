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
} from "../../core";
import { brand, clone, getOrAddEmptyToMap, JsonCompatibleReadOnly, Mutable } from "../../util";
import { dummyRepairDataStore } from "../fakeRepairDataStore";
import {
    FieldChangeHandler,
    FieldChangeMap,
    FieldChange,
    FieldChangeset,
    NodeChangeset,
    ValueChange,
    ModularChangeset,
    ChangesetLocalId,
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
                    (children) => this.composeNodeChanges(children, genId),
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

        const composedFields = this.composeFieldMaps(
            changes.map((change) => tagChange(change.change.changes, change.revision)),
            genId,
        );
        return makeModularChangeset(composedFields, maxId);
    }

    private composeFieldMaps(
        changes: TaggedChange<FieldChangeMap>[],
        genId: IdAllocator,
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
                const taggedChangesets = changesets.map((change, i) =>
                    tagChange(change, changesForField[i].revision),
                );
                const composedChange = fieldKind.changeHandler.rebaser.compose(
                    taggedChangesets,
                    (children) => this.composeNodeChanges(children, genId),
                    genId,
                );

                composedField = {
                    fieldKind: fieldKind.identifier,
                    change: brand(composedChange),
                };
            }

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields.set(field, composedField);
        }
        return composedFields;
    }

    private composeNodeChanges(
        changes: TaggedChange<NodeChangeset>[],
        genId: IdAllocator,
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

        const composedFieldChanges = this.composeFieldMaps(fieldChanges, genId);
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
        const invertedFields = this.invertFieldMap(
            tagChange(change.change.changes, change.revision),
            genId,
        );

        return makeModularChangeset(invertedFields, maxId);
    }

    private invertFieldMap(
        changes: TaggedChange<FieldChangeMap>,
        genId: IdAllocator,
    ): FieldChangeMap {
        const invertedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of changes.change) {
            const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

            const invertedChange = getChangeHandler(
                this.fieldKinds,
                fieldChange.fieldKind,
            ).rebaser.invert(
                { revision, change: fieldChange.change },
                (childChanges) => this.invertNodeChange({ revision, change: childChanges }, genId),
                genId,
            );

            invertedFields.set(field, {
                ...fieldChange,
                change: brand(invertedChange),
            });
        }

        return invertedFields;
    }

    private invertNodeChange(
        change: TaggedChange<NodeChangeset>,
        genId: IdAllocator,
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
            );
        }

        return inverse;
    }

    rebase(change: ModularChangeset, over: TaggedChange<ModularChangeset>): ModularChangeset {
        let maxId = change.maxId ?? -1;
        const genId: IdAllocator = () => brand(++maxId);
        const rebasedFields = this.rebaseFieldMap(
            change.changes,
            tagChange(over.change.changes, over.revision),
            genId,
        );

        return makeModularChangeset(rebasedFields, maxId);
    }

    private rebaseFieldMap(
        change: FieldChangeMap,
        over: TaggedChange<FieldChangeMap>,
        genId: IdAllocator,
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
                const rebasedField = fieldKind.changeHandler.rebaser.rebase(
                    fieldChangeset,
                    { revision, change: baseChangeset },
                    (child, baseChild) =>
                        this.rebaseNodeChange(child, { revision, change: baseChild }, genId),
                    genId,
                );

                // TODO: Could optimize by skipping this assignment if `rebasedField` is empty
                rebasedFields.set(field, {
                    fieldKind: fieldKind.identifier,
                    change: brand(rebasedField),
                });
            }
        }

        return rebasedFields;
    }

    private rebaseNodeChange(
        change: NodeChangeset,
        over: TaggedChange<NodeChangeset>,
        genId: IdAllocator,
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
        const delta: Map<FieldKey, Delta.MarkList> = new Map();
        for (const [field, fieldChange] of change) {
            const deltaField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).intoDelta(
                fieldChange.change,
                (childChange, index): Delta.Modify =>
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
        change: NodeChangeset,
        repairStore: ReadonlyRepairDataStore,
        path?: UpPath,
    ): Delta.Modify {
        const modify: Mutable<Delta.Modify> = {
            type: Delta.MarkType.Modify,
        };

        const valueChange = change.valueChange;
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

        if (change.fieldChanges !== undefined) {
            modify.fields = this.intoDeltaImpl(change.fieldChanges, repairStore, path);
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

        this.applyChange(makeModularChangeset(fieldChangeMap, maxId));
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
