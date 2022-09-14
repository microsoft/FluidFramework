/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldEditor } from "../modular-schema";
import * as F from "./format";

export type SequenceFieldEditor = FieldEditor<F.SequenceChange>;

export const sequenceFieldEditor: SequenceFieldEditor = {
    buildChildChange,
};

function buildChildChange(childIndex: number, change: F.NodeChangeType): F.SequenceChange {
    const modify: F.Modify = { type: "Modify", changes: change };
    return childIndex === 0 ? [modify] : [childIndex, modify];
}
