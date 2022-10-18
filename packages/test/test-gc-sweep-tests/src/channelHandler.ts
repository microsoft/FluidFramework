/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedCell } from "@fluidframework/cell";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { Ink, IPen, IColor, IInkPoint } from "@fluidframework/ink";
import { ISharedDirectory, SharedMap } from "@fluidframework/map";
import { ConsensusQueue, ConsensusResult } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
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

/**
 * TODO: handlers to add - SharedDirectoryHandler, SharedMatrixHandler and SharedStringHandler
 * all these DDSes can serialize and deserialize handles.
 *
 * The OpManagers were written to isolate the logic out of the TestDataObject that was responsible for
 * creating and receiving ops from how each individual channel worked.
 */
export class ConsensusQueueHandler implements IHandleOpManager {
    constructor(
        public readonly channel: ConsensusQueue<IFluidHandle>,
    ) {}
    public readonly type: string = "ConsensusQueueHandler";

    private static readonly handleKey: string = "ConsensusQueueHandle";

    public async addHandle(handle: IFluidHandle): Promise<IAddedHandle> {
        await this.channel.add(handle);
        return {
            addedHandleKey: ConsensusQueueHandler.handleKey,
        };
    }

    public async removeRandomHandle(random: IRandom): Promise<IRemovedHandle> {
        let result: IFluidHandle | undefined;
        const setValue = async (value: IFluidHandle): Promise<ConsensusResult> => {
            result = value;
            return ConsensusResult.Complete;
        };

        await (random.bool() ? this.channel.acquire(setValue) : this.channel.waitAndAcquire(setValue));
        assert(result !== undefined, `ConsensusQueue removed nothing from the queue!`);

        return {
            handle: result,
            key: ConsensusQueueHandler.handleKey,
        };
    }

    public hasHandles(): boolean {
        return true;
    }
}

// TODO: make this more like SharedMapHandler
export class ConsensusRegisterCollectionHandler implements IHandleOpManager {
    constructor(
        private readonly root: ISharedDirectory,
        // eslint-disable-next-line @rushstack/no-new-null
        public readonly channel: ConsensusRegisterCollection<IFluidHandle | null>,
    ) {}
    public readonly type: string = "ConsensusRegisterCollectionHandler";

    private readonly handlesKey: string = "CRCHandles";

    public async addHandle(handle: IFluidHandle, random: IRandom): Promise<IAddedHandle> {
        const key = handle.absolutePath + random.string(10);
        const oldHandle = this.channel.read(key);
        await this.channel.write(key, handle);
        const keys = this.getKeys();
        keys.add(key);
        this.updateKeys(keys);
        return {
            addedHandleKey: key,
            removedHandle: (oldHandle !== undefined && oldHandle !== null) ? {
                key,
                handle: oldHandle,
            } : undefined,
        };
    }

    public async removeRandomHandle(random: IRandom): Promise<IRemovedHandle> {
        const keys = this.getKeys();
        assert(this.hasHandles(), "Attempting to remove a handle with no keys in ConsensusRegisterCollection!");
        const key = random.pick(Array.from(keys.values()));
        const oldHandle = this.channel.read(key);
        assert(oldHandle !== undefined && oldHandle !== null,
            `ConsensusRegisterCollection removed nothing from register: ${key}!`);
        await this.channel.write(key, null);
        keys.delete(key);
        this.updateKeys(keys);
        return {
            handle: oldHandle,
            key,
        };
    }

    public hasHandles(): boolean {
        return this.getKeys().size > 0;
    }

    private getKeys(): Set<string> {
        const keys = this.root.get<string[]>(this.handlesKey) ?? [];
        return new Set(keys);
    }

    private updateKeys(keys: Set<string>) {
        this.root.set<string[]>(this.handlesKey, Array.from(keys));
    }
}

export class InkHandler implements IRandomOpManager {
    constructor(
        public readonly channel: Ink,
    ) {}

    private createRandomStroke(random: IRandom) {
        const color: IColor = {
            r: random.integer(0, 256),
            g: random.integer(0, 256),
            b: random.integer(0, 256),
            a: random.integer(0, 100),
        };
        const pen: IPen = {
            color,
            thickness: random.integer(1, 10),
        };
        this.channel.createStroke(pen);
    }

    private writeRandomStroke(random: IRandom) {
        let strokes = this.channel.getStrokes();
        if (strokes.length === 0) {
            this.createRandomStroke(random);
            strokes = this.channel.getStrokes();
        }
        const stroke = random.pick(strokes);
        const point: IInkPoint = {
            x: random.integer(1, 1000),
            y: random.integer(1, 1000),
            time: random.integer(1, 1000),
            pressure: random.integer(1, 1000),
        };

        this.channel.appendPointToStroke(point, stroke.id);
    }

    public async executeRandomNonHandleOp(random: IRandom): Promise<void> {
        const randNum = random.integer(1, 3);
        switch (randNum) {
            case 1:
                this.createRandomStroke(random);
                break;
            case 2:
                this.writeRandomStroke(random);
                break;
            default:
                this.channel.clear();
        }
    }
}

export class SharedCellHandler implements IHandleOpManager {
    constructor(
        public readonly channel: SharedCell<IFluidHandle>,
    ) {}
    public readonly type: string = "SharedCellHandler";

    private static readonly handleKey: string = "SharedCell";

    public async addHandle(handle: IFluidHandle): Promise<IAddedHandle> {
        const oldHandle = this.channel.get();
        this.channel.set(handle);
        return {
            addedHandleKey: SharedCellHandler.handleKey,
            removedHandle: oldHandle ? {
                key: SharedCellHandler.handleKey,
                handle: oldHandle,
            } : undefined,
        };
    }

    public async removeRandomHandle(random: IRandom): Promise<IRemovedHandle> {
        const handle = this.channel.get();
        assert(handle !== undefined, `Attempting to remove a handle from an empty SharedCell!`);
        this.channel.delete();
        return {
            handle,
            key: SharedCellHandler.handleKey,
        };
    }

    public hasHandles(): boolean {
        return this.channel.get() !== undefined;
    }
}

export class SharedCounterHandler implements IRandomOpManager {
    constructor(
        public readonly channel: SharedCounter,
    ) {}

    public async executeRandomNonHandleOp(random: IRandom): Promise<void> {
        this.channel.increment(random.integer(1, 10));
    }
}

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
