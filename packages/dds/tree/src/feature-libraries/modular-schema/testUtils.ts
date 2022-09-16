/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Delta } from "../../tree";

export interface MockChildChange {
    intentions: number[];
    ref: number;
}

export function mockChildChangeRebaser(
    change: MockChildChange,
    baseChange: MockChildChange,
): MockChildChange {
    assert(change.ref === baseChange.ref, "Invalid input passed to child rebaser");
    return {
        intentions: change.intentions,
        ref: baseChange.intentions[baseChange.intentions.length - 1],
    };
}

export function mockChildChangeInverter(change: MockChildChange): MockChildChange {
    return {
        intentions: change.intentions.map((i) => -i).reverse(),
        ref: change.intentions[change.intentions.length - 1],
    };
}

export function mockChildChangeComposer(changes: MockChildChange[]): MockChildChange {
    if (changes.length <= 1) {
        return changes[0];
    }
    const id: number[] = [];
    changes.forEach((change, i) => {
        const prev = changes[i - 1].intentions;
        assert(i === 0 || change.ref === prev[prev.length - 1], "Invalid input to child composer");
        id.push(...change.intentions);
    });
    return {
        intentions: id,
        ref: changes[0].ref,
    };
}

export function mockChildChangeToDelta(change: MockChildChange): Delta.Modify {
    return { type: Delta.MarkType.Modify, setValue: { value: change.intentions.map(String).join("|") } };
}
