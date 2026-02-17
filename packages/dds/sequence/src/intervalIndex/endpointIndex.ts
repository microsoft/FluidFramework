/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RedBlackTree } from "@fluidframework/merge-tree/internal";

import { createTransientIntervalFromProvider, SequenceInterval } from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import type { IIntervalReferenceProvider, SequenceIntervalIndex } from "./intervalIndex.js";

/**
 * @internal
 */
export interface IEndpointIndex extends SequenceIntervalIndex {
	/**
	 * @returns the previous interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	previousInterval(pos: number): SequenceInterval | undefined;

	/**
	 * @returns the next interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	nextInterval(pos: number): SequenceInterval | undefined;
}

export class EndpointIndex implements IEndpointIndex {
	private readonly endIntervalTree: RedBlackTree<SequenceInterval, SequenceInterval>;

	constructor(private readonly provider: IIntervalReferenceProvider) {
		this.endIntervalTree = new RedBlackTree<SequenceInterval, SequenceInterval>((a, b) =>
			a.compareEnd(b),
		);
	}

	public previousInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromProvider(pos, pos, this.provider);
		const rbNode = this.endIntervalTree.floor(transientInterval);
		if (rbNode) {
			return rbNode.data;
		}
	}

	public nextInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromProvider(pos, pos, this.provider);
		const rbNode = this.endIntervalTree.ceil(transientInterval);
		if (rbNode) {
			return rbNode.data;
		}
	}

	public add(interval: SequenceInterval): void {
		this.endIntervalTree.put(interval, interval);
	}

	public remove(interval: SequenceInterval): void {
		this.endIntervalTree.remove(interval);
	}
}

/**
 * Creates an endpoint index for the provided SharedString.
 *
 * @internal
 */
export function createEndpointIndex(sharedString: ISharedString): IEndpointIndex {
	return new EndpointIndex(sharedString as unknown as IIntervalReferenceProvider);
}
