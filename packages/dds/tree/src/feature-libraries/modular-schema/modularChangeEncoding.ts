/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FieldKey,
    FieldKindIdentifier,
    GlobalFieldKey,
    isGlobalFieldKey,
    keyFromSymbol,
    LocalFieldKey,
    symbolFromKey,
} from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { FieldChangeMap, NodeChangeset, ValueChange } from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { getChangeHandler } from "./modularChangeFamily";

/**
 * Format for encoding as json.
 */
interface EncodedNodeChangeset {
    valueChange?: ValueChange;
    fieldChanges?: EncodedFieldChangeMap;
}

/**
 * Format for encoding as json.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also allows dealing with global vs local field key disambiguation via a flag on the field.
 */
type EncodedFieldChangeMap = EncodedFieldChange[];

interface EncodedFieldChange {
    fieldKey: LocalFieldKey | GlobalFieldKey;
    keyIsGlobal: boolean;
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
    const encodedFields: EncodedFieldChangeMap & JsonCompatibleReadOnly = [];
    for (const [field, fieldChange] of change) {
        const encodedChange = getChangeHandler(
            fieldKinds,
            fieldChange.fieldKind,
        ).encoder.encodeForJson(0, fieldChange.change, (childChange) =>
            encodeNodeChangesForJson(fieldKinds, childChange),
        );

        const global = isGlobalFieldKey(field);
        const fieldKey: LocalFieldKey | GlobalFieldKey = global ? keyFromSymbol(field) : field;
        const encodedField: EncodedFieldChange = {
            fieldKey,
            keyIsGlobal: global,
            fieldKind: fieldChange.fieldKind,
            change: encodedChange,
        };

        encodedFields.push(encodedField);
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
    for (const field of encodedChange) {
        const fieldChangeset = getChangeHandler(fieldKinds, field.fieldKind).encoder.decodeJson(
            0,
            field.change,
            (encodedChild) => decodeNodeChangesetFromJson(fieldKinds, encodedChild),
        );

        const fieldKey: FieldKey = field.keyIsGlobal
            ? symbolFromKey(brand<GlobalFieldKey>(field.fieldKey))
            : brand<LocalFieldKey>(field.fieldKey);

        decodedFields.set(fieldKey, {
            fieldKind: field.fieldKind,
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
        decodedChange.fieldChanges = decodeJsonFormat0(
            fieldKinds,
            encodedChange.fieldChanges as unknown as JsonCompatibleReadOnly,
        );
    }

    return decodedChange;
}
