/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily, JsonCompatibleReadOnly, ProgressiveEditBuilder } from "../../change-family";
import { ChangeRebaser } from "../../rebase";
import { FieldKindIdentifier } from "../../schema-stored";
import { AnchorSet, Delta, FieldKey, UpPath } from "../../tree";
import { brand, getOrAddEmptyToMap } from "../../util";
import { FieldChangeHandler, FieldChangeMap, FieldChange, FieldChangeset } from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
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
                (childChanges) => this.compose(childChanges),
            );

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields.set(
                field,
                { fieldKind: kind, change: brand(composedField) },
            );
        }

        return composedFields;
    }

    invert(changes: FieldChangeMap): FieldChangeMap {
        const invertedFields: FieldChangeMap = new Map();

        for (const [field, fieldChange] of changes.entries()) {
            const invertedChange = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser.invert(
                fieldChange.change,
                (childChanges) => this.invert(childChanges));

            invertedFields.set(
                field,
                { fieldKind: fieldChange.fieldKind, change: brand(invertedChange) },
            );
        }

        return invertedFields;
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
                    (child, baseChild) => this.rebase(child, baseChild));

                // TODO: Could optimize by skipping this assignment if `rebasedField` is empty
                rebasedFields.set(
                    field,
                    { fieldKind: fieldChange.fieldKind, change: brand(rebasedField) },
                );
            }
        }

        return rebasedFields;
    }

    rebaseAnchors(anchors: AnchorSet, over: FieldChangeMap): void {
        anchors.applyDelta(this.intoDelta(over));
    }

    intoDelta(change: FieldChangeMap): Delta.Root {
        const delta: Delta.Root = new Map();
        for (const [field, fieldChange] of change.entries()) {
            const deltaField = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).intoDelta(
                fieldChange.change,
                (childChange) => this.intoDelta(childChange),
            );
            delta.set(field, deltaField);
        }
        return delta;
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
        const encodedFields: { [key: string]: JsonCompatibleReadOnly; } = {};
        for (const [field, fieldChange] of change.entries()) {
            const encodedChange = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).encoder.encodeForJson(
                formatVersion,
                fieldChange.change,
                (childChange) => this.encodeForJson(formatVersion, childChange),
            );

            const encodedField: EncodedFieldChange & JsonCompatibleReadOnly = {
                fieldKind: fieldChange.fieldKind,
                change: encodedChange,
            };

            encodedFields[field as string] = encodedField;
        }

        return encodedFields;
    }

    decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): FieldChangeMap {
        const encodedChange = change as Record<string, JsonCompatibleReadOnly>;
        const decodedFields: FieldChangeMap = new Map();
        for (const field of Object.keys(encodedChange)) {
            const fieldChange = encodedChange[field] as unknown as EncodedFieldChange;
            const fieldChangeset = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).encoder.decodeJson(
                formatVersion,
                fieldChange.change,
                (encodedChild) => this.decodeJson(formatVersion, encodedChild),
            );

            decodedFields.set(brand(field), { fieldKind: fieldChange.fieldKind, change: brand(fieldChangeset) });
        }

        return decodedFields;
    }
}

interface EncodedFieldChange {
    fieldKind: FieldKindIdentifier;
    change: JsonCompatibleReadOnly;
}

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

    submitChange(
        path: UpPathWithFieldKinds | undefined,
        field: FieldKey,
        fieldKind: FieldKindIdentifier,
        change: FieldChangeset,
    ): void {
        let nodeChange: FieldChangeMap = {};
        nodeChange[field as string] = { fieldKind, change };

        let remainingPath = path;
        while (remainingPath !== undefined) {
            const editor = getChangeHandler(this.fieldKinds, remainingPath.parentFieldKind).editor;
            const fieldChange = editor.buildChildChange(remainingPath.parentIndex, nodeChange);
            nodeChange = {};
            nodeChange[field as string] = { fieldKind: remainingPath.parentFieldKind, change: brand(fieldChange) };
            remainingPath = remainingPath.parent;
        }

        this.applyChange(nodeChange);
    }
}

export interface UpPathWithFieldKinds extends UpPath {
    readonly parent: UpPathWithFieldKinds | undefined;
    readonly parentFieldKind: FieldKindIdentifier;
}
