/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily, ProgressiveEditBuilder } from "../../change-family";
import { ChangeRebaser } from "../../rebase";
import { FieldKindIdentifier } from "../../schema-stored";
import { AnchorSet, Delta, FieldKey, UpPath, Value } from "../../tree";
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

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 *
 * @sealed
 */
export class ModularChangeFamily implements
    ChangeFamily<ModularEditBuilder, FieldChangeMap>,
    ChangeRebaser<FieldChangeMap> {
    readonly encoder: ChangeEncoder<FieldChangeMap>;

    constructor(
        readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    ) {
        this.encoder = new ModularChangeEncoder(this.fieldKinds);
    }

    get rebaser(): ChangeRebaser<FieldChangeMap> { return this; }

    compose(changes: FieldChangeMap[]): FieldChangeMap {
        if (changes.length === 1) {
            return changes[0];
        }

        const fieldChanges = new Map<FieldKey, FieldChange[]>();
        for (const change of changes) {
            for (const [key, fieldChange] of change.entries()) {
                getOrAddEmptyToMap(fieldChanges, key).push(fieldChange);
            }
        }

        const composedFields: FieldChangeMap = new Map();
        for (const field of fieldChanges.keys()) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const changesForField = fieldChanges.get(field)!;

            // TODO: Handle the case where changes don't all have same field kind
            const kind = changesForField[0].fieldKind;
            const composedField = getChangeHandler(this.fieldKinds, kind).rebaser.compose(
                changesForField.map((change) => change.change),
                (childChanges) => this.composeNodeChanges(childChanges),
            );

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields.set(
                field,
                { fieldKind: kind, change: brand(composedField) },
            );
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

    invert(changes: FieldChangeMap): FieldChangeMap {
        const invertedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of changes.entries()) {
            const invertedChange = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser.invert(
                fieldChange.change,
                (childChanges) => this.invertNodeChange(childChanges));

            invertedFields.set(
                field,
                { fieldKind: fieldChange.fieldKind, change: brand(invertedChange) },
            );
        }

        return invertedFields;
    }

    private invertNodeChange(change: NodeChangeset): NodeChangeset {
        // TODO: Correctly invert `change.valueChange`
        if (change.fieldChanges === undefined) {
            return {};
        }

        return { fieldChanges: this.invert(change.fieldChanges) };
    }

    rebase(change: FieldChangeMap, over: FieldChangeMap): FieldChangeMap {
        const rebasedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of change.entries()) {
            const baseChanges = over.get(field);
            if (baseChanges === undefined) {
                rebasedFields.set(field, fieldChange);
            } else {
                // TODO: Handle the case where `change` and `over` have different field kinds for this field
                const rebasedField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser.rebase(
                    fieldChange.change,
                    baseChanges.change,
                    (child, baseChild) => this.rebaseNodeChange(child, baseChild));

                // TODO: Could optimize by skipping this assignment if `rebasedField` is empty
                rebasedFields.set(
                    field,
                    { fieldKind: fieldChange.fieldKind, change: brand(rebasedField) },
                );
            }
        }

        return rebasedFields;
    }

    private rebaseNodeChange(change: NodeChangeset, over: NodeChangeset): NodeChangeset {
        if (change.fieldChanges === undefined || over.fieldChanges === undefined) {
            return change;
        }

        return {
            ...change,
            fieldChanges: this.rebase(change.fieldChanges, over.fieldChanges),
        };
    }

    rebaseAnchors(anchors: AnchorSet, over: FieldChangeMap): void {
        anchors.applyDelta(this.intoDelta(over));
    }

    intoDelta(change: FieldChangeMap): Delta.Root {
        const delta: Delta.Root = new Map();
        for (const [field, fieldChange] of change.entries()) {
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
            modify.setValue = change.valueChange;
        }

        if (change.fieldChanges !== undefined) {
            modify.fields = this.intoDelta(change.fieldChanges);
        }

        return modify;
    }

    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchors: AnchorSet): ModularEditBuilder {
        return new ModularEditBuilder(this, deltaReceiver, anchors);
    }
}

function getChangeHandler(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
    const fieldKind = fieldKinds.get(kind);
    assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
    return fieldKind.changeHandler;
}

class ModularChangeEncoder extends ChangeEncoder<FieldChangeMap> {
    constructor(private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
        super();
    }

