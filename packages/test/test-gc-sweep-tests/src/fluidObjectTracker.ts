/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { IChannelPath } from "./handlesTracker";
import { DataObjectManyDDSes } from "./testDataObjects";

/**
 * A path from a DataStore to its DDS
 */
export interface IFluidObjectPath {
    dataStoreId: string; // which DataStore/DataObject?
    ddsId?: string; // which DDS/SharedObject?
}

/**
 * FluidObjectTracker is responsible for tracking where any FluidObject may reside
 */
export class FluidObjectTracker {
    private readonly allFluidObjects: Map<string, IFluidObjectPath> = new Map();
    // Channels that can store handles
    private readonly handleChannels: Map<string, IChannelPath> = new Map();

    private get usableFluidObjects(): IFluidObjectPath[] {
        // TODO: add logic to filter out handles to unreferenced datastores that will be deleted.
        return Array.from(this.allFluidObjects.values());
    }

    private get handleChannelPaths(): IChannelPath[] {
        return Array.from(this.handleChannels.values());
    }

    public getRandomFluidObject(random: IRandom): IFluidObjectPath {
        return random.pick(this.usableFluidObjects);
    }

    // Path to a random channel that can store handles
    public getRandomHandleChannel(random: IRandom): IChannelPath {
        return random.pick(this.handleChannelPaths);
    }

    public trackDataObject(dataObject: DataObjectManyDDSes) {
        // add the dataObject
        this.addFluidObject({ dataStoreId: dataObject.id });
        // add all the channels of the dataObject
        for (const id of dataObject.getChannelIds()) {
            this.addFluidObject({ dataStoreId: dataObject.id, ddsId: id });
        }
        // track all the channels fo the dataObject that can add handles
        for (const id of dataObject.getHandleChannelIds()) {
            this.addChannel({ dataStoreId: dataObject.id, ddsId: id });
        }
    }

    private addFluidObject(fluidObject: IFluidObjectPath) {
        const key = fluidObject.ddsId ? `${fluidObject.dataStoreId}/${fluidObject.ddsId}` : fluidObject.dataStoreId;
        assert(!this.allFluidObjects.has(key), "We should not be adding available Fluid Objects of the same path!");
        this.allFluidObjects.set(key, fluidObject);
    }

    private addChannel(channel: IChannelPath) {
        const key = `${channel.dataStoreId}/${channel.ddsId}`;
        assert(!this.handleChannels.has(key), "We should not be adding available Channels of the same path!");
        this.handleChannels.set(key, channel);
    }
}
