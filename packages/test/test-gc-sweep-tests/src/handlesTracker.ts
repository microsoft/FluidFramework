/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRandom } from "@fluid-internal/stochastic-test-utils";

export interface IChannelPath {
    dataStoreId: string; // which DataStore/DataObject?
    ddsId: string; // which DDS/SharedObject?
}

export interface IHandlePath extends IChannelPath {
    handleKey: string; // this allows for the storage of multiple of the same handles in a DDS
    handlePath: string; // handle.absolutePath
    actionNumber: number; // For tracking purposes
}

export interface IHandleRecord {
    action: string;
    data: IHandlePath;
    timestamp: number;
}

// We will want to keep these values consistent so that we can reproduce old versions of this test.
const addedHandlePath = "addedHandlePath";
const removedHandlePath = "removedHandlePath";

export class HandleTracker {
    private readonly removePaths: IChannelPath[] = [];
    private readonly handlePaths: Map<string, IHandlePath> = new Map();
    public readonly handleActionRecord: IHandleRecord[] = [];
    constructor(private readonly testStart: number) {}

    public get addedPaths(): [string, IHandlePath][] {
        return Array.from(this.handlePaths.entries());
    }

    public get removablePaths(): IChannelPath[] {
        return Array.from(this.removePaths);
    }

    private getKey(handlePath: IHandlePath): string {
        return `${handlePath.dataStoreId}/${handlePath.ddsId}/${handlePath.handleKey}`;
    }

    public hasHandlePaths() {
        return this.removePaths.length > 0;
    }

    public addHandlePath(handlePath: IHandlePath) {
        const key = this.getKey(handlePath);
        if (!this.handlePaths.has(key)) {
            assert(this.removePaths.length <= this.handlePaths.size,
                // eslint-disable-next-line max-len
                `Adding more remove paths than handlePaths! Path: ${JSON.stringify(handlePath)}\n Handles: ${JSON.stringify(Array.from(this.handlePaths.entries()))}\n Removes: ${JSON.stringify(this.removePaths)}`);
            this.removePaths.push(handlePath);
        }
        this.handlePaths.set(key, handlePath);

        this.handleActionRecord.push({
            action: addedHandlePath,
            data: handlePath,
            timestamp: Date.now() - this.testStart,
        });
    }

    public removeHandlePath(handlePath: IHandlePath) {
        const key = this.getKey(handlePath);
        const removedHandle = this.handlePaths.get(key);
        assert(removedHandle !== undefined,
            `removing handles where there are none! ${JSON.stringify(handlePath)}`);

        this.handlePaths.delete(key);
        this.handleActionRecord.push({
            action: removedHandlePath,
            data: handlePath,
            timestamp: Date.now() - this.testStart,
        });
    }

    public removeRemovePath(channelPath: IChannelPath) {
        const removePath = this.removePaths.find((path) => {
            return path.dataStoreId === channelPath.dataStoreId &&
                path.ddsId === channelPath.ddsId;
        });
        assert(removePath !== undefined, `${channelPath} remove path not found!`);
        this.removePaths.splice(this.removePaths.indexOf(removePath), 1);
    }

    public getChannelWithHandle(random: IRandom): IChannelPath {
        assert(this.removePaths.length > 0, `there should be removable handles!`);
        const channelPath = random.pick(this.removePaths);
        this.removeRemovePath(channelPath);
        return channelPath;
    }
}
