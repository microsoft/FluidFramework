/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { DoublyLinkedList, iterateListValues } from "./collections/index.js";
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import type {
	AdjustParams,
	IMergeTreeAnnotateAdjustMsg,
	IMergeTreeAnnotateMsg,
} from "./ops.js";
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
 * Minimally copies properties and the property manager from source to destination.
 * @internal
 */
export function copyPropertiesAndManager(
	source: {
		properties?: PropertySet;
		propertyManager?: PropertiesManager;
	},
	destination: {
		properties?: PropertySet;
		propertyManager?: PropertiesManager;
	},
): void {
	if (source.properties) {
		if (source.propertyManager === undefined) {
			destination.properties = clone(source.properties);
		} else {
			destination.propertyManager ??= new PropertiesManager();
			source.propertyManager.copyTo(source.properties, destination);
		}
	}
}

type PropertyChange = {
	seq: number;
} & ({ adjust: AdjustParams; raw?: undefined } | { raw: unknown; adjust?: undefined });

interface PropertyChanges {
	msnConsensus: unknown;
	remote: DoublyLinkedList<PropertyChange>;
	local: DoublyLinkedList<PropertyChange>;
}

function computePropertyValue(
	consensus: unknown,
	...changes: Iterable<PropertyChange>[]
): unknown {
	let computedValue: unknown = consensus;
	for (const change of changes) {
		for (const op of change) {
			const { raw, adjust } = op;
			if (adjust === undefined) {
				computedValue = raw;
			} else {
				const adjusted =
					(typeof computedValue === "number" ? computedValue : 0) + adjust.value;
				if (adjust.max && adjusted > adjust.max) {
					computedValue = adjust.max;
				} else if (adjust.min && adjusted < adjust.min) {
					computedValue = adjust.min;
				} else {
					computedValue = adjusted;
				}
			}
		}
	}
	return computedValue;
}

/**
 * @internal
 */
export type PropsOrAdjust =
	| Pick<IMergeTreeAnnotateAdjustMsg, "props" | "adjust">
	| Pick<IMergeTreeAnnotateMsg, "props" | "adjust">;

const opToChanges = (op: PropsOrAdjust, seq: number): [string, PropertyChange][] => [
	...Object.entries(op.props ?? {})
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		.map<[string, PropertyChange]>(([k, raw]) => [k, { raw, seq }])
		.filter(([_, v]) => v.raw !== undefined),
	...Object.entries(op.adjust ?? {}).map<[string, PropertyChange]>(([k, adjust]) => [
		k,
		{ adjust, seq },
	]),
];

function applyChanges(
	op: PropsOrAdjust,
	seg: { properties?: MapLike<unknown> },
	seq: number,
	run: (
		properties: MapLike<unknown>,
		deltas: MapLike<unknown>,
		key: string,
		value: PropertyChange,
	) => void,
): MapLike<unknown> {
	const properties = (seg.properties ??= createMap<unknown>());
	const deltas: MapLike<unknown> = {};
	for (const [key, value] of opToChanges(op, seq)) {
		run(properties, deltas, key, value);
		if (properties[key] === null) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete properties[key];
		}
	}
	return deltas;
}

/**
 * The PropertiesManager class handles changes to properties, both remote and local.
 * It manages the lifecycle for local property changes, ensures all property changes are eventually consistent,
 * and provides methods to acknowledge changes, update the minimum sequence number (msn), and copy properties to another manager.
 * This class is essential for maintaining the integrity and consistency of property changes in collaborative environments.
 * @internal
 */
export class PropertiesManager {
	private readonly changes = new Map<string, PropertyChanges>();

	public rollbackProperties(
		op: PropsOrAdjust,
		seg: { properties?: MapLike<unknown> },
		collaborating: boolean = false,
	): MapLike<unknown> {
		return applyChanges(op, seg, UniversalSequenceNumber, (properties, deltas, key, value) => {
			// eslint-disable-next-line unicorn/no-null
			const previousValue = properties[key] ?? null;

			const pending = this.changes.get(key);
			if (collaborating) {
				assert(pending !== undefined, "pending must exist for rollback");
				pending.local.pop();
				properties[key] = computePropertyValue(
					pending.msnConsensus,
					pending.remote.map((n) => n.data),
					pending.local.map((n) => n.data),
				);
			} else {
				assert(pending === undefined, "must not have pending when not collaborating");
				properties[key] = computePropertyValue(previousValue, [value]);
			}
			deltas[key] = previousValue;
		});
	}

	public handleProperties(
		op: PropsOrAdjust,
		seg: { properties?: MapLike<unknown> },
		seq: number,
		msn: number,
		collaborating: boolean = false,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): MapLike<unknown> {
		if (rollback === PropertiesRollback.Rollback) {
			return this.rollbackProperties(op, seg, collaborating);
		}
		const rtn = applyChanges(op, seg, seq, (properties, deltas, key, value) => {
			// eslint-disable-next-line unicorn/no-null
			const previousValue = properties[key] ?? null;
			if (collaborating) {
				const pending: PropertyChanges | undefined = this.changes.get(key) ?? {
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
						pending.msnConsensus = computePropertyValue(pending.msnConsensus, [value]);
					} else {
						pending.remote.push(value);
					}
				}
				properties[key] = computePropertyValue(
					pending.msnConsensus,
					pending.remote.map((n) => n.data),
					pending.local.map((n) => n.data),
				);
				if (local || pending.local.empty || properties[key] !== previousValue) {
					deltas[key] = previousValue;
				}
			} else {
				properties[key] = computePropertyValue(previousValue, [value]);
				deltas[key] = previousValue;
			}
		});
		this.updateMsn(msn);
		return rtn;
	}

	public ack(seq: number, msn: number, op: PropsOrAdjust): void {
		for (const [key, value] of opToChanges(op, seq)) {
			const change = this.changes.get(key);
			const acked = change?.local?.shift();
			assert(change !== undefined && acked !== undefined, "must have local change to ack");
			// we only track remotes if there are adjusts, as only adjusts make application anti-commutative
			// this will limit the impact of this change to only those using adjusts. Additionally, we only
			// need to track remotes at all to support emitting the legacy snapshot format, which only sharedstring
			// uses. when we remove the ability to emit that format, we can remove all remote op tracking
			if (value.raw !== undefined && change.remote.empty) {
				change.msnConsensus = computePropertyValue(change.msnConsensus, [value]);
			} else {
				change.remote.push(value);
			}
		}
		this.updateMsn(msn);
	}

	public updateMsn(msn: number): void {
		for (const [key, pending] of this.changes) {
			pending.msnConsensus = computePropertyValue(
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
			properties[key] = computePropertyValue(
				changes.msnConsensus,
				iterateListValues(changes.remote.first, (c) => c.data.seq <= sequenceNumber),
			);
			if (properties[key] === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete properties[key];
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
