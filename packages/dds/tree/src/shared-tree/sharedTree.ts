/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannel,
    IChannelAttributes,
    IChannelFactory,
    IChannelServices,
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ICheckout, TransactionResult } from "../checkout";
import {
    defaultSchemaPolicy,
    ForestIndex, ObjectForest,
    SchemaIndex,
    sequenceChangeFamily,
    SequenceChangeFamily,
    SequenceChangeset,
    SequenceEditBuilder,
} from "../feature-libraries";
import { IForestSubscription } from "../forest";
import { StoredSchemaRepository } from "../schema-stored";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { Checkout as TransactionCheckout, runSynchronousTransaction } from "../transaction";
import { AnchorSet } from "../tree";

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 * TODO: expose or implement Checkout.
 */
export class SharedTree extends SharedTreeCore<SequenceChangeset, SequenceChangeFamily>
implements ICheckout<SequenceEditBuilder> {
    public readonly forest: IForestSubscription;
    /**
     * Rather than implementing TransactionCheckout, have a member that implements it.
     * This allows keeping the `IEditableForest` private.
     */
    private readonly transactionCheckout: TransactionCheckout<SequenceEditBuilder, SequenceChangeset>;

    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
            const anchors = new AnchorSet();
            const schema = new StoredSchemaRepository(defaultSchemaPolicy);
            const forest = new ObjectForest(schema, anchors);
            const indexes: Index<SequenceChangeset>[] = [
                new SchemaIndex(runtime, schema),
                new ForestIndex(runtime, forest),
            ];
            super(
                indexes,
                sequenceChangeFamily, anchors, id, runtime, attributes, telemetryContextPrefix,
                );

            this.forest = forest;
            this.transactionCheckout = {
                forest,
                changeFamily: this.changeFamily,
                submitEdit: (edit) => this.submitEdit(edit),
            };
    }

    public runTransaction(transaction: (
        forest: IForestSubscription,
        editor: SequenceEditBuilder,
    ) => TransactionResult): TransactionResult {
        return runSynchronousTransaction(this.transactionCheckout, transaction);
    }
}

/**
 * A channel factory that creates {@link SharedTree}s.
 */
 export class SharedTreeFactory implements IChannelFactory {
    public type: string = "SharedTree";

    public attributes: IChannelAttributes = {
        type: this.type,
        snapshotFormatVersion: "0.0.0",
        packageVersion: "0.0.0",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        const tree = new SharedTree(id, runtime, channelAttributes, "SharedTree");
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
        const tree = new SharedTree(id, runtime, this.attributes, "SharedTree");
        tree.initializeLocal();
        return tree;
    }
}
