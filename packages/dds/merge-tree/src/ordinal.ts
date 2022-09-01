/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
import { assert } from "@fluidframework/common-utils";

export function computeOrdinal(
    maxCount: number,
    count: number,
    parentOrdinal: string,
    previousOrdinal: string | undefined) {
    const ordinalWidth = 1 << (maxCount - (count + 1));

    let ordinal: string;
     if (previousOrdinal === undefined) {
        ordinal = parentOrdinal + String.fromCharCode(ordinalWidth - 1);
     } else {
        const prevOrdCode = previousOrdinal.charCodeAt(previousOrdinal.length - 1);
        const localOrdinal = prevOrdCode + ordinalWidth;
        ordinal = parentOrdinal + String.fromCharCode(localOrdinal);
        assert(ordinal > previousOrdinal, 0x042 /* "Child ordinal <= previous sibling ordinal!" */);
     }

    assert(ordinal.length === (parentOrdinal.length + 1), 0x041 /* "Unexpected child ordinal length!" */);
    return ordinal;
}
