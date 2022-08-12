/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
    ForestIndex,
    ObjectForest,
    SchemaIndex,
    sequenceChangeFamily,
    SequenceChangeFamily,
    SequenceChangeset,
    SequenceEditBuilder,
} from "../feature-libraries";
import { IEditableForest, IForestSubscription } from "../forest";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { Checkout, runSynchronousTransaction, TransactionResult } from "../transaction";
import { AnchorSet } from "../tree";

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree extends SharedTreeCore<SequenceChangeset, SequenceChangeFamily>
    implements Checkout<SequenceEditBuilder, SequenceChangeset> {
    public forest: IEditableForest;

    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
            const anchors = new AnchorSet();
            const forest = new ObjectForest(anchors);
            const indexes: Index<SequenceChangeset>[] = [
                new SchemaIndex(runtime, forest.schema),
                new ForestIndex(runtime, forest),
            ];
            super(
                indexes,
                sequenceChangeFamily, anchors, id, runtime, attributes, telemetryContextPrefix,
                );

            this.forest = forest;
    }

    public runTransaction(transaction: (
        forest: IForestSubscription,
        editor: SequenceEditBuilder,
    ) => TransactionResult): TransactionResult {
        return runSynchronousTransaction(this, transaction);
    }
}
