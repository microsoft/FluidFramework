/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICombiningOp,
	PropertiesManager,
	PropertySet,
	createMap,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/core-utils";
import { IIntervalHelpers, ISerializableInterval, ISerializedInterval } from "./intervalUtils";

const reservedIntervalIdKey = "intervalId";

/**
 * Serializable interval whose endpoints are plain-old numbers.
 */
export class Interval implements ISerializableInterval {
	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public properties: PropertySet;
	/** @internal */
	public auxProps: PropertySet[] | undefined;
	/**
	 * {@inheritDoc ISerializableInterval.propertyManager}
	 * @internal
	 */
	public propertyManager: PropertiesManager;
	constructor(public start: number, public end: number, props?: PropertySet) {
		this.propertyManager = new PropertiesManager();
		this.properties = {};

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
	 * @internal
	 */
	public serialize(): ISerializedInterval {
		const serializedInterval: ISerializedInterval = {
			end: this.end,
			intervalType: 0,
			sequenceNumber: 0,
			start: this.start,
		};
		if (this.properties) {
			serializedInterval.properties = this.properties;
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
	 * @internal
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
	 * @internal
	 */
	public addProperties(
		newProps: PropertySet,
		collaborating: boolean = false,
		seq?: number,
		op?: ICombiningOp,
	): PropertySet | undefined {
		if (newProps) {
			this.initializeProperties();
			return this.propertyManager.addProperties(
				this.properties,
				newProps,
				op,
				seq,
				collaborating,
			);
		}
	}

	/**
	 * {@inheritDoc IInterval.modify}
	 * @internal
	 */
	public modify(label: string, start: number, end: number, op?: ISequencedDocumentMessage) {
		const startPos = start ?? this.start;
		const endPos = end ?? this.end;
		if (this.start === startPos && this.end === endPos) {
			// Return undefined to indicate that no change is necessary.
			return;
		}
		const newInterval = new Interval(startPos, endPos);
		if (this.properties) {
			newInterval.initializeProperties();
			this.propertyManager.copyTo(
				this.properties,
				newInterval.properties,
				newInterval.propertyManager,
			);
		}
		return newInterval;
	}

	private initializeProperties(): void {
		if (!this.propertyManager) {
			this.propertyManager = new PropertiesManager();
		}
		if (!this.properties) {
			this.properties = createMap<any>();
		}
	}
}

export function createInterval(label: string, start: number, end: number): Interval {
	const rangeProp: PropertySet = {};

	if (label && label.length > 0) {
		rangeProp[reservedRangeLabelsKey] = [label];
	}

	return new Interval(start, end, rangeProp);
}

export const intervalHelpers: IIntervalHelpers<Interval> = {
	compareEnds: (a: Interval, b: Interval) => a.end - b.end,
	compareStarts: (a: Interval, b: Interval) => a.start - b.start,
	create: createInterval,
};
