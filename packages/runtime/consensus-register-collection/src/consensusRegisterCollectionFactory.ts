/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@microsoft/fluid-component-runtime-definitions";
import { ConsensusRegisterCollection } from "./consensusRegisterCollection";
import { IConsensusRegisterCollection, IConsensusRegisterCollectionFactory } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the consensus queue
 */
export class ConsensusRegisterCollectionFactory implements IConsensusRegisterCollectionFactory {
    public static Type = "https://graph.microsoft.com/types/consensus-register-collection";

    public static readonly Attributes: IChannelAttributes = {
        type: ConsensusRegisterCollectionFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return ConsensusRegisterCollectionFactory.Type;
    }

    public get attributes() {
        return ConsensusRegisterCollectionFactory.Attributes;
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<IConsensusRegisterCollection> {
        const collection = new ConsensusRegisterCollection(id, runtime, attributes);
        await collection.load(branchId, services);
        return collection;
    }

    public create(document: IComponentRuntime, id: string): IConsensusRegisterCollection {
        const collection = new ConsensusRegisterCollection(id, document, ConsensusRegisterCollectionFactory.Attributes);
        collection.initializeLocal();
        return collection;
    }
}
