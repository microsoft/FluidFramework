/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@fluidframework/component-runtime-definitions";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { SharedCounter } from "./counter";
import { ISharedCounter } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the counter
 */
export class CounterFactory implements ISharedObjectFactory {
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

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedCounter> {
        const counter = new SharedCounter(id, runtime, attributes);
        await counter.load(branchId, services);
        return counter;
    }

    public create(document: IComponentRuntime, id: string): ISharedCounter {
        const counter = new SharedCounter(id, document, this.attributes);
        counter.initializeLocal();
        return counter;
    }
}
