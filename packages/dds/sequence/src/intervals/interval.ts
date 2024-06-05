/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	PropertiesManager,
	PropertySet,
	createMap,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { SequencePlace, reservedIntervalIdKey } from "../intervalCollection.js";

import { IIntervalHelpers, ISerializableInterval, ISerializedInterval } from "./intervalUtils.js";

/**
 * Serializable interval whose endpoints are plain-old numbers.
 * @internal
 */
export class Interval implements ISerializableInterval {
	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public properties: PropertySet = createMap<any>();

	/***/
	public auxProps: PropertySet[] | undefined;

	/**
	 * {@inheritDoc ISerializableInterval.propertyManager}
	 */
	public readonly propertyManager: PropertiesManager = new PropertiesManager();

	constructor(
		public start: number,
		public end: number,
		props?: PropertySet,
	) {
		if (props) {
			this.addProperties(props);
		}
	}

	/**
	 * {@inheritDoc ISerializableInterval.getIntervalId}
	 */
	public getIntervalId(): string {
		const id = this.properties?.[reservedIntervalIdKey];
		assert(id !== undefined, 0x5e1 /* interval ID should not be undefined */);
		return `${id}`;
	}

	/**
	 * @returns an array containing any auxiliary property sets added with `addPropertySet`.
	 */
	public getAdditionalPropertySets(): PropertySet[] {
		return this.auxProps ?? [];
	}

	/**
	 * Adds an auxiliary set of properties to this interval.
	 * These properties can be recovered using `getAdditionalPropertySets`
	 * @param props - set of properties to add
	 * @remarks This gets called as part of the default conflict resolver for `IIntervalCollection<Interval>`
	 * (i.e. non-sequence-based interval collections). However, the additional properties don't get serialized.
	 * This functionality seems half-baked.
	 */
	public addPropertySet(props: PropertySet) {
		if (this.auxProps === undefined) {
			this.auxProps = [];
		}
		this.auxProps.push(props);
	}

	/**
	 * {@inheritDoc ISerializableInterval.serialize}
	 */
	public serialize(): ISerializedInterval {
		const serializedInterval: ISerializedInterval = {
			end: this.end,
			intervalType: 0,
			sequenceNumber: 0,
			start: this.start,
		};
		if (this.properties) {
			serializedInterval.properties = { ...this.properties };
		}
		return serializedInterval;
	}

	/**
	 * {@inheritDoc IInterval.clone}
	 */
	public clone() {
		return new Interval(this.start, this.end, this.properties);
	}

	/**
	 * {@inheritDoc IInterval.compare}
	 */
	public compare(b: Interval) {
		const startResult = this.compareStart(b);
		if (startResult === 0) {
			const endResult = this.compareEnd(b);
			if (endResult === 0) {
				const thisId = this.getIntervalId();
				if (thisId) {
					const bId = b.getIntervalId();
					if (bId) {
						return thisId > bId ? 1 : thisId < bId ? -1 : 0;
					}
					return 0;
				}
				return 0;
			} else {
				return endResult;
			}
		} else {
			return startResult;
		}
	}

	/**
	 * {@inheritDoc IInterval.compareStart}
	 */
	public compareStart(b: Interval) {
		return this.start - b.start;
	}

	/**
	 * {@inheritDoc IInterval.compareEnd}
	 */
	public compareEnd(b: Interval) {
		return this.end - b.end;
	}

	/**
	 * {@inheritDoc IInterval.overlaps}
	 */
	public overlaps(b: Interval) {
		const result = this.start <= b.end && this.end >= b.start;
		return result;
	}

	/**
	 * {@inheritDoc IInterval.union}
	 */
	public union(b: Interval) {
		return new Interval(
			Math.min(this.start, b.start),
			Math.max(this.end, b.end),
			this.properties,
		);
	}

	public getProperties() {
		return this.properties;
	}

	/**
	 * {@inheritDoc ISerializableInterval.addProperties}
	 */
	public addProperties(
		newProps: PropertySet,
		collaborating: boolean = false,
		seq?: number,
	): PropertySet | undefined {
		if (newProps) {
			return this.propertyManager.addProperties(
				this.properties,
				newProps,
				seq,
				collaborating,
			);
		}
	}

	/**
	 * {@inheritDoc IInterval.modify}
	 */
	public modify(
		label: string,
		start?: SequencePlace,
		end?: SequencePlace,
		op?: ISequencedDocumentMessage,
	) {
		if (typeof start === "string" || typeof end === "string") {
			throw new UsageError(
				"The start and end positions of a plain interval may not be on the special endpoint segments.",
			);
		}

		const startPos = typeof start === "number" ? start : start?.pos ?? this.start;
		const endPos = typeof end === "number" ? end : end?.pos ?? this.end;

		if (this.start === startPos && this.end === endPos) {
			// Return undefined to indicate that no change is necessary.
			return;
		}
		const newInterval = new Interval(startPos, endPos);
		if (this.properties) {
			this.propertyManager.copyTo(
				this.properties,
				newInterval.properties,
				newInterval.propertyManager,
			);
		}
		return newInterval;
	}
}

export function createInterval(label: string, start: SequencePlace, end: SequencePlace): Interval {
	if (typeof start === "string" || typeof end === "string") {
		throw new UsageError(
			"The start and end positions of a plain interval may not be on the special endpoint segments.",
		);
	}

	const rangeProp: PropertySet = {};

	if (label && label.length > 0) {
		rangeProp[reservedRangeLabelsKey] = [label];
	}

	const startPos = typeof start === "number" ? start : start.pos;
	const endPos = typeof end === "number" ? end : end.pos;

	return new Interval(startPos, endPos, rangeProp);
}

export const intervalHelpers: IIntervalHelpers<Interval> = {
	create: createInterval,
};
