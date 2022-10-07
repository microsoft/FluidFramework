/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta } from "../../tree";
import { brand, JsonCompatibleReadOnly } from "../../util";
import {
    FieldChangeHandler,
    NodeChangeset,
    ToDelta,
    NodeChangeEncoder,
    NodeChangeDecoder,
    NodeChangeComposer,
    NodeChangeInverter,
    NodeChangeRebaser,
} from "./fieldChangeHandler";
import { FieldKind, Multiplicity } from "./fieldKind";

export interface GenericChange {
    index: number;
    nodeChange: NodeChangeset;
}

export interface EncodedGenericChange {
    index: number;
    nodeChange: JsonCompatibleReadOnly;
}

export type GenericChangeset = GenericChange[];
export type EncodedGenericChangeset = EncodedGenericChange[];

export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
    rebaser: {
        compose: (
            changes: GenericChangeset[],
            composeChildren: NodeChangeComposer,
        ): GenericChangeset => {
            if (changes.length === 0) {
                return [];
            }
            const composed: GenericChangeset = [];
            for (const change of changes) {
                let listIndex = 0;
                for (const { index, nodeChange } of change) {
                    // TODO: use binary search instead
                    while (listIndex < composed.length && composed[listIndex].index < index) {
                        listIndex += 1;
                    }
                    const match: GenericChange | undefined = composed[listIndex];
                    if (match === undefined) {
                        composed.push({ index, nodeChange });
                    } else if (match.index > index) {
                        composed.splice(listIndex, 0, { index, nodeChange });
                    } else {
                        composed.splice(listIndex, 1, {
                            index,
                            nodeChange: composeChildren([match.nodeChange, nodeChange]),
                        });
                    }
                }
            }
            return composed;
        },

        invert: (change: GenericChangeset, invertChild: NodeChangeInverter): GenericChangeset => {
            return change.map(
                ({ index, nodeChange }: GenericChange): GenericChange => ({
                    index,
                    nodeChange: invertChild(nodeChange),
                }),
            );
        },

        rebase: (
            change: GenericChangeset,
            over: GenericChangeset,
            rebaseChild: NodeChangeRebaser,
        ): GenericChangeset => {
            const rebased: GenericChangeset = [];
            let iChange = 0;
            let iOver = 0;
            while (iChange < change.length && iOver < over.length) {
                const a = change[iChange];
                const b = over[iOver];
                if (a.index === b.index) {
                    rebased.push({
                        index: a.index,
                        nodeChange: rebaseChild(a.nodeChange, b.nodeChange),
                    });
                    iChange += 1;
                    iOver += 1;
                } else if (a.index < b.index) {
                    rebased.push({ index: a.index, nodeChange: a.nodeChange });
                    iChange += 1;
                } else {
                    rebased.push({ index: b.index, nodeChange: b.nodeChange });
                    iOver += 1;
                }
            }
            rebased.push(...change.slice(iChange));
            rebased.push(...over.slice(iOver));
            return rebased;
        },
    },
    encoder: {
        encodeForJson(
            formatVersion: number,
            change: GenericChangeset,
            encodeChild: NodeChangeEncoder,
        ): JsonCompatibleReadOnly {
            // Would use `change.map(...)` but the type system doesn't accept it
            const encoded: JsonCompatibleReadOnly[] & EncodedGenericChangeset = [];
            for (const { index, nodeChange } of change) {
                encoded.push({ index, nodeChange: encodeChild(nodeChange) });
            }
            return encoded;
        },
        decodeJson: (
            formatVersion: number,
            change: JsonCompatibleReadOnly,
            decodeChild: NodeChangeDecoder,
        ): GenericChangeset => {
            const encoded = change as JsonCompatibleReadOnly[] & EncodedGenericChangeset;
            return encoded.map(
                ({ index, nodeChange }: EncodedGenericChange): GenericChange => ({
                    index,
                    nodeChange: decodeChild(nodeChange),
                }),
            );
        },
    },
    editor: {
        buildChildChange(index, change): GenericChangeset {
            return [{ index, nodeChange: change }];
        },
    },
    intoDelta: (change: GenericChangeset, deltaFromChild: ToDelta): Delta.MarkList => {
        let nodeIndex = 0;
        const delta: Delta.MarkList = [];
        for (const { index, nodeChange } of change) {
            if (nodeIndex < index) {
                const offset = index - nodeIndex;
                delta.push(offset);
                nodeIndex = index;
            }
            delta.push(deltaFromChild(nodeChange));
            nodeIndex += 1;
        }
        return delta;
    },
};

/**
 * FieldKind used to represent changes that are field-kind-agnostic.
 */
export const genericFieldKind: FieldKind = new FieldKind(
    brand("ModularEditBuilder.Generic"),
    Multiplicity.Sequence,
    genericChangeHandler,
    (types, other) => false,
    new Set(),
);

export function convertGenericChange<TChange>(
    changeset: GenericChangeset,
    target: FieldChangeHandler<TChange>,
    composeChild: NodeChangeComposer,
): TChange {
    const perIndex: TChange[] = changeset.map(({ index, nodeChange }) =>
        target.editor.buildChildChange(index, nodeChange),
    );
    return target.rebaser.compose(perIndex, composeChild);
}
