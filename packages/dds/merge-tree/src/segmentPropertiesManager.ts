/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	computeValue,
	type AdjustParams,
	type Change,
	type PendingChanges,
} from "./adjust.js";
import { DoublyLinkedList, iterateListValues } from "./collections/index.js";
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
		seq: number,
		msn: number,
		collaborating: boolean = false,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): MapLike<unknown> {
		const properties = (seg.properties ??= createMap<unknown>());
		const deltas: MapLike<unknown> = {};

		for (const [key, value] of [
			...Object.entries(op.props ?? {})
				.map<[string, Change]>(([k, raw]) => [k, { raw, seq }])
				.filter(([_, v]) => v.raw !== undefined),
			...Object.entries(op.adjust ?? {}).map<[string, Change]>(([k, adjust]) => [
				k,
				{ adjust, seq },
			]),
		]) {
			// eslint-disable-next-line unicorn/no-null
			const previousValue = properties[key] ?? null;

			if (rollback === PropertiesRollback.Rollback) {
				const pending = this.changes.get(key);
				if (collaborating) {
					assert(pending !== undefined, "pending must exist for rollback");
					pending.local.pop();
					properties[key] = computeValue(
						pending.msnConsensus,
						pending.remote.map((n) => n.data),
						pending.local.map((n) => n.data),
					);
				} else {
					assert(pending === undefined, "must not have pending when not collaborating");
					properties[key] = computeValue(previousValue, [value]);
				}
				deltas[key] = previousValue;
			} else {
				if (collaborating) {
					const pending: PendingChanges | undefined = this.changes.get(key) ?? {
						msnConsensus: previousValue,
						remote: new DoublyLinkedList(),
						local: new DoublyLinkedList(),
					};
					this.changes.set(key, pending);
					const local = seq === UnassignedSequenceNumber;
					if (local) {
						pending.local.push(value);
					} else {
						// we only track remotes if there are adjusts, as only adjusts make application anti-commutative
						// this will limit the impact of this change to only those using adjusts. Additionally, we only
						// need to track remotes at all to support emitting the legacy snapshot format, which only sharedstring
						// uses. when we remove the ability to emit that format, we can remove all remote op tracking
						if (value.raw !== undefined && pending.remote.empty) {
							pending.msnConsensus = computeValue(pending.msnConsensus, [value]);
						} else {
							pending.remote.push(value);
						}
					}
					properties[key] = computeValue(
						pending.msnConsensus,
						pending.remote.map((n) => n.data),
						pending.local.map((n) => n.data),
					);
					if (local || pending.local.empty || properties[key] !== previousValue) {
						deltas[key] = previousValue;
					}
				} else {
					properties[key] = computeValue(previousValue, [value]);
					deltas[key] = previousValue;
				}
			}

			if (properties[key] === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete properties[key];
			}
		}
		this.updateMsn(msn);
		return deltas;
	}

	private readonly changes = new Map<string, PendingChanges>();

	public ack(
		seq: number,
		msn: number,
		op: { props?: MapLike<unknown>; adjust?: MapLike<AdjustParams> },
	): void {
		for (const [key, value] of [
			...Object.entries(op.props ?? {})
				.map<[string, Change]>(([k, raw]) => [k, { raw, seq }])
				.filter(([_, v]) => v.raw !== undefined),
			...Object.entries(op.adjust ?? {}).map<[string, Change]>(([k, adjust]) => [
				k,
				{ adjust, seq },
			]),
		]) {
			const change = this.changes.get(key);
			const acked = change?.local?.shift();
			assert(change !== undefined && acked !== undefined, "must have local change to ack");
			// we only track remotes if there are adjusts, as only adjusts make application anti-commutative
			// this will limit the impact of this change to only those using adjusts. Additionally, we only
			// need to track remotes at all to support emitting the legacy snapshot format, which only sharedstring
			// uses. when we remove the ability to emit that format, we can remove all remote op tracking
			if (value.raw !== undefined && change.remote.empty) {
				change.msnConsensus = computeValue(change.msnConsensus, [value]);
			} else {
				change.remote.push(value);
			}
		}
		this.updateMsn(msn);
	}

	public updateMsn(msn: number): void {
		for (const [key, pending] of this.changes) {
			pending.msnConsensus = computeValue(
				pending.msnConsensus,
				iterateListValues(pending.remote.first, (n) => {
					if (n.data.seq <= msn) {
						n.list?.remove(n);
						return true;
					}
					return false;
				}),
			);
			if (pending.local.empty && pending.remote.empty) {
				this.changes.delete(key);
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
		for (const [key, { local, remote, msnConsensus }] of this.changes.entries()) {
			newManager.changes.set(key, {
				msnConsensus,
				remote: new DoublyLinkedList(remote.empty ? undefined : remote.map((c) => c.data)),
				local: new DoublyLinkedList(local.empty ? undefined : local.map((c) => c.data)),
			});
		}
	}

	/**
	 * This is only needed to support emitting snapshots in the legacy format
	 * If we remove the ability to emit the legacy format, we can remove this
	 * method, along with the need to track remote changes at all.
	 */
	public getAtSeq(
		oldProps: MapLike<unknown> | undefined,
		sequenceNumber: number,
	): MapLike<unknown> {
		const properties: MapLike<unknown> = { ...oldProps };
		for (const [key, changes] of this.changes) {
			const computedValued = computeValue(
				changes.msnConsensus,
				iterateListValues(changes.remote.first, (c) => c.data.seq <= sequenceNumber),
			);
			if (computedValued !== null) {
				properties[key] = computedValued;
			}
		}
		return properties;
	}

	public hasPendingProperties(props: PropertySet): boolean {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && !this.changes.has(key)) {
				return false;
			}
		}
		return true;
	}
}
