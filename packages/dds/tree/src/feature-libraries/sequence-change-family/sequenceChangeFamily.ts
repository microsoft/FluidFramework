/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily } from "../../change-family";
import { AnchorSet, Delta } from "../../tree";
import { sequenceChangeRebaser } from "./sequenceChangeRebaser";
import { SequenceChangeset } from "./sequenceChangeset";
import { SequenceEditBuilder } from "./sequenceEditBuilder";

function buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchorSet: AnchorSet): SequenceEditBuilder {
    return new SequenceEditBuilder(deltaReceiver, anchorSet);
}

function intoDelta(change: SequenceChangeset): Delta.Root {
    throw Error("Not implemented"); // TODO
}

export type SequenceChangeFamily = ChangeFamily<SequenceEditBuilder, SequenceChangeset>;

export const sequenceChangeFamily: SequenceChangeFamily = {
    rebaser: sequenceChangeRebaser,
    buildEditor,
    intoDelta,
};
