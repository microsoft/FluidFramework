/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier } from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { FieldChangeMap, NodeChangeset, ValueChange } from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { getChangeHandler } from "./modularChangeFamily";

interface EncodedNodeChangeset {
    valueChange?: ValueChange;
    fieldChanges?: EncodedFieldChangeMap;
}

type EncodedFieldChangeMap = Record<string, EncodedFieldChange> & JsonCompatibleReadOnly;

interface EncodedFieldChange {
    fieldKind: FieldKindIdentifier;
    /**
     * Encoded in format selected by `fieldKind`
     */
    change: JsonCompatibleReadOnly;
}

export function encodeForJsonFormat0(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: FieldChangeMap,
): JsonCompatibleReadOnly {
    const encodedFields: EncodedFieldChangeMap = {};
    for (const [field, fieldChange] of change.entries()) {
        const encodedChange = getChangeHandler(
            fieldKinds,
            fieldChange.fieldKind,
        ).encoder.encodeForJson(0, fieldChange.change, (childChange) =>
            encodeNodeChangesForJson(fieldKinds, childChange),
        );

        const encodedField: EncodedFieldChange & JsonCompatibleReadOnly = {
            fieldKind: fieldChange.fieldKind,
            change: encodedChange,
        };

        encodedFields[field as string] = encodedField;
    }

    return encodedFields;
}

function encodeNodeChangesForJson(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: NodeChangeset,
): JsonCompatibleReadOnly {
    const encodedChange: EncodedNodeChangeset = {};
    if (change.valueChange !== undefined) {
        encodedChange.valueChange = change.valueChange;
    }

    if (change.fieldChanges !== undefined) {
        const encodedFieldChanges = encodeForJsonFormat0(fieldKinds, change.fieldChanges);
        encodedChange.fieldChanges = encodedFieldChanges as unknown as EncodedFieldChangeMap;
    }

    return encodedChange as JsonCompatibleReadOnly;
}

export function decodeJsonFormat0(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: JsonCompatibleReadOnly,
): FieldChangeMap {
    const encodedChange = change as unknown as EncodedFieldChangeMap;
    const decodedFields: FieldChangeMap = new Map();
    for (const field of Object.keys(encodedChange)) {
        const fieldChange = encodedChange[field];
        const fieldChangeset = getChangeHandler(
            fieldKinds,
            fieldChange.fieldKind,
        ).encoder.decodeJson(0, fieldChange.change, (encodedChild) =>
            decodeNodeChangesetFromJson(fieldKinds, encodedChild),
        );

        decodedFields.set(brand(field), {
            fieldKind: fieldChange.fieldKind,
            change: brand(fieldChangeset),
        });
    }

    return decodedFields;
}

function decodeNodeChangesetFromJson(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: JsonCompatibleReadOnly,
): NodeChangeset {
    const encodedChange = change as EncodedNodeChangeset;
    const decodedChange: NodeChangeset = {};
    if (encodedChange.valueChange !== undefined) {
        decodedChange.valueChange = encodedChange.valueChange;
    }

    if (encodedChange.fieldChanges !== undefined) {
        decodedChange.fieldChanges = decodeJsonFormat0(fieldKinds, encodedChange.fieldChanges);
    }

    return decodedChange;
}
