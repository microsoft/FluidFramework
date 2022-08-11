/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { SequenceChangeset } from "./sequenceChangeset";

export type SequenceChangeRebaser = ChangeRebaser<SequenceChangeset>;

function compose(changes: SequenceChangeset[]): SequenceChangeset {
    throw Error("Not implemented"); // TODO
}

function invert(changes: SequenceChangeset): SequenceChangeset {
    throw Error("Not implemented"); // TODO
 }

function rebase(change: SequenceChangeset, over: SequenceChangeset): SequenceChangeset {
    throw Error("Not implemented"); // TODO
}

function rebaseAnchors(anchor: AnchorSet, over: SequenceChangeset): void {}

export const sequenceChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
    rebaseAnchors,
};
