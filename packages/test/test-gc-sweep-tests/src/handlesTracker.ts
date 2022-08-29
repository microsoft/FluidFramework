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

/**
 * dataStoreId represents the DataStore that has the handle stored.
 * ddsId represents the DDS that has the handle stored.
 * handleKey is the key used to represent a unique Handle, currently, it does not guarantee the retrieval of the Handle
 * handlePath is the absolute path of the handle
 * actionNumber is the action when the handle was stored
 */
export interface IHandlePath extends IChannelPath {
    handleKey: string; // this allows for the storage of multiple of the same handles in a DDS
    handlePath: string; // handle.absolutePath
    actionNumber: number; // For tracking purposes
}

// We will want to keep these values consistent so that we can reproduce old versions of this test.
const addedHandlePath = "addedHandlePath";
const removedHandlePath = "removedHandlePath";
type actionType = "addedHandlePath" | "removedHandlePath";

/**
 * IHandleRecord is a record of when and where handles were added and removed
 */
export interface IHandleRecord {
    action: actionType;
    data: IHandlePath;
    timestamp: number;
}

/**
 * HandleTracker tracks the adding and removal of handles manually.
 * Provides a safe way to remove handles
 */
export class HandleTracker {
    private readonly removePaths: IChannelPath[] = [];
    private readonly handlePaths: Map<string, IHandlePath> = new Map();
    public readonly handleActionRecord: IHandleRecord[] = [];
    constructor(private readonly testStart: number) {}

    // exposed for debugging - internal implementation details
    public get addedPaths(): [string, IHandlePath][] {
        return Array.from(this.handlePaths.entries());
    }

    // exposed for debugging - internal implementation details
    public get removablePaths(): IChannelPath[] {
        return Array.from(this.removePaths);
    }

    // Creates a unique key for each handle that is stored
    // Sometimes a handle can be stored multiple times in the same dds
    private getKey(handlePath: IHandlePath): string {
        return `${handlePath.dataStoreId}/${handlePath.ddsId}/${handlePath.handleKey}`;
    }

    public hasHandlePaths() {
        return this.removePaths.length > 0;
    }

    /**
     * @param handlePath - the path to a handle that has been added
     * Tracks a removal of a handle
     */
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

    /**
     * @param handlePath - the path to a handle that has been removed
     * Tracks a removal of a handle
     */
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

    /**
     * @param channelPath - the path to a handle that is no longer safe to remove
     * Note: removeRemovePath is not always called after a handle has been removed. Sometimes it is called before
     */
    public removeRemovePath(channelPath: IChannelPath) {
        const removePath = this.removePaths.find((path) => {
            return path.dataStoreId === channelPath.dataStoreId &&
                path.ddsId === channelPath.ddsId;
        });
        assert(removePath !== undefined, `${channelPath} remove path not found!`);
        this.removePaths.splice(this.removePaths.indexOf(removePath), 1);
    }

    /**
     * @param random - the randomization root
     * @returns a path to a stored handle that can safely be removed
     */
    public getRemovePath(random: IRandom): IChannelPath {
        assert(this.removePaths.length > 0, `there should be removable handles!`);
        const channelPath = random.pick(this.removePaths);
        this.removeRemovePath(channelPath);
        return channelPath;
    }
}
