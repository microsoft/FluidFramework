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
} from "../../core";
import { brand, getOrAddEmptyToMap, JsonCompatibleReadOnly } from "../../util";
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
    private readonly childComposer = (childChanges: NodeChangeset[]) =>
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

    compose(changes: FieldChangeMap[]): FieldChangeMap {
        if (changes.length === 1) {
            return changes[0];
        }

        const fieldChanges = new Map<FieldKey, FieldChange[]>();
        for (const change of changes) {
            for (const [key, fieldChange] of change) {
                getOrAddEmptyToMap(fieldChanges, key).push(fieldChange);
            }
        }

        const composedFields: FieldChangeMap = new Map();
        for (const [field, changesForField] of fieldChanges) {
            const { fieldKind, changesets } = this.normalizeFieldChanges(changesForField);
            const composedField = fieldKind.changeHandler.rebaser.compose(
                changesets,
                this.childComposer,
            );

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields.set(field, {
                fieldKind: fieldKind.identifier,
                change: brand(composedField),
            });
        }
        return composedFields;
    }

    private composeNodeChanges(changes: NodeChangeset[]): NodeChangeset {
        const fieldChanges = [];
        let valueChange: ValueChange | undefined;
        for (const change of changes) {
            if (change.valueChange !== undefined) {
                valueChange = change.valueChange;
            }
            if (change.fieldChanges !== undefined) {
                fieldChanges.push(change.fieldChanges);
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
            const invertedChange = getChangeHandler(
                this.fieldKinds,
                fieldChange.fieldKind,
            ).rebaser.invert({ ...changes, change: fieldChange.change }, (childChanges) =>
                this.invertNodeChange({ ...changes, change: childChanges }),
            );

            invertedFields.set(field, {
                fieldKind: fieldChange.fieldKind,
                change: brand(invertedChange),
            });
        }

        return invertedFields;
    }

    private invertNodeChange(change: TaggedChange<NodeChangeset>): NodeChangeset {
        // TODO: Correctly invert `change.valueChange`
        if (change.change.fieldChanges === undefined) {
            return {};
        }

        return { fieldChanges: this.invert({ ...change, change: change.change.fieldChanges }) };
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
                const rebasedField = fieldKind.changeHandler.rebaser.rebase(
                    fieldChangeset,
                    { ...over, change: baseChangeset },
                    (child, baseChild) =>
                        this.rebaseNodeChange(child, { ...over, change: baseChild }),
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

    intoDelta(change: FieldChangeMap): Delta.Root {
        const delta: Delta.Root = new Map();
        for (const [field, fieldChange] of change) {
            const deltaField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).intoDelta(
                fieldChange.change,
                (childChange) => this.deltaFromNodeChange(childChange),
            );
            delta.set(field, deltaField);
        }
        return delta;
    }

    private deltaFromNodeChange(change: NodeChangeset): Delta.Modify {
        const modify: Delta.Modify = {
            type: Delta.MarkType.Modify,
        };

        if (change.valueChange !== undefined) {
            modify.setValue = change.valueChange.value;
        }

        if (change.fieldChanges !== undefined) {
            modify.fields = this.intoDelta(change.fieldChanges);
        }

        return modify;
    }

    buildEditor(
        deltaReceiver: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ): ModularEditBuilder {
        return new ModularEditBuilder(this, deltaReceiver, anchors);
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
        deltaReceiver: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ) {
        super(family, deltaReceiver, anchors);
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
