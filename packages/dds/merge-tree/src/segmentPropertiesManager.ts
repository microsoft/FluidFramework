/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";

import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import { IMergeTreeAnnotateMsg } from "./ops.js";
import { MapLike, PropertySet, createMap } from "./properties.js";

/**
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export class PropertiesManager {
	private pendingKeyUpdateCount: MapLike<number> | undefined;

	public ackPendingProperties(annotateOp: IMergeTreeAnnotateMsg): void {
		this.decrementPendingCounts(annotateOp.props);
	}

	private decrementPendingCounts(props: PropertySet): void {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && this.pendingKeyUpdateCount?.[key] !== undefined) {
				assert(
					// TODO Non null asserting, why is this not null?
					this.pendingKeyUpdateCount[key]! > 0,
					0x05c /* "Trying to update more annotate props than do exist!" */,
				);
				this.pendingKeyUpdateCount[key]--;
				if (this.pendingKeyUpdateCount?.[key] === 0) {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete this.pendingKeyUpdateCount[key];
				}
			}
		}
	}

	public addProperties(
		oldProps: PropertySet,
		newProps: PropertySet,
		seq?: number,
		collaborating: boolean = false,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): PropertySet {
		this.pendingKeyUpdateCount ??= createMap<number>();

		// Clean up counts for rolled back edits before modifying oldProps
		if (collaborating && rollback === PropertiesRollback.Rollback) {
			this.decrementPendingCounts(newProps);
		}

		const shouldModifyKey = (key: string): boolean => {
			if (
				seq === UnassignedSequenceNumber ||
				seq === UniversalSequenceNumber ||
				this.pendingKeyUpdateCount?.[key] === undefined
			) {
				return true;
			}
			return false;
		};

		const deltas: PropertySet = {};

		for (const [key, newValue] of Object.entries(newProps)) {
			if (newValue === undefined) {
				continue;
			}

			if (collaborating) {
				if (seq === UnassignedSequenceNumber) {
					if (this.pendingKeyUpdateCount?.[key] === undefined) {
						this.pendingKeyUpdateCount[key] = 0;
					}
					this.pendingKeyUpdateCount[key]++;
				} else if (!shouldModifyKey(key)) {
					continue;
				}
			}

			const previousValue: unknown = oldProps[key];
			// The delta should be null if undefined, as that's how we encode delete
			// eslint-disable-next-line unicorn/no-null
			deltas[key] = previousValue === undefined ? null : previousValue;
			if (newValue === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete oldProps[key];
			} else {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				oldProps[key] = newValue;
			}
		}

		return deltas;
	}

	public copyTo(
		oldProps: PropertySet,
		newProps: PropertySet | undefined,
		newManager: PropertiesManager,
	): PropertySet | undefined {
		if (oldProps) {
			// eslint-disable-next-line no-param-reassign
			newProps ??= createMap<unknown>();
			if (!newManager) {
				throw new Error("Must provide new PropertyManager");
			}
			for (const key of Object.keys(oldProps)) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				newProps[key] = oldProps[key];
			}
			newManager.pendingKeyUpdateCount = createMap<number>();
			for (const key of Object.keys(this.pendingKeyUpdateCount!)) {
				// TODO Non null asserting, why is this not null?
				newManager.pendingKeyUpdateCount[key] = this.pendingKeyUpdateCount![key]!;
			}
		}
		return newProps;
	}

	/**
	 * Determines if all of the defined properties in a given property set are pending.
	 */
	public hasPendingProperties(props: PropertySet): boolean {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && this.pendingKeyUpdateCount?.[key] === undefined) {
				return false;
			}
		}
		return true;
	}

	public hasPendingProperty(key: string): boolean {
		return (this.pendingKeyUpdateCount?.[key] ?? 0) > 0;
	}
}
