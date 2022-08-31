/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily, JsonCompatibleReadOnly, ProgressiveEditBuilder } from "../../change-family";
import { ChangeRebaser } from "../../rebase";
import { FieldKindIdentifier } from "../../schema-stored";
import { AnchorSet, Delta, FieldKey } from "../../tree";
import { brand, getOrAddEmptyToMap } from "../../util";
import { FieldChangeHandler, FieldChangeMap, FieldChange } from "./fieldChangeHandler";
import { FullSchemaPolicy } from "./fieldKind";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 */
export class ModularChangeFamily implements
    ChangeFamily<ModularEditBuilder, FieldChangeMap>,
    ChangeRebaser<FieldChangeMap>,
    ChangeEncoder<FieldChangeMap> {
    constructor(
        private readonly schemaPolicy: FullSchemaPolicy,
    ) { }

    get rebaser(): ChangeRebaser<any> { return this; }
    get encoder(): ChangeEncoder<any> { return this; }

    compose(changes: FieldChangeMap[]): FieldChangeMap {
        if (changes.length === 1) {
            return changes[0];
        }

        const fieldChanges = new Map<FieldKey, FieldChange[]>();
        for (const change of changes) {
            for (const key of Object.keys(change.fields)) {
                getOrAddEmptyToMap(fieldChanges, brand(key)).push(change[key]);
            }
        }

        const composedFields: FieldChangeMap = {};
        for (const field of fieldChanges.keys()) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const changesForField = fieldChanges.get(field)!;

            // TODO: Handle the case where changes don't all have same field kind
            const kind = changesForField[0].fieldKind;
            const composedField = this.getChangeHandler(kind).rebaser.compose(
                changesForField.map((change) => change.change),
                (...childChanges) => this.compose(childChanges),
            );

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields[field as string] = {
                fieldKind: kind,
                change: brand(composedField),
            };
        }

        return composedFields;
    }

    invert(changes: FieldChangeMap): FieldChangeMap {
        const invertedFields: FieldChangeMap = {};

        for (const field of Object.keys(changes)) {
            const fieldChange = changes[field];
            const invertedChange = this.getChangeHandler(fieldChange.fieldKind).rebaser.invert(
                fieldChange.change,
                (childChanges) => this.invert(childChanges));

            invertedFields[field] = {
                fieldKind: fieldChange.fieldKind,
                change: brand(invertedChange),
            };
        }

        return invertedFields;
    }

    rebase(change: FieldChangeMap, over: FieldChangeMap): FieldChangeMap {
        const rebasedFields: FieldChangeMap = {};

        for (const field of Object.keys(change)) {
            const baseChanges = over[field];
            if (baseChanges === undefined) {
                rebasedFields[field] = change[field];
            } else {
                const fieldChange = change[field];
                const rebasedField = this.getChangeHandler(fieldChange.fieldKind).rebaser.rebase(
                    fieldChange.change,
                    baseChanges,
                    (child, baseChild) => this.rebase(child, baseChild));

                // TODO: Could optimize by skipping this assignment if `rebasedField` is empty
                rebasedFields[field] = {
                    fieldKind: fieldChange.fieldKind,
                    change: brand(rebasedField),
                };
            }
        }

        return rebasedFields;
    }

    rebaseAnchors(anchors: AnchorSet, over: FieldChangeMap): void {
        anchors.applyDelta(this.intoDelta(over));
    }

    intoDelta(change: FieldChangeMap): Delta.Root {
        const delta: Delta.Root = new Map();
        for (const field of Object.keys(change)) {
            const fieldChange = change[field];
            const deltaField = this.getChangeHandler(fieldChange.fieldKind).intoDelta(
                fieldChange.change,
                (childChange) => this.intoDelta(childChange),
            );
            delta.set(brand(field), deltaField);
        }
        return delta;
    }

    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchors: AnchorSet): ModularEditBuilder {
        return new ModularEditBuilder(this, deltaReceiver, anchors);
    }

    encodeForJson(formatVersion: number, change: FieldChangeMap): JsonCompatibleReadOnly {
        const encodedFields: { [key: string]: JsonCompatibleReadOnly; } = {};
        for (const field of Object.keys(change)) {
            const fieldChange = change[field];
            encodedFields[field] = this.getChangeHandler(fieldChange.fieldKind).encoder.encodeForJson(
                formatVersion,
                fieldChange.change,
                (childChange) => this.encodeForJson(formatVersion, childChange),
            );
        }

        return encodedFields;
    }

    encodeBinary(formatVersion: number, change: FieldChangeMap): Buffer {
        throw new Error("Method not implemented.");
    }

    decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): FieldChangeMap {
        const encodedChange = change as Record<string, JsonCompatibleReadOnly>;
        const decodedFields: FieldChangeMap = {};
        for (const field of Object.keys(encodedChange)) {
            const fieldChange = encodedChange[field] as unknown as EncodedFieldChange;
            const fieldChangeset = this.getChangeHandler(fieldChange.fieldKind).encoder.decodeJson(
                formatVersion,
                fieldChange.change,
                (encodedChild) => this.decodeJson(formatVersion, encodedChild),
            );

            decodedFields[field] = { fieldKind: fieldChange.fieldKind, change: brand(fieldChangeset) };
        }

        return decodedFields;
    }

    decodeBinary(formatVersion: number, change: Buffer): FieldChangeMap {
        throw new Error("Method not implemented.");
    }

    private getChangeHandler(kind: FieldKindIdentifier): FieldChangeHandler<unknown> {
        const fieldKind = this.schemaPolicy.fieldKinds.get(kind);
        assert(fieldKind !== undefined, "Unknown field kind");
        return fieldKind.changeHandler;
    }
}

interface EncodedFieldChange {
    fieldKind: FieldKindIdentifier;
    change: JsonCompatibleReadOnly;
}

export class ModularEditBuilder extends ProgressiveEditBuilder<FieldChangeMap> {
    constructor(
        family: ModularChangeFamily,
        deltaReciever: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ) {
        super(family, deltaReciever, anchors);
    }

    // TODO: Finish implementation
}
