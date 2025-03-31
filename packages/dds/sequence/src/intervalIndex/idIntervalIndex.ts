/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { reservedIntervalIdKey } from "../intervalCollection.js";
import { type SequenceInterval } from "../intervals/index.js";

import { type SequenceIntervalIndex } from "./intervalIndex.js";

/**
 * @internal
 */
export interface IIdIntervalIndex extends SequenceIntervalIndex, Iterable<SequenceInterval> {
	getIntervalById(id: string): SequenceInterval | undefined;

	[Symbol.iterator](): Iterator<SequenceInterval>;
}
class IdIntervalIndex implements IIdIntervalIndex, Iterable<SequenceInterval> {
	private readonly intervalIdMap = new Map<string, SequenceInterval>();

	public add(interval: SequenceInterval) {
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

	public remove(interval: SequenceInterval) {
		const id = interval.getIntervalId();
		assert(id !== undefined, 0x311 /* expected id to exist on interval */);
		this.intervalIdMap.delete(id);
	}

	public getIntervalById(id: string): SequenceInterval | undefined {
		return this.intervalIdMap.get(id);
	}

	public [Symbol.iterator](): IterableIterator<SequenceInterval> {
		return this.intervalIdMap.values();
	}
}

/**
 * @internal
 */
export function createIdIntervalIndex(): IIdIntervalIndex {
	return new IdIntervalIndex();
}
