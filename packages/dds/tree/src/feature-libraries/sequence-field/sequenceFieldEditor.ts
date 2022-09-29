/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursor } from "../../forest";
import { FieldEditor } from "../modular-schema";
import { jsonableTreeFromCursor } from "../treeTextCursorLegacy";
import * as F from "./format";

export interface SequenceFieldEditor extends FieldEditor<F.Changeset> {
    insert(index: number, cursor: ITreeCursor | ITreeCursor[]): F.Changeset;
    delete(index: number, count: number): F.Changeset;
}

export const sequenceFieldEditor: SequenceFieldEditor = {
    buildChildChange: (index: number, change: F.NodeChangeType): F.Changeset =>
        markAtIndex(index, { type: "Modify", changes: change }),
    insert: (index: number, cursors: ITreeCursor | ITreeCursor[]): F.Changeset =>
        markAtIndex(
            index,
            {
                type: "Insert",
                id: 0,
                content: Array.isArray(cursors)
                    ? cursors.map(jsonableTreeFromCursor)
                    : [jsonableTreeFromCursor(cursors)]
                ,
            },
        ),
    delete: (index: number, count: number): F.Changeset =>
        markAtIndex(index, { type: "Delete", id: 0, count }),
};

function markAtIndex(index: number, mark: F.Mark): F.Changeset {
    return index === 0 ? [mark] : [index, mark];
}
