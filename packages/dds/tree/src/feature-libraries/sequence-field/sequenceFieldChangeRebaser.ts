/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../../rebase";
import { FieldChangeRebaser } from "../modular-schema";
import { compose } from "./compose";
import { Changeset, Mark } from "./format";
import { invert } from "./invert";
import { rebase } from "./rebase";
import { isSkipMark } from "./utils";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

type NodeChangeReferenceFilter<TNodeChange> = (change: TNodeChange) => TNodeChange;

function filterMarkReferences<TNodeChange>(
    mark: Mark<TNodeChange>,
    _shouldRemoveReference: (revision: RevisionTag) => boolean,
    filterChild: NodeChangeReferenceFilter<TNodeChange>,
): Mark<TNodeChange> {
    if (isSkipMark(mark)) {
        return mark;
    }

    switch (mark.type) {
        case "Modify":
            return {
                ...mark,
                changes: filterChild(mark.changes),
            };
        default: {
            return mark;
        }
    }
}

function filterReferences<TNodeChange>(
    change: Changeset<TNodeChange>,
    shouldRemoveReference: (revision: RevisionTag) => boolean,
    filterChild: NodeChangeReferenceFilter<TNodeChange>,
): Changeset<TNodeChange> {
    return change.map(mark => filterMarkReferences(mark, shouldRemoveReference, filterChild));
}

export const sequenceFieldChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
    filterReferences,
};
