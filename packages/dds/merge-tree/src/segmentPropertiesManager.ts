/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";

import { computeValue, type AdjustParams, type PendingChanges } from "./adjust.js";
import { DoublyLinkedList } from "./collections/index.js";
import { UnassignedSequenceNumber } from "./constants.js";
import { MapLike, PropertySet, clone, createMap } from "./properties.js";

/**
 * @internal
 */
export enum PropertiesRollback {
	/**
	 * Not in a rollback
	 */
	None,

	/**
	 * Rollback
	 */
	Rollback,
}
/**
 * @internal
 */
export class PropertiesManager {
	public handleProperties(
		op: { props?: MapLike<unknown>; adjust?: MapLike<AdjustParams> },
		seg: { properties?: MapLike<unknown> },
		seq?: number,
		collaborating: boolean = false,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): MapLike<unknown> {
		const properties = (seg.properties ??= createMap<unknown>());
		const deltas = createMap();

		for (const [key, value] of [
			...Object.entries(op.props ?? {})
				.map<[string, { raw: unknown }]>(([k, raw]) => [k, { raw }])
				.filter(([_, v]) => v.raw !== undefined),
			...Object.entries(op.adjust ?? {}),
		]) {
			const previousValue = properties[key];

			if (rollback === PropertiesRollback.Rollback) {
				const pending = this.pending?.[key];

				if (collaborating) {
					assert(pending !== undefined, "pending must exist for rollback");
					pending.changes.pop();
					if (pending.changes.length === 0) {
						delete this.pending?.[key];
						if (Object.keys(this.pending ?? {}).length === 0) {
							this.pending = undefined;
						}
					}
					properties[key] = computeValue(
						pending.consensus,
						pending.changes.map((n) => n.data),
					);
				} else {
					assert(pending === undefined, "must not have pending when not collaborating");
					properties[key] = computeValue(previousValue, [value]);
				}
			} else {
				if (seq === UnassignedSequenceNumber && collaborating) {
					const adjustments = (this.pending ??= {});
					const pending: PendingChanges = (adjustments[key] ??= {
						consensus: previousValue,
						changes: new DoublyLinkedList(),
					});
					pending.changes.push(value);
					properties[key] = computeValue(
						pending.consensus,
						pending.changes.map((n) => n.data),
					);
				} else {
					const pending = this.pending?.[key];
					if (pending === undefined) {
						// no pending changes, so no need to update the adjustments
						properties[key] = computeValue(previousValue, [value]);
					} else {
						// there are pending changes, so update the baseline remote value
						// and then compute the current value
						pending.consensus = computeValue(pending.consensus, [value]);
						properties[key] = computeValue(
							pending.consensus,
							pending.changes.map((n) => n.data),
						);
					}
				}
			}
			// if the value changed, it should be expressed in the delta
			if (properties[key] !== previousValue) {
				// eslint-disable-next-line unicorn/no-null
				deltas[key] = previousValue ?? null;
			}
			if (properties[key] === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete properties[key];
			}
		}
		return deltas;
	}

	private pending: MapLike<PendingChanges | undefined> | undefined;

	public ack(op: { props?: MapLike<unknown>; adjust?: MapLike<AdjustParams> }): void {
		for (const [key, value] of [
			...Object.entries(op.props ?? {})
				.map<[string, { raw: unknown }]>(([k, raw]) => [k, { raw }])
				.filter(([_, v]) => v.raw !== undefined),
			...Object.entries(op.adjust ?? {}),
		]) {
			const pending = this.pending?.[key];
			assert(pending !== undefined, "must have pending to ack");
			pending.changes.shift();
			if (pending.changes.length === 0) {
				delete this.pending?.[key];
				if (Object.keys(this.pending ?? {}).length === 0) {
					this.pending = undefined;
				}
			} else {
				pending.consensus = computeValue(pending.consensus, [value]);
			}
		}
	}

	public copyTo(
		oldProps: PropertySet | undefined,
		dest: {
			properties?: PropertySet;
			propertyManager?: PropertiesManager;
		},
	): void {
		const newManager = (dest.propertyManager ??= new PropertiesManager());
		dest.properties = clone(oldProps);
		if (this.pending !== undefined) {
			for (const [key, value] of Object.entries(this.pending)) {
				if (value !== undefined) {
					const { consensus, changes } = value;
					const pending = (newManager.pending ??= {});
					pending[key] = {
						consensus,
						changes: new DoublyLinkedList(changes.map((n) => n.data)),
					};
				}
			}
		}
	}

	public hasPendingProperties(props: PropertySet): boolean {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && this.pending?.[key] === undefined) {
				return false;
			}
		}
		return true;
	}
}
