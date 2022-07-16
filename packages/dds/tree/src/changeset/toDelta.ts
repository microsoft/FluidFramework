/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, Transposed as T } from ".";

export function toDelta(change: T.Changeset): Delta.Root {
    return toPositionedMarks(change.marks);
}

function toPositionedMarks(marks: T.PositionedMarks): Delta.Root {
    const out: Delta.MarkWithOffset<Delta.Mark>[] = [];
    for (const { offset, mark } of marks) {
        if (Array.isArray(mark)) {
            for (const attach of mark) {
                
            }
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {

            }
        }
    }
    return out;
}