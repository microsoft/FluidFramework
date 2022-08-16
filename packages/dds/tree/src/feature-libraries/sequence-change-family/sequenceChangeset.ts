/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
import { ChangeEncoder, JsonCompatible } from "../../change-family";
import { Transposed as T } from "../../changeset";

export type SequenceChangeset = T.LocalChangeset;

class SequenceChangeEncoder extends ChangeEncoder<SequenceChangeset> {
    public encodeForJson(formatVersion: number, change: SequenceChangeset): JsonCompatible {
        return change as unknown as JsonCompatible;
    }

    public decodeJson<T>(formatVersion: number, change: Jsonable<T>): SequenceChangeset {
        return change as unknown as SequenceChangeset;
    }
}

export const sequenceChangeEncoder: ChangeEncoder<SequenceChangeset> = new SequenceChangeEncoder();
