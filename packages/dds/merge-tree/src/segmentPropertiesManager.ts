/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { DoublyLinkedList, iterateListValuesWhile } from "./collections/index.js";
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
					(typeof computedValue === "number" ? computedValue : 0) + adjust.delta;
				if (adjust.max !== undefined && adjusted > adjust.max) {
					computedValue = adjust.max;
				} else if (adjust.min !== undefined && adjusted < adjust.min) {
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

	/**
	 * Rolls back local property changes.
	 * This method reverts property changes based on the provided operation and segment.
	 * If the operation is part of a collaborative session, it ensures that the changes are consistent with the remote state.
	 *
	 * @param op - The operation containing property changes. This can be an adjustment or a set of properties.
	 * @param seg - The segment containing properties. This object may have a properties map that will be modified.
	 * @param collaborating - Indicates if the operation is part of a collaborative session. Defaults to false.
	 * @returns The deltas of the rolled-back properties. This is a map-like object representing the changes that were reverted.
	 */
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
				assert(
					pending !== undefined,
					0xa6f /* Pending changes must exist for rollback when collaborating */,
				);
				pending.local.pop();
				properties[key] = computePropertyValue(
					pending.msnConsensus,
					pending.remote.map((n) => n.data),
					pending.local.map((n) => n.data),
				);
				if (pending.local.empty && pending.remote.empty) {
					this.changes.delete(key);
				}
			} else {
				assert(
					pending === undefined,
					0xa70 /* Pending changes must not exist when not collaborating */,
				);
				properties[key] = computePropertyValue(previousValue, [value]);
			}
			deltas[key] = previousValue;
		});
	}

	/**
	 * Handles property changes.
	 * This method applies property changes based on the provided operation, segment, sequence number, and collaboration state.
	 * It also handles rolling back changes if specified.
	 *
	 * @param op - The operation containing property changes.
	 * @param seg - The segment containing properties.
	 * @param seq - The sequence number for the operation.
	 * @param msn - The minimum sequence number for the operation.
	 * @param collaborating - Indicates if the operation is part of a collaborative session. Defaults to false.
	 * @param rollback - Specifies if the changes should be rolled back. Defaults to PropertiesRollback.None.
	 * @returns The deltas of the applied or rolled-back properties. This is a map-like object representing the changes.
	 */
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

	/**
	 * Acknowledges property changes.
	 * This method acknowledges the property changes based on the provided sequence number and operation.
	 *
	 * @param seq - The sequence number for the operation.
	 * @param msn - The minimum sequence number for the operation.
	 * @param op - The operation containing property changes.
	 */
	public ack(seq: number, msn: number, op: PropsOrAdjust): void {
		for (const [key, value] of opToChanges(op, seq)) {
			const change = this.changes.get(key);
			const acked = change?.local?.shift();
			assert(
				change !== undefined && acked !== undefined,
				0xa71 /* must have local change to ack */,
			);
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

	/**
	 * Updates the minimum sequence number (msn).
	 * This method updates the minimum sequence number and removes any changes that have been acknowledged.
	 *
	 * @param msn - The minimum sequence number to update.
	 */
	public updateMsn(msn: number): void {
		for (const [key, pending] of this.changes) {
			pending.msnConsensus = computePropertyValue(
				pending.msnConsensus,
				iterateListValuesWhile(pending.remote.first, (n) => {
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

	/**
	 * Copies properties to another manager.
	 * This method copies the properties and their changes from the current manager to the destination manager.
	 *
	 * @param oldProps - The old properties to be copied.
	 * @param dest - The destination object containing properties and property manager.
	 */
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
	 * Gets properties at a specific sequence number.
	 * This method retrieves the properties at the given sequence number.
	 * This is only needed to support emitting snapshots in the legacy format.
	 * If we remove the ability to emit the legacy format, we can remove this method, along with the need to track remote changes at all.
	 *
	 * @param oldProps - The old properties to be retrieved.
	 * @param sequenceNumber - The sequence number to get properties at.
	 * @returns The properties at the given sequence number.
	 */
	public getAtSeq(
		oldProps: MapLike<unknown> | undefined,
		sequenceNumber: number,
	): MapLike<unknown> {
		const properties: MapLike<unknown> = { ...oldProps };
		for (const [key, changes] of this.changes) {
			properties[key] = computePropertyValue(
				changes.msnConsensus,
				iterateListValuesWhile(changes.remote.first, (c) => c.data.seq <= sequenceNumber),
			);
			if (properties[key] === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete properties[key];
			}
		}
		return properties;
	}

	/**
	 * Determines if all of the defined properties in a given property set are pending.
	 *
	 * @param props - The properties to check.
	 * @returns True if all the properties are pending, false otherwise.
	 */
	public hasPendingProperties(props: PropertySet): boolean {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && this.changes.get(key)?.local.empty !== false) {
				return false;
			}
		}
		return true;
	}
}
