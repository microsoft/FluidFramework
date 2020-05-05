/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConsensusResult,
    IConsensusOrderedCollection,
} from "./interfaces";

/**
 * Helper method to acquire and complete an item
 * Should be used in test code only
 */
export async function acquireAndComplete<T>(collection: IConsensusOrderedCollection<T>): Promise<T | undefined> {
    let res: T | undefined;
    await collection.acquire(async (value: T) => {
        res = value;
        return ConsensusResult.Complete;
    });
    return res;
}

/**
 * Helper method to acquire and complete an item
 * Should be used in test code only
 */
export async function waitAcquireAndComplete<T>(collection: IConsensusOrderedCollection<T>): Promise<T> {
    let res: T | undefined;
    await collection.waitAndAcquire(async (value: T) => {
        res = value;
        return ConsensusResult.Complete;
    });
    return res as T;
}
