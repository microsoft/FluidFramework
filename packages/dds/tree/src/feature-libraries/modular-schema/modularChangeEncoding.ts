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
import {
    ChangesetLocalId,
    FieldChangeMap,
    ModularChangeset,
    NodeChangeset,
    ValueChange,
} from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { getChangeHandler } from "./modularChangeFamily";

/**
 * Format for encoding as json.
 */
interface EncodedNodeChangeset {
    valueChange?: ValueChange;
    fieldChanges?: EncodedFieldChangeMap;
}

interface EncodedModularChangeset {
    maxId?: ChangesetLocalId;
    changes: EncodedFieldChangeMap;
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
    change: ModularChangeset,
): EncodedModularChangeset & JsonCompatibleReadOnly {
    return {
        maxId: change.maxId,
        changes: encodeFieldChangesForJson(fieldKinds, change.changes),
    };
}

function encodeFieldChangesForJson(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: FieldChangeMap,
): EncodedFieldChangeMap & JsonCompatibleReadOnly {
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
): EncodedNodeChangeset & JsonCompatibleReadOnly {
    const encodedChange: EncodedNodeChangeset & JsonCompatibleReadOnly = {};
    if (change.valueChange !== undefined) {
        encodedChange.valueChange = change.valueChange;
    }

    if (change.fieldChanges !== undefined) {
        const encodedFieldChanges = encodeFieldChangesForJson(fieldKinds, change.fieldChanges);
        encodedChange.fieldChanges = encodedFieldChanges as unknown as EncodedFieldChangeMap;
    }

    return encodedChange;
}

export function decodeJsonFormat0(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    change: JsonCompatibleReadOnly,
): ModularChangeset {
    const encodedChange = change as unknown as EncodedModularChangeset;
    const decoded: ModularChangeset = {
        changes: decodeFieldChangesFromJson(fieldKinds, encodedChange.changes),
    };
    if (encodedChange.maxId !== undefined) {
        decoded.maxId = encodedChange.maxId;
    }
    return decoded;
}

function decodeFieldChangesFromJson(
    fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
    encodedChange: EncodedFieldChangeMap,
): FieldChangeMap {
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
        decodedChange.fieldChanges = decodeFieldChangesFromJson(
            fieldKinds,
            encodedChange.fieldChanges,
        );
    }

    return decodedChange;
}
