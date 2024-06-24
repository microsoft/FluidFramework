/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { Client, RedBlackTree } from "@fluidframework/merge-tree/internal";

import {
	IIntervalHelpers,
	ISerializableInterval,
	IntervalType,
	SequenceInterval,
	sequenceIntervalHelpers,
} from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { IntervalIndex } from "./intervalIndex.js";

/**
 * @internal
 */
export interface IEndpointIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns the previous interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	previousInterval(pos: number): TInterval | undefined;

	/**
	 * @returns the next interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	nextInterval(pos: number): TInterval | undefined;
}

export class EndpointIndex<TInterval extends ISerializableInterval>
	implements IEndpointIndex<TInterval>
{
	private readonly endIntervalTree: RedBlackTree<TInterval, TInterval>;

	constructor(
		private readonly client: Client,
		private readonly helpers: IIntervalHelpers<TInterval>,
	) {
		this.endIntervalTree = new RedBlackTree<TInterval, TInterval>((a, b) => a.compareEnd(b));
	}

	public previousInterval(pos: number): TInterval | undefined {
		const transientInterval = this.helpers.create(
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

	public nextInterval(pos: number): TInterval | undefined {
		const transientInterval = this.helpers.create(
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

	public add(interval: TInterval): void {
		this.endIntervalTree.put(interval, interval);
	}

	public remove(interval: TInterval): void {
		this.endIntervalTree.remove(interval);
	}
}

/**
 * @internal
 */
export function createEndpointIndex(
	sharedString: ISharedString,
): IEndpointIndex<SequenceInterval> {
	const client = (sharedString as unknown as { client: Client }).client;
	return new EndpointIndex<SequenceInterval>(client, sequenceIntervalHelpers);
}
