/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";

import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import { IMergeTreeAnnotateMsg } from "./ops.js";
// eslint-disable-next-line import/no-deprecated
import { MapLike, PropertySet, createMap } from "./properties.js";

/**
 * @legacy
 * @alpha
 */
export enum PropertiesRollback {
	/** Not in a rollback */
	None,

	/** Rollback */
	Rollback,
}

/**
 * @legacy
 * @alpha
 */
export class PropertiesManager {
	private pendingKeyUpdateCount: MapLike<number> | undefined;

	public ackPendingProperties(annotateOp: IMergeTreeAnnotateMsg) {
		this.decrementPendingCounts(annotateOp.props);
	}

	private decrementPendingCounts(props: PropertySet) {
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined) {
				if (this.pendingKeyUpdateCount?.[key] !== undefined) {
					assert(
						this.pendingKeyUpdateCount[key] > 0,
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
	}

	public addProperties(
		oldProps: PropertySet,
		newProps: PropertySet,
		seq?: number,
		collaborating: boolean = false,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): PropertySet {
		// eslint-disable-next-line import/no-deprecated
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

			const previousValue: any = oldProps[key];
			// The delta should be null if undefined, as that's how we encode delete
			deltas[key] = previousValue === undefined ? null : previousValue;
			if (newValue === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete oldProps[key];
			} else {
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
			// eslint-disable-next-line no-param-reassign, import/no-deprecated
			newProps ??= createMap<any>();
			if (!newManager) {
				throw new Error("Must provide new PropertyManager");
			}
			for (const key of Object.keys(oldProps)) {
				newProps[key] = oldProps[key];
			}
			// eslint-disable-next-line import/no-deprecated
			newManager.pendingKeyUpdateCount = createMap<number>();
			for (const key of Object.keys(this.pendingKeyUpdateCount!)) {
				newManager.pendingKeyUpdateCount[key] = this.pendingKeyUpdateCount![key];
			}
		}
		return newProps;
	}

	/**
	 * @returns whether all valid (i.e. defined) entries of the property bag are pending
	 */
	public hasPendingProperties(props: PropertySet) {
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
