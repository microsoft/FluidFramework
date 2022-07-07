/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Index, SummaryElement } from "../shared-tree-core";
import { Invariant } from "../util";

/**
 * Index which provides an editable forest for the current state for the document.
 *
 * Maintains part of the document in memory, but can fetch more on demand.
 *
 * Used to capture snapshots of document for summaries.
 */
export class ForestIndex<TChangeSet> implements Index<TChangeSet> {
    _typeCheck!: Invariant<TChangeSet>;

    readonly key: string = "Forest";

    // TODO: implement this to provide snapshots in summaries.
    readonly summaryElement?: SummaryElement = undefined;

    newLocalState?(changeDelta: TChangeSet): void {
        // TODO: apply changeDelta to the forest.
        throw new Error("Method not implemented.");
    }
}
