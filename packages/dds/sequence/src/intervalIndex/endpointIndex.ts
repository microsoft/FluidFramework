/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { Client, RedBlackTree } from "@fluidframework/merge-tree/internal";

import { createSequenceInterval, IntervalType, SequenceInterval } from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { type SequenceIntervalIndex } from "./intervalIndex.js";

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

	constructor(private readonly client: Client) {
		this.endIntervalTree = new RedBlackTree<SequenceInterval, SequenceInterval>((a, b) =>
			a.compareEnd(b),
		);
	}

	public previousInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createSequenceInterval(
			"transient",
			pos,
			pos,
			this.client,
			IntervalType.Transient,
		);
		const rbNode = this.endIntervalTree.floor(transientInterval);
		if (rbNode) {
			return rbNode.data;
		}
	}

	public nextInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createSequenceInterval(
			"transient",
			pos,
			pos,
			this.client,
			IntervalType.Transient,
		);
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
 * @internal
 */
export function createEndpointIndex(sharedString: ISharedString): IEndpointIndex {
	const client = (sharedString as unknown as { client: Client }).client;
	return new EndpointIndex(client);
}