    encodeForJson(formatVersion: number, change: FieldChangeMap): JsonCompatibleReadOnly {
        const encodedFields: EncodedFieldChangeMap = {};
        for (const [field, fieldChange] of change.entries()) {
            const encodedChange = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).encoder.encodeForJson(
                formatVersion,
                fieldChange.change,
                (childChange) => this.encodeNodeChangesForJson(formatVersion, childChange),
            );

            const encodedField: EncodedFieldChange & JsonCompatibleReadOnly = {
                fieldKind: fieldChange.fieldKind,
                change: encodedChange,
            };

            encodedFields[field as string] = encodedField;
        }

        return encodedFields;
    }

    private encodeNodeChangesForJson(formatVersion: number, change: NodeChangeset): JsonCompatibleReadOnly {
        const encodedChange: EncodedNodeChangeset = {};
        if (change.valueChange !== undefined) {
            encodedChange.valueChange = change.valueChange;
        }

        if (change.fieldChanges !== undefined) {
            const encodedFieldChanges = this.encodeForJson(formatVersion, change.fieldChanges);
            encodedChange.fieldChanges = encodedFieldChanges as unknown as EncodedFieldChangeMap;
        }

        return encodedChange as JsonCompatibleReadOnly;
    }

    decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): FieldChangeMap {
        const encodedChange = change as unknown as EncodedFieldChangeMap;
        const decodedFields: FieldChangeMap = new Map();
        for (const field of Object.keys(encodedChange)) {
            const fieldChange = encodedChange[field];
            const fieldChangeset = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).encoder.decodeJson(
                formatVersion,
                fieldChange.change,
                (encodedChild) => this.decodeNodeChangesetFromJson(formatVersion, encodedChild),
            );

            decodedFields.set(brand(field), { fieldKind: fieldChange.fieldKind, change: brand(fieldChangeset) });
        }

        return decodedFields;
    }

    private decodeNodeChangesetFromJson(formatVersion: number, change: JsonCompatibleReadOnly): NodeChangeset {
        const encodedChange = change as EncodedNodeChangeset;
        const decodedChange: NodeChangeset = {};
        if (encodedChange.valueChange !== undefined) {
            decodedChange.valueChange = encodedChange.valueChange;
        }

        if (encodedChange.fieldChanges !== undefined) {
            decodedChange.fieldChanges = this.decodeJson(formatVersion, encodedChange.fieldChanges);
        }

        return decodedChange;
    }
}
interface EncodedNodeChangeset {
    valueChange?: ValueChange;
    fieldChanges?: EncodedFieldChangeMap;
}

type EncodedFieldChangeMap = Record<string, EncodedFieldChange> & JsonCompatibleReadOnly;

interface EncodedFieldChange {
    fieldKind: FieldKindIdentifier;
    change: JsonCompatibleReadOnly;
}

/**
 * @sealed
 */
export class ModularEditBuilder extends ProgressiveEditBuilder<FieldChangeMap> {
    private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>;

    constructor(
        family: ModularChangeFamily,
        deltaReceiver: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ) {
        super(family, deltaReceiver, anchors);
        this.fieldKinds = family.fieldKinds;
    }

    /**
     * Adds a change to the edit builder
     * @param path - path to the parent node of the field being edited
     * @param field - the field which is being edited
     * @param fieldKind - the kind of the field
     * @param change - the change to the field
     */
    submitChange(
        path: UpPathWithFieldKinds | undefined,
        field: FieldKey,
        fieldKind: FieldKindIdentifier,
        change: FieldChangeset,
    ): void {
        let fieldChangeMap: FieldChangeMap = new Map([[
            field,
            { fieldKind, change },
        ]]);

        let remainingPath = path;
        while (remainingPath !== undefined) {
            const editor = getChangeHandler(this.fieldKinds, remainingPath.parentFieldKind).editor;
            const nodeChange: NodeChangeset = { fieldChanges: fieldChangeMap };
            const fieldChange = editor.buildChildChange(remainingPath.parentIndex, nodeChange);
            fieldChangeMap = new Map([[
                remainingPath.parentField,
                { fieldKind: remainingPath.parentFieldKind, change: brand(fieldChange) },
            ]]);
            remainingPath = remainingPath.parent;
        }

        this.applyChange(fieldChangeMap);
    }

    setValue(path: UpPathWithFieldKinds, value: Value): void {
        const valueChange: ValueChange = value === undefined ? {} : { value };
        const nodeChange: NodeChangeset = { valueChange };
        const editor = getChangeHandler(this.fieldKinds, path.parentFieldKind).editor;
        const fieldChange = editor.buildChildChange(path.parentIndex, nodeChange);
        this.submitChange(path.parent, path.parentField, path.parentFieldKind, brand(fieldChange));
    }
}

export interface UpPathWithFieldKinds extends UpPath {
    readonly parent: UpPathWithFieldKinds | undefined;
    readonly parentFieldKind: FieldKindIdentifier;
}
