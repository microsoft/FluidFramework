/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toDelta } from "../../changeset";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { SequenceChangeset } from "./sequenceChangeset";

export type SequenceChangeRebaser = ChangeRebaser<SequenceChangeset>;

function compose(changes: SequenceChangeset[]): SequenceChangeset {
    if (changes.length === 1) {
        return changes[0];
    }

    throw Error("Not implemented"); // TODO
}

function invert(changes: SequenceChangeset): SequenceChangeset {
    throw Error("Not implemented"); // TODO
 }

function rebase(change: SequenceChangeset, over: SequenceChangeset): SequenceChangeset {
    throw Error("Not implemented"); // TODO
}

function rebaseAnchors(anchors: AnchorSet, over: SequenceChangeset): void {
    anchors.applyDelta(toDelta(over));
}

export const sequenceChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
    rebaseAnchors,
};
