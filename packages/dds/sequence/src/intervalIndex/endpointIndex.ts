/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Client, RedBlackTree } from "@fluidframework/merge-tree";
import { IIntervalHelpers, ISerializableInterval, IntervalType } from "../intervals";
import { IntervalIndex } from "./intervalIndex";

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

class EndpointIndex<TInterval extends ISerializableInterval> implements IEndpointIndex<TInterval> {
	private readonly endIntervalTree: RedBlackTree<TInterval, TInterval>;

	constructor(
		private readonly client: Client,
		private readonly helpers: IIntervalHelpers<TInterval>,
	) {
		// eslint-disable-next-line @typescript-eslint/unbound-method
		this.endIntervalTree = new RedBlackTree<TInterval, TInterval>(helpers.compareEnds);
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

export function createEndpointIndex<TInterval extends ISerializableInterval>(
	client: Client,
	helpers: IIntervalHelpers<TInterval>,
): IEndpointIndex<TInterval> {
	return new EndpointIndex<TInterval>(client, helpers);
}
