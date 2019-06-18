/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ConsensusRegisterCollection } from "./consensusRegisterCollection";
import { IConsensusRegisterCollection, IConsensusRegisterCollectionExtension } from "./interfaces";

/**
 * The extension that defines the consensus queue
 */
export class ConsensusRegisterCollectionExtension implements IConsensusRegisterCollectionExtension {
    public static Type = "https://graph.microsoft.com/types/consensus-register-collection";

    public type: string = ConsensusRegisterCollectionExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<IConsensusRegisterCollection> {

        const collection = new ConsensusRegisterCollection(id, document, ConsensusRegisterCollectionExtension.Type);
        await collection.load(minimumSequenceNumber, headerOrigin, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusRegisterCollection {
        const collection = new ConsensusRegisterCollection(id, document, ConsensusRegisterCollectionExtension.Type);
        collection.initializeLocal();
        return collection;
    }
}
