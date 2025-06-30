/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type SequenceIntervalClass } from "../intervals/index.js";

import { type SequenceIntervalIndex } from "./intervalIndex.js";

export interface IIdIntervalIndex
	extends SequenceIntervalIndex,
		Iterable<SequenceIntervalClass> {
	getIntervalById(id: string): SequenceIntervalClass | undefined;

	[Symbol.iterator](): Iterator<SequenceIntervalClass>;
}
class IdIntervalIndex implements IIdIntervalIndex, Iterable<SequenceIntervalClass> {
	private readonly intervalIdMap = new Map<string, SequenceIntervalClass>();

	public add(interval: SequenceIntervalClass) {
		const id = interval.getIntervalId();
		assert(
			id !== undefined,
			0x2c0 /* "ID must be created before adding interval to collection" */,
		);
		this.intervalIdMap.set(id, interval);
	}

	public remove(interval: SequenceIntervalClass) {
		const id = interval.getIntervalId();
		assert(id !== undefined, 0x311 /* expected id to exist on interval */);
		this.intervalIdMap.delete(id);
	}

	public getIntervalById(id: string): SequenceIntervalClass | undefined {
		return this.intervalIdMap.get(id);
	}

	public [Symbol.iterator](): IterableIterator<SequenceIntervalClass> {
		return this.intervalIdMap.values();
	}
}

export function createIdIntervalIndex(): IIdIntervalIndex {
	return new IdIntervalIndex();
}
