import { IComponentRuntime, IDistributedObjectServices } from "@prague/runtime-definitions";
import { ConsensusQueue } from "./consensusQueue";
import { ConsensusStack } from "./consensusStack";
import { IConsensusOrderedCollection, IConsensusOrderedCollectionExtension } from "./interfaces";

/**
 * The extension that defines the consensus queue
 */
export class ConsensusQueueExtension implements IConsensusOrderedCollectionExtension {
    public static Type = "https://graph.microsoft.com/types/consensus-queue";

    public type: string = ConsensusQueueExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IConsensusOrderedCollection> {

        const collection = new ConsensusQueue(id, document);
        await collection.load(minimumSequenceNumber, headerOrigin, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusOrderedCollection {
        const collection = new ConsensusQueue(id, document);
        collection.initializeLocal();
        return collection;
    }
}

/**
 * The extension that defines the consensus stack
 */
export class ConsensusStackExtension implements IConsensusOrderedCollectionExtension {
    public static Type = "https://graph.microsoft.com/types/consensus-stack";

    public type: string = ConsensusStackExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IConsensusOrderedCollection> {

        const collection = new ConsensusStack(id, document);
        await collection.load(minimumSequenceNumber, headerOrigin, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusOrderedCollection {
        const collection = new ConsensusStack(id, document);
        collection.initializeLocal();
        return collection;
    }
}
