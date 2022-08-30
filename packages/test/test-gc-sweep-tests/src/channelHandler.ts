/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMap } from "@fluidframework/map";
import { IChannel } from "@fluidframework/datastore-definitions";
import { IRandom } from "@fluid-internal/stochastic-test-utils";

// All the necessary information for a handle that has been removed
export interface IRemovedHandle {
    handle: IFluidHandle;
    key: string;
}

// All the necessary information for a handle that has been added
// A IRemovedHandle is added if the added handle replaces another handle
export interface IAddedHandle {
    addedHandleKey: string;
    removedHandle?: IRemovedHandle;
}

// An object responsible for creating ops for a channel
export interface IOpManager {
    channel: IChannel;
}

// A manager responsible for creating non-handle ops for a channel
export interface IRandomOpManager extends IOpManager {
    executeRandomNonHandleOp(random: IRandom): Promise<void>;
}

/**
 * A manager responsible for adding and removing handles for a specific channel
 *
 * Note: not all channels can store handles.
 */
 export interface IHandleOpManager extends IOpManager {
    type: string;
    addHandle(handle: IFluidHandle, random: IRandom): Promise<IAddedHandle>;
    removeRandomHandle(random: IRandom): Promise<IRemovedHandle>;
    hasHandles(): boolean;
}

// Adds and removes handles, and creates non handle ops
export class SharedMapHandler implements IHandleOpManager, IRandomOpManager {
    constructor(
        public readonly channel: SharedMap,
    ) {}
    public readonly type: string = "SharedMapHandler";

    private readonly handleMapKey = "handleMap";

    public async executeRandomNonHandleOp(random: IRandom): Promise<void> {
        this.channel.set(`NotAHandleOp${random.string(10)}`, random.string(10));
    }

    public async addHandle(handle: IFluidHandle, random: IRandom): Promise<IAddedHandle> {
        const key = handle.absolutePath + random.string(10);
        const map = this.getHandleMap();
        const oldHandle: IFluidHandle | undefined = this.channel.get(key);
        this.channel.set(key, handle);
        map.set(key, handle);
        this.updateHandleMap(map);
        return {
            addedHandleKey: key,
            removedHandle: oldHandle ? {
                key,
                handle: oldHandle,
            } : undefined,
        };
    }

    public async removeRandomHandle(random: IRandom): Promise<IRemovedHandle> {
        const map = this.getHandleMap();
        assert(this.hasHandles(), "Removing handle from empty SharedMap!");
        const key = random.pick(Array.from(map.keys()));
        const handle: IFluidHandle | undefined = this.channel.get(key);
        assert(handle !== undefined, "Removing non existent handle on the SharedMap!");
        this.channel.delete(key);
        map.delete(key);
        this.updateHandleMap(map);
        return {
            handle,
            key,
        };
    }

    public hasHandles(): boolean {
        return this.getHandleMap().size > 0;
    }

    private getHandleMap(): Map<string, IFluidHandle> {
        const entries = this.channel.get(this.handleMapKey) ?? [];
        const map: Map<string, IFluidHandle> = new Map(entries);
        return map;
    }

    private updateHandleMap(map: Map<string, IFluidHandle>) {
        this.channel.set(this.handleMapKey, Array.from(map.entries()));
    }
}
