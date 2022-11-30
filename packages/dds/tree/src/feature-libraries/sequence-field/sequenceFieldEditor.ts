/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor, RevisionTag } from "../../core";
import { FieldEditor } from "../modular-schema";
import { Changeset, Mark, NodeChangeType } from "./format";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
    insert(index: number, cursor: ITreeCursor | ITreeCursor[]): Changeset<never>;
    delete(index: number, count: number): Changeset<never>;
    revive(
        index: number,
        count: number,
        detachIndex: number,
        revision: RevisionTag,
    ): Changeset<never>;

    /**
     *
     * @param sourceIndex - The index of the first node move
     * @param count - The number of nodes to move
     * @param destIndex - The index the nodes should be moved to, interpreted after removing the moving nodes
     */
    move(sourceIndex: number, count: number, destIndex: number): Changeset<never>;
}

export const sequenceFieldEditor = {
    buildChildChange: <TNodeChange = NodeChangeType>(
        index: number,
        change: TNodeChange,
    ): Changeset<TNodeChange> => markAtIndex(index, { type: "Modify", changes: change }),
    insert: (index: number, cursors: ITreeCursor | ITreeCursor[]): Changeset<never> =>
        markAtIndex(index, {
            type: "Insert",
            id: 0,
            content: Array.isArray(cursors)
                ? cursors.map(jsonableTreeFromCursor)
                : [jsonableTreeFromCursor(cursors)],
        }),
    delete: (index: number, count: number): Changeset<never> =>
        count === 0 ? [] : markAtIndex(index, { type: "Delete", id: 0, count }),
    revive: (
        index: number,
        count: number,
        detachIndex: number,
        revision: RevisionTag,
    ): Changeset<never> =>
        count === 0
            ? []
            : markAtIndex(index, {
                  type: "Revive",
                  id: 0,
                  count,
                  detachedBy: revision,
                  detachIndex,
              }),
    move(sourceIndex: number, count: number, destIndex: number): Changeset<never> {
        if (count === 0 || sourceIndex === destIndex) {
            // TODO: Should we allow creating a move which has no observable effect?
            return [];
        }

        const moveOut: Mark<never> = {
            type: "MoveOut",
            id: 0,
            count,
        };

        const moveIn: Mark<never> = {
            type: "MoveIn",
            id: 0,
            count,
        };

        return sourceIndex < destIndex
            ? [sourceIndex, moveOut, destIndex - sourceIndex, moveIn]
            : [destIndex, moveIn, sourceIndex - destIndex, moveOut];
    },
};

function markAtIndex<TNodeChange>(index: number, mark: Mark<TNodeChange>): Changeset<TNodeChange> {
    return index === 0 ? [mark] : [index, mark];
}
