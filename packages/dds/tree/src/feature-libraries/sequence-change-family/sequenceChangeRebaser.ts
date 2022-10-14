/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser, RevisionTag } from "../../rebase";
import { AnchorSet } from "../../tree";
import { toDelta } from "./changeset";
import { SequenceChangeset } from "./sequenceChangeset";
import { compose } from "./compose";
import { invert } from "./invert";
import { rebase } from "./rebase";

export type SequenceChangeRebaser = ChangeRebaser<SequenceChangeset>;

function rebaseAnchors(anchors: AnchorSet, over: SequenceChangeset): void {
    anchors.applyDelta(toDelta(over));
}

function filterReferences(
    change: SequenceChangeset,
    _shouldRemoveReference: (revision: RevisionTag) => boolean,
): SequenceChangeset {
    return change;
}

export const sequenceChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
    rebaseAnchors,
    filterReferences,
};
