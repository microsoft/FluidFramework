/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Delta } from "../../tree";

export interface MockChildChange {
    intentions: number[];
    /**
     * The last known intention to be applied before this change.
     * Can be left unspecified to bypass validation.
     */
    ref?: number;
}

export function mockChildChangeRebaser(
    change: MockChildChange,
    baseChange: MockChildChange,
): MockChildChange {
    assert(change.ref === baseChange.ref, "Invalid input passed to child rebaser");
    return change.ref === undefined
        ? change
        : {
            intentions: change.intentions,
            ref: baseChange.intentions[baseChange.intentions.length - 1],
        }
    ;
}

export function mockChildChangeInverter(change: MockChildChange): MockChildChange {
    return change.ref === undefined
        ? {
            intentions: change.intentions.map((i) => -i).reverse(),
        }
        : {
            intentions: change.intentions.map((i) => -i).reverse(),
            ref: change.intentions[change.intentions.length - 1],
        }
    ;
}

export function mockChildChangeComposer(changes: MockChildChange[]): MockChildChange {
    if (changes.length <= 1) {
        return changes[0];
    }
    const id: number[] = [];
    changes.forEach((change, i) => {
        if (change.ref !== undefined && i > 0) {
            const prev = changes[i - 1].intentions;
            assert(i === 0 || change.ref === prev[prev.length - 1], "Invalid input to child composer");
        }
        id.push(...change.intentions);
    });
    return {
        intentions: id,
        ref: changes[0].ref,
    };
}

export function mockChildChangeToDelta(change: MockChildChange): Delta.Modify {
    return {
        type: Delta.MarkType.Modify,
        setValue: change.intentions.map(String).join("|"),
    };
}
