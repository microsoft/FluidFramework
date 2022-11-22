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
import { brand, clone, getOrAddEmptyToMap, JsonCompatibleReadOnly } from "../../util";
import { dummyRepairDataStore } from "../fakeRepairDataStore";
import {
    FieldChangeHandler,
    FieldChangeMap,
    FieldChange,
    FieldChangeset,
    NodeChangeset,
    ValueChange,
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
    implements ChangeFamily<ModularEditBuilder, FieldChangeMap>, ChangeRebaser<FieldChangeMap>
{
    readonly encoder: ChangeEncoder<FieldChangeMap>;
    private readonly childComposer = (childChanges: TaggedChange<NodeChangeset>[]) =>
        this.composeNodeChanges(childChanges);

    constructor(readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
        this.encoder = new ModularChangeEncoder(this.fieldKinds);
    }

    get rebaser(): ChangeRebaser<FieldChangeMap> {
        return this;
    }

    /**
     * Produces an equivalent list of `FieldChangeset`s that all target the same {@link FieldKind}.
     * @param changes - The list of `FieldChange`s whose `FieldChangeset`s needs to be normalized.
     * @returns An object that contains both the equivalent list of `FieldChangeset`s that all
     * target the same {@link FieldKind}, and the `FieldKind` that they target.
     * The returned `FieldChangeset`s may be a shallow copy of the input `FieldChange`s.
     */
    private normalizeFieldChanges(changes: readonly FieldChange[]): {
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
                    this.childComposer,
                ) as FieldChangeset;
            }
            return change.change;
        });
        return { fieldKind, changesets: normalizedChanges };
    }

    compose(changes: TaggedChange<FieldChangeMap>[]): FieldChangeMap {
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
                const { fieldKind, changesets } = this.normalizeFieldChanges(changesForField);
                assert(
                    changesets.length === changesForField.length,
                    "Number of changes should be constant when normalizing",
                );
                const taggedChangesets = changesets.map((change, i) =>
                    tagChange(change, changesForField[i].revision),
                );
                const composedChange = fieldKind.changeHandler.rebaser.compose(
                    taggedChangesets,
                    this.childComposer,
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

    private composeNodeChanges(changes: TaggedChange<NodeChangeset>[]): NodeChangeset {
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

        const composedFieldChanges = this.compose(fieldChanges);
        const composedNodeChange: NodeChangeset = {};
        if (valueChange !== undefined) {
            composedNodeChange.valueChange = valueChange;
        }

        if (composedFieldChanges.size > 0) {
            composedNodeChange.fieldChanges = composedFieldChanges;
        }

        return composedNodeChange;
    }

    invert(changes: TaggedChange<FieldChangeMap>): FieldChangeMap {
        const invertedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of changes.change) {
            const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

            const invertedChange = getChangeHandler(
                this.fieldKinds,
                fieldChange.fieldKind,
            ).rebaser.invert({ revision, change: fieldChange.change }, (childChanges) =>
                this.invertNodeChange({ revision, change: childChanges }),
            );

            invertedFields.set(field, {
                ...fieldChange,
                change: brand(invertedChange),
            });
        }

        return invertedFields;
    }

    private invertNodeChange(change: TaggedChange<NodeChangeset>): NodeChangeset {
        const inverse: NodeChangeset = {};

        if (change.change.valueChange !== undefined) {
            assert(
                !("revert" in change.change.valueChange),
                "Inverting inverse changes is currently not supported",
            );
            const revision = change.change.valueChange.revision ?? change.revision;
            inverse.valueChange = { revert: revision };
        }

        if (change.change.fieldChanges !== undefined) {
            inverse.fieldChanges = this.invert({ ...change, change: change.change.fieldChanges });
        }

        return inverse;
    }

    rebase(change: FieldChangeMap, over: TaggedChange<FieldChangeMap>): FieldChangeMap {
        const rebasedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of change) {
            const baseChanges = over.change.get(field);
            if (baseChanges === undefined) {
                rebasedFields.set(field, fieldChange);
            } else {
                const {
                    fieldKind,
                    changesets: [fieldChangeset, baseChangeset],
                } = this.normalizeFieldChanges([fieldChange, baseChanges]);

                const { revision } = fieldChange.revision !== undefined ? fieldChange : over;
                const rebasedField = fieldKind.changeHandler.rebaser.rebase(
                    fieldChangeset,
                    { revision, change: baseChangeset },
                    (child, baseChild) =>
                        this.rebaseNodeChange(child, { revision, change: baseChild }),
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
    ): NodeChangeset {
        if (change.fieldChanges === undefined || over.change.fieldChanges === undefined) {
            return change;
        }

        return {
            ...change,
            fieldChanges: this.rebase(change.fieldChanges, {
                ...over,
                change: over.change.fieldChanges,
            }),
        };
    }

    rebaseAnchors(anchors: AnchorSet, over: FieldChangeMap): void {
        anchors.applyDelta(this.intoDelta(over));
    }

    intoDelta(change: FieldChangeMap, repairStore?: ReadonlyRepairDataStore): Delta.Root {
        return this.intoDeltaImpl(change, repairStore ?? dummyRepairDataStore, undefined);
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
        const delta: Delta.Root = new Map();
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
        const modify: Delta.Modify = {
            type: Delta.MarkType.Modify,
        };

        const valueChange = change.valueChange;
        if (valueChange !== undefined) {
            if ("revert" in valueChange) {
                assert(path !== undefined, "Only existing nodes can have their value restored");
                assert(valueChange.revert !== undefined, "Unable to revert to undefined revision");
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
        changeReceiver: (change: FieldChangeMap) => void,
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

class ModularChangeEncoder extends ChangeEncoder<FieldChangeMap> {
    constructor(private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
        super();
    }

    encodeForJson(formatVersion: number, change: FieldChangeMap): JsonCompatibleReadOnly {
        return encodeForJsonFormat0(this.fieldKinds, change);
    }

    decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): FieldChangeMap {
        return decodeJsonFormat0(this.fieldKinds, change);
    }
}

/**
 * @sealed
 */
export class ModularEditBuilder
    extends ProgressiveEditBuilderBase<FieldChangeMap>
    implements ProgressiveEditBuilder<FieldChangeMap>
{
    constructor(
        family: ChangeFamily<unknown, FieldChangeMap>,
        changeReceiver: (change: FieldChangeMap) => void,
        anchors: AnchorSet,
    ) {
        super(family, changeReceiver, anchors);
    }

    public apply(change: FieldChangeMap): void {
        this.applyChange(change);
    }

    /**
     * Adds a change to the edit builder
     * @param path - path to the parent node of the field being edited
     * @param field - the field which is being edited
     * @param fieldKind - the kind of the field
     * @param change - the change to the field
     */
    submitChange(
        path: UpPath | undefined,
        field: FieldKey,
        fieldKind: FieldKindIdentifier,
        change: FieldChangeset,
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

        this.applyChange(fieldChangeMap);
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
