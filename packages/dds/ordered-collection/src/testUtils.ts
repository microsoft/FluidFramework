/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConsensusResult, type IConsensusOrderedCollection } from "./interfaces.js";

/**
 * Helper method to acquire and complete an item
 * Should be used in test code only
 * @internal
 */
export async function acquireAndComplete<T>(
	collection: IConsensusOrderedCollection<T>,
): Promise<T | undefined> {
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
 * @internal
 */
export async function waitAcquireAndComplete<T>(
	collection: IConsensusOrderedCollection<T>,
): Promise<T> {
	let res: T | undefined;
	await collection.waitAndAcquire(async (value: T) => {
		res = value;
		return ConsensusResult.Complete;
	});
	return res as T;
}

/**
 * Helper method to acquire and release an item
 * Should be used in test code only
 * @internal
 */
export async function acquireAndRelease<T>(
	collection: IConsensusOrderedCollection<T>,
): Promise<T | undefined> {
	let res: T | undefined;
	await collection.acquire(async (value: T) => {
		res = value;
		return ConsensusResult.Release;
	});
	return res;
}

/**
 * Helper method to acquire and release an item
 * Should be used in test code only
 * @internal
 */
export async function waitAcquireAndRelease<T>(
	collection: IConsensusOrderedCollection<T>,
): Promise<T> {
	let res: T | undefined;
	await collection.waitAndAcquire(async (value: T) => {
		res = value;
		return ConsensusResult.Release;
	});
	return res as T;
}
