/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { reservedIntervalIdKey } from "../intervalCollection.js";
import { ISerializableInterval } from "../intervals/index.js";

import { IntervalIndex } from "./intervalIndex.js";

/**
 * @internal
 */
export interface IIdIntervalIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval>,
		Iterable<TInterval> {
	getIntervalById(id: string): TInterval | undefined;

	[Symbol.iterator](): Iterator<TInterval>;
}
class IdIntervalIndex<TInterval extends ISerializableInterval>
	implements IIdIntervalIndex<TInterval>, Iterable<TInterval>
{
	private readonly intervalIdMap = new Map<string, TInterval>();

	public add(interval: TInterval) {
		const id = interval.getIntervalId();
		assert(
			id !== undefined,
			0x2c0 /* "ID must be created before adding interval to collection" */,
		);
		// Make the ID immutable.
		Object.defineProperty(interval.properties, reservedIntervalIdKey, {
			configurable: false,
			enumerable: true,
			writable: false,
		});
		this.intervalIdMap.set(id, interval);
	}

	public remove(interval: TInterval) {
		const id = interval.getIntervalId();
		assert(id !== undefined, 0x311 /* expected id to exist on interval */);
		this.intervalIdMap.delete(id);
	}

	public getIntervalById(id: string): TInterval | undefined {
		return this.intervalIdMap.get(id);
	}

	public [Symbol.iterator](): IterableIterator<TInterval> {
		return this.intervalIdMap.values();
	}
}

/**
 * @internal
 */
export function createIdIntervalIndex<
	TInterval extends ISerializableInterval,
>(): IIdIntervalIndex<TInterval> {
	return new IdIntervalIndex<TInterval>();
}
