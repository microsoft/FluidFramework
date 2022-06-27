/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { Quorum } from "./quorum";
import { IQuorum } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that produces the Quorum
 */
export class QuorumFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/quorum";

    public static readonly Attributes: IChannelAttributes = {
        type: QuorumFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type(): string {
        return QuorumFactory.Type;
    }

    public get attributes(): IChannelAttributes {
        return QuorumFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<IQuorum> {
        const quorum = new Quorum(id, runtime, attributes);
        await quorum.load(services);
        return quorum;
    }

    public create(document: IFluidDataStoreRuntime, id: string): IQuorum {
        const quorum = new Quorum(id, document, this.attributes);
        quorum.initializeLocal();
        return quorum;
    }
}
