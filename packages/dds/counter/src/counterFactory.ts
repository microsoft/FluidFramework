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
import { SharedCounter } from "./counter";
import { ISharedCounter } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the counter
 */
export class CounterFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/counter";

    public static readonly Attributes: IChannelAttributes = {
        type: CounterFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return CounterFactory.Type;
    }

    public get attributes() {
        return CounterFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedCounter> {
        const counter = new SharedCounter(id, runtime, attributes);
        await counter.load(services);
        return counter;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedCounter {
        const counter = new SharedCounter(id, document, this.attributes);
        counter.initializeLocal();
        return counter;
    }
}
