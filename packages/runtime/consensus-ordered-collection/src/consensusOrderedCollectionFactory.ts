/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ConsensusQueue } from "./consensusQueue";
import { ConsensusStack } from "./consensusStack";
import { IConsensusOrderedCollection, IConsensusOrderedCollectionFactory } from "./interfaces";

/**
 * The factory that defines the consensus queue
 */
export class ConsensusQueueFactory implements IConsensusOrderedCollectionFactory {
    public static Type = "https://graph.microsoft.com/types/consensus-queue";

    public type: string = ConsensusQueueFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

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

/**
 * The factory that defines the consensus stack
 */
export class ConsensusStackFactory implements IConsensusOrderedCollectionFactory {
    public static Type = "https://graph.microsoft.com/types/consensus-stack";

    public type: string = ConsensusStackFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<IConsensusOrderedCollection> {

        const collection = new ConsensusStack(id, document);
        await collection.load(branchId, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusOrderedCollection {
        const collection = new ConsensusStack(id, document);
        collection.initializeLocal();
        return collection;
    }
}
