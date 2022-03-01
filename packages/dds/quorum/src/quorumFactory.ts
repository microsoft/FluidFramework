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
 * The factory that defines the task queue
 */
export class QuorumFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/task-manager";

    public static readonly Attributes: IChannelAttributes = {
        type: QuorumFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return QuorumFactory.Type;
    }

    public get attributes() {
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
        const taskQueue = new Quorum(id, runtime, attributes);
        await taskQueue.load(services);
        return taskQueue;
    }

    public create(document: IFluidDataStoreRuntime, id: string): IQuorum {
        const taskQueue = new Quorum(id, document, this.attributes);
        taskQueue.initializeLocal();
        return taskQueue;
    }
}
