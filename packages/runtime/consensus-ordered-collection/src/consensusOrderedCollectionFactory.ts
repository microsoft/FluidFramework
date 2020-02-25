/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ConsensusQueue } from "./consensusQueue";
import { IConsensusOrderedCollection, IConsensusOrderedCollectionFactory } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the consensus queue
 */
export class ConsensusQueueFactory implements IConsensusOrderedCollectionFactory {
    public static Type = "https://graph.microsoft.com/types/consensus-queue";

    public static Attributes: IChannelAttributes = {
        type: ConsensusQueueFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion : pkgVersion,
    };

    public get type() {
        return ConsensusQueueFactory.Type;
    }

    public get attributes() {
        return ConsensusQueueFactory.Attributes;
    }

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<IConsensusOrderedCollection> {

        const collection = new ConsensusQueue(id, document);
        await collection.load(branchId, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusOrderedCollection {
        const collection = new ConsensusQueue(id, document);
        collection.initializeLocal();
        return collection;
    }
}
