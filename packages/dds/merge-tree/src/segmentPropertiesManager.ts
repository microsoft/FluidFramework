/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";

import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import { IMergeTreeAnnotateMsg } from "./ops.js";
import { MapLike, PropertySet, clone, createMap, extend } from "./properties.js";

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
			destination.properties = source.propertyManager.copyTo(
				source.properties,
				destination.properties,
				destination.propertyManager,
			);
		}
	}
}

/**
 * @internal
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
			extend(newProps, oldProps);

			if (this.pendingKeyUpdateCount) {
				newManager.pendingKeyUpdateCount = clone(this.pendingKeyUpdateCount);
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
