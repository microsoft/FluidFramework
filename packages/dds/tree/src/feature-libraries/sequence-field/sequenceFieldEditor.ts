/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor } from "../../core";
import { FieldEditor } from "../modular-schema";
import { Changeset, Mark, NodeChangeType } from "./format";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
    insert(index: number, cursor: ITreeCursor | ITreeCursor[]): Changeset;
    delete(index: number, count: number): Changeset;
}

export const sequenceFieldEditor: SequenceFieldEditor = {
    buildChildChange: (index: number, change: NodeChangeType): Changeset =>
        markAtIndex(index, { type: "Modify", changes: change }),
    insert: (index: number, cursors: ITreeCursor | ITreeCursor[]): Changeset =>
        markAtIndex(index, {
            type: "Insert",
            id: 0,
            content: Array.isArray(cursors)
                ? cursors.map(jsonableTreeFromCursor)
                : [jsonableTreeFromCursor(cursors)],
        }),
    delete: (index: number, count: number): Changeset =>
        count === 0 ? [] : markAtIndex(index, { type: "Delete", id: 0, count }),
};

function markAtIndex(index: number, mark: Mark): Changeset {
    return index === 0 ? [mark] : [index, mark];
}
