/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
/* eslint-disable import/no-deprecated */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import {
	addProperties,
	Client,
	createMap,
	getSlideToSegoff,
	ISegment,
	MergeTreeDeltaType,
	PropertySet,
	LocalReferencePosition,
	ReferenceType,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	UnassignedSequenceNumber,
	DetachedReferencePosition,
	UniversalSequenceNumber,
	SlidingPreference,
} from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { LoggingError, UsageError } from "@fluidframework/telemetry-utils";
import { v4 as uuid } from "uuid";
import {
	IMapMessageLocalMetadata,
	IValueFactory,
	IValueOpEmitter,
	IValueOperation,
	IValueType,
	SequenceOptions,
} from "./defaultMapInterfaces";
import {
	CompressedSerializedInterval,
	IIntervalHelpers,
	Interval,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	ISerializableInterval,
	ISerializedInterval,
	SequenceInterval,
	SerializedIntervalDelta,
	createPositionReferenceFromSegoff,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
	sequenceIntervalHelpers,
	createInterval,
} from "./intervals";
import {
	EndpointIndex,
	IEndpointIndex,
	IIdIntervalIndex,
	IOverlappingIntervalsIndex,
	IntervalIndex,
	OverlappingIntervalsIndex,
	createIdIntervalIndex,
} from "./intervalIndex";

/**
 * Defines a position and side relative to a character in a sequence.
 *
 * For this purpose, sequences look like:
 *
 * `{start} - {character 0} - {character 1} - ... - {character N} - {end}`
 *
 * Each `{value}` in the diagram is a character within a sequence.
 * Each `-` in the above diagram is a position where text could be inserted.
 * Each position between a `{value}` and a `-` is a `SequencePlace`.
 *
 * The special endpoints `{start}` and `{end}` refer to positions outside the
 * contents of the string.
 *
 * This gives us 2N + 2 possible positions to refer to within a string, where N
 * is the number of characters.
 *
 * If the position is specified with a bare number, the side defaults to
 * `Side.Before`.
 *
 * If a SequencePlace is the endpoint of a range (e.g. start/end of an interval or search range),
 * the Side value means it is exclusive if it is nearer to the other position and inclusive if it is farther.
 * E.g. the start of a range with Side.After is exclusive of the character at the position.
 * @alpha
 */
export type SequencePlace = number | "start" | "end" | InteriorSequencePlace;

/**
 * A sequence place that does not refer to the special endpoint segments.
 *
 * See {@link SequencePlace} for additional context.
 * @alpha
 */
export interface InteriorSequencePlace {
	pos: number;
	side: Side;
}

/**
 * Defines a side relative to a character in a sequence.
 *
 * @remarks See {@link SequencePlace} for additional context on usage.
 * @alpha
 */
export enum Side {
	Before = 0,
	After = 1,
}

const reservedIntervalIdKey = "intervalId";

export interface ISerializedIntervalCollectionV2 {
	label: string;
	version: 2;
	intervals: CompressedSerializedInterval[];
}

export function sidesFromStickiness(stickiness: IntervalStickiness) {
	const startSide = (stickiness & IntervalStickiness.START) !== 0 ? Side.After : Side.Before;
	const endSide = (stickiness & IntervalStickiness.END) !== 0 ? Side.Before : Side.After;

	return { startSide, endSide };
}

/**
 * Decompress an interval after loading a summary from JSON. The exact format
 * of this compression is unspecified and subject to change
 */
function decompressInterval(
	interval: CompressedSerializedInterval,
	label?: string,
): ISerializedInterval {
	const stickiness = interval[5] ?? IntervalStickiness.END;
	const { startSide, endSide } = sidesFromStickiness(stickiness);
	return {
		start: interval[0],
		end: interval[1],
		sequenceNumber: interval[2],
		intervalType: interval[3],
		properties: { ...interval[4], [reservedRangeLabelsKey]: [label] },
		stickiness,
		startSide,
		endSide,
	};
}

/**
 * Compress an interval prior to serialization as JSON. The exact format of this
 * compression is unspecified and subject to change
 */
function compressInterval(interval: ISerializedInterval): CompressedSerializedInterval {
	const { start, end, sequenceNumber, intervalType, properties } = interval;

	let base: CompressedSerializedInterval = [
		start,
		end,
		sequenceNumber,
		intervalType,
		// remove the `referenceRangeLabels` property as it is already stored
		// in the `label` field of the summary
		{ ...properties, [reservedRangeLabelsKey]: undefined },
	];

	if (interval.stickiness !== undefined && interval.stickiness !== IntervalStickiness.END) {
		// reassignment to make it easier for typescript to reason about types
		base = [...base, interval.stickiness];
	}

	return base;
}

export function endpointPosAndSide(
	start: SequencePlace | undefined,
	end: SequencePlace | undefined,
) {
	const startIsPlainEndpoint = typeof start === "number" || start === "start" || start === "end";
	const endIsPlainEndpoint = typeof end === "number" || end === "start" || end === "end";

	const startSide = startIsPlainEndpoint ? Side.Before : start?.side;
	const endSide = endIsPlainEndpoint ? Side.Before : end?.side;

	const startPos = startIsPlainEndpoint ? start : start?.pos;
	const endPos = endIsPlainEndpoint ? end : end?.pos;

	return {
		startSide,
		endSide,
		startPos,
		endPos,
	};
}

function toSequencePlace(pos: number | "start" | "end", side: Side): SequencePlace {
	return typeof pos === "number" ? { pos, side } : pos;
}

function toOptionalSequencePlace(
	pos: number | "start" | "end" | undefined,
	side: Side = Side.Before,
): SequencePlace | undefined {
	return typeof pos === "number" ? { pos, side } : pos;
}

export function computeStickinessFromSide(
	startPos: number | "start" | "end" | undefined = -1,
	startSide: Side = Side.Before,
	endPos: number | "start" | "end" | undefined = -1,
	endSide: Side = Side.Before,
): IntervalStickiness {
	let stickiness: IntervalStickiness = IntervalStickiness.NONE;

	if (startSide === Side.After || startPos === "start") {
		stickiness |= IntervalStickiness.START;
	}

	if (endSide === Side.Before || endPos === "end") {
		stickiness |= IntervalStickiness.END;
	}

	return stickiness as IntervalStickiness;
}

export function createIntervalIndex() {
	const helpers: IIntervalHelpers<Interval> = {
		create: createInterval,
	};
	const lc = new LocalIntervalCollection<Interval>(undefined as any as Client, "", helpers, {});
	return lc;
}

export class LocalIntervalCollection<TInterval extends ISerializableInterval> {
	private static readonly legacyIdPrefix = "legacy";
	public readonly overlappingIntervalsIndex: IOverlappingIntervalsIndex<TInterval>;
	public readonly idIntervalIndex: IIdIntervalIndex<TInterval>;
	public readonly endIntervalIndex: IEndpointIndex<TInterval>;
	private readonly indexes: Set<IntervalIndex<TInterval>>;

	constructor(
		private readonly client: Client,
		private readonly label: string,
		private readonly helpers: IIntervalHelpers<TInterval>,
		private readonly options: Partial<SequenceOptions>,
		/** Callback invoked each time one of the endpoints of an interval slides. */
		private readonly onPositionChange?: (
			interval: TInterval,
			previousInterval: TInterval,
		) => void,
	) {
		this.overlappingIntervalsIndex = new OverlappingIntervalsIndex(client, helpers);
		this.idIntervalIndex = createIdIntervalIndex<TInterval>();
		this.endIntervalIndex = new EndpointIndex(client, helpers);
		this.indexes = new Set([
			this.overlappingIntervalsIndex,
			this.idIntervalIndex,
			this.endIntervalIndex,
		]);
	}

	public createLegacyId(start: number | "start" | "end", end: number | "start" | "end"): string {
		// Create a non-unique ID based on start and end to be used on intervals that come from legacy clients
		// without ID's.
		return `${LocalIntervalCollection.legacyIdPrefix}${start}-${end}`;
	}

	/**
	 * Validates that a serialized interval has the ID property. Creates an ID
	 * if one does not already exist
	 *
	 * @param serializedInterval - The interval to be checked
	 * @returns The interval's existing or newly created id
	 */
	public ensureSerializedId(serializedInterval: ISerializedInterval): string {
		let id: string | undefined = serializedInterval.properties?.[reservedIntervalIdKey];
		if (id === undefined) {
			// Back-compat: 0.39 and earlier did not have IDs on intervals. If an interval from such a client
			// comes over the wire, create a non-unique one based on start/end.
			// This will allow all clients to refer to this interval consistently.
			id = this.createLegacyId(serializedInterval.start, serializedInterval.end);
			const newProps = {
				[reservedIntervalIdKey]: id,
			};
			serializedInterval.properties = addProperties(serializedInterval.properties, newProps);
		}
		// Make the ID immutable for safety's sake.
		Object.defineProperty(serializedInterval.properties, reservedIntervalIdKey, {
			configurable: false,
			enumerable: true,
			writable: false,
		});

		return id;
	}

	private removeIntervalFromIndexes(interval: TInterval) {
		for (const index of this.indexes) {
			index.remove(interval);
		}
	}

	public appendIndex(index: IntervalIndex<TInterval>) {
		this.indexes.add(index);
	}

	public removeIndex(index: IntervalIndex<TInterval>): boolean {
		return this.indexes.delete(index);
	}

	public removeExistingInterval(interval: TInterval) {
		this.removeIntervalFromIndexes(interval);
		this.removeIntervalListeners(interval);
	}

	public createInterval(
		start: SequencePlace,
		end: SequencePlace,
		intervalType: IntervalType,
		op?: ISequencedDocumentMessage,
	): TInterval {
		return this.helpers.create(
			this.label,
			start,
			end,
			this.client,
			intervalType,
			op,
			undefined,
			this.options.mergeTreeReferencesCanSlideToEndpoint,
		);
	}

	public addInterval(
		start: SequencePlace,
		end: SequencePlace,
		intervalType: IntervalType,
		props?: PropertySet,
		op?: ISequencedDocumentMessage,
	) {
		const interval: TInterval = this.createInterval(start, end, intervalType, op);
		if (interval) {
			if (!interval.properties) {
				interval.properties = createMap<any>();
			}

			if (props) {
				// This check is intended to prevent scenarios where a random interval is created and then
				// inserted into a collection. The aim is to ensure that the collection is created first
				// then the user can create/add intervals based on the collection
				if (
					props[reservedRangeLabelsKey] !== undefined &&
					props[reservedRangeLabelsKey][0] !== this.label
				) {
					throw new LoggingError(
						"Adding an interval that belongs to another interval collection is not permitted",
					);
				}
				interval.addProperties(props);
			}
			interval.properties[reservedIntervalIdKey] ??= uuid();
			this.add(interval);
		}
		return interval;
	}

	private linkEndpointsToInterval(interval: TInterval): void {
		if (interval instanceof SequenceInterval) {
			interval.start.addProperties({ interval });
			interval.end.addProperties({ interval });
		}
	}

	private addIntervalToIndexes(interval: TInterval) {
		for (const index of this.indexes) {
			index.add(interval);
		}
	}

	public add(interval: TInterval): void {
		this.linkEndpointsToInterval(interval);
		this.addIntervalToIndexes(interval);
		this.addIntervalListeners(interval);
	}

	public changeInterval(
		interval: TInterval,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
	) {
		const newInterval = interval.modify(
			this.label,
			start,
			end,
			op,
			localSeq,
			this.options.mergeTreeReferencesCanSlideToEndpoint,
		) as TInterval | undefined;
		if (newInterval) {
			this.removeExistingInterval(interval);
			this.add(newInterval);
		}
		return newInterval;
	}

	public serialize(): ISerializedIntervalCollectionV2 {
		return {
			label: this.label,
			intervals: Array.from(this.idIntervalIndex, (interval) =>
				compressInterval(interval.serialize()),
			),
			version: 2,
		};
	}

	private addIntervalListeners(interval: TInterval) {
		const cloneRef = (ref: LocalReferencePosition) => {
			const segment = ref.getSegment();
			if (segment === undefined) {
				// Cloning is unnecessary: refs which have slid off the string entirely
				// never get slid back on. Creation code for refs doesn't accept undefined segment
				// either, so this must be special-cased.
				return ref;
			}

			return this.client.createLocalReferencePosition(
				segment,
				ref.getOffset(),
				ReferenceType.Transient,
				ref.properties,
				ref.slidingPreference,
				ref.canSlideToEndpoint,
			);
		};
		if (interval instanceof SequenceInterval) {
			let previousInterval: (TInterval & SequenceInterval) | undefined;
			let pendingChanges = 0;
			interval.addPositionChangeListeners(
				() => {
					pendingChanges++;
					// Note: both start and end can change and invoke beforeSlide on each endpoint before afterSlide.
					if (!previousInterval) {
						previousInterval = interval.clone() as TInterval & SequenceInterval;
						previousInterval.start = cloneRef(previousInterval.start);
						previousInterval.end = cloneRef(previousInterval.end);
						this.removeIntervalFromIndexes(interval);
					}
				},
				() => {
					assert(
						previousInterval !== undefined,
						0x3fa /* Invalid interleaving of before/after slide */,
					);
					pendingChanges--;
					if (pendingChanges === 0) {
						this.addIntervalToIndexes(interval);
						this.onPositionChange?.(interval, previousInterval);
						previousInterval = undefined;
					}
				},
			);
		}
	}

	private removeIntervalListeners(interval: TInterval) {
		if (interval instanceof SequenceInterval) {
			interval.removePositionChangeListeners();
		}
	}
}

class SequenceIntervalCollectionFactory
	implements IValueFactory<IntervalCollection<SequenceInterval>>
{
	public load(
		emitter: IValueOpEmitter,
		raw: ISerializedInterval[] | ISerializedIntervalCollectionV2 = [],
		options?: Partial<SequenceOptions>,
	): IntervalCollection<SequenceInterval> {
		return new IntervalCollection<SequenceInterval>(
			sequenceIntervalHelpers,
			true,
			emitter,
			raw,
			options,
		);
	}

	public store(
		value: IntervalCollection<SequenceInterval>,
	): ISerializedInterval[] | ISerializedIntervalCollectionV2 {
		return value.serializeInternal();
	}
}

export class SequenceIntervalCollectionValueType
	implements IValueType<IntervalCollection<SequenceInterval>>
{
	public static Name = "sharedStringIntervalCollection";

	public get name(): string {
		return SequenceIntervalCollectionValueType.Name;
	}

	public get factory(): IValueFactory<IntervalCollection<SequenceInterval>> {
		return SequenceIntervalCollectionValueType._factory;
	}

	public get ops(): Map<IntervalOpType, IValueOperation<IntervalCollection<SequenceInterval>>> {
		return SequenceIntervalCollectionValueType._ops;
	}

	private static readonly _factory: IValueFactory<IntervalCollection<SequenceInterval>> =
		new SequenceIntervalCollectionFactory();

	private static readonly _ops = makeOpsMap<SequenceInterval>();
}

class IntervalCollectionFactory implements IValueFactory<IntervalCollection<Interval>> {
	public load(
		emitter: IValueOpEmitter,
		raw: ISerializedInterval[] | ISerializedIntervalCollectionV2 = [],
		options?: Partial<SequenceOptions>,
	): IntervalCollection<Interval> {
		const helpers: IIntervalHelpers<Interval> = {
			create: createInterval,
		};
		const collection = new IntervalCollection<Interval>(helpers, false, emitter, raw, options);
		collection.attachGraph(undefined as any as Client, "");
		return collection;
	}

	public store(value: IntervalCollection<Interval>): ISerializedIntervalCollectionV2 {
		return value.serializeInternal();
	}
}

export class IntervalCollectionValueType implements IValueType<IntervalCollection<Interval>> {
	public static Name = "sharedIntervalCollection";

	public get name(): string {
		return IntervalCollectionValueType.Name;
	}

	public get factory(): IValueFactory<IntervalCollection<Interval>> {
		return IntervalCollectionValueType._factory;
	}

	public get ops(): Map<IntervalOpType, IValueOperation<IntervalCollection<Interval>>> {
		return IntervalCollectionValueType._ops;
	}

	private static readonly _factory: IValueFactory<IntervalCollection<Interval>> =
		new IntervalCollectionFactory();
	private static readonly _ops = makeOpsMap<Interval>();
}

export function makeOpsMap<T extends ISerializableInterval>(): Map<
	IntervalOpType,
	IValueOperation<IntervalCollection<T>>
> {
	const rebase: IValueOperation<IntervalCollection<T>>["rebase"] = (
		collection,
		op,
		localOpMetadata,
	) => {
		const { localSeq } = localOpMetadata;
		const rebasedValue = collection.rebaseLocalInterval(op.opName, op.value, localSeq);
		if (rebasedValue === undefined) {
			return undefined;
		}
		const rebasedOp = { ...op, value: rebasedValue };
		return { rebasedOp, rebasedLocalOpMetadata: localOpMetadata };
	};

	return new Map<IntervalOpType, IValueOperation<IntervalCollection<T>>>([
		[
			IntervalOpType.ADD,
			{
				process: (collection, params, local, op, localOpMetadata) => {
					// if params is undefined, the interval was deleted during
					// rebasing
					if (!params) {
						return;
					}
					assert(op !== undefined, 0x3fb /* op should exist here */);
					collection.ackAdd(params, local, op, localOpMetadata);
				},
				rebase,
			},
		],
		[
			IntervalOpType.DELETE,
			{
				process: (collection, params, local, op) => {
					assert(op !== undefined, 0x3fc /* op should exist here */);
					collection.ackDelete(params, local, op);
				},
				rebase: (collection, op, localOpMetadata) => {
					// Deletion of intervals is based on id, so requires no rebasing.
					return { rebasedOp: op, rebasedLocalOpMetadata: localOpMetadata };
				},
			},
		],
		[
			IntervalOpType.CHANGE,
			{
				process: (collection, params, local, op, localOpMetadata) => {
					// if params is undefined, the interval was deleted during
					// rebasing
					if (!params) {
						return;
					}
					assert(op !== undefined, 0x3fd /* op should exist here */);
					collection.ackChange(params, local, op, localOpMetadata);
				},
				rebase,
			},
		],
	]);
}

/**
 * @alpha
 */
export type DeserializeCallback = (properties: PropertySet) => void;

class IntervalCollectionIterator<TInterval extends ISerializableInterval>
	implements Iterator<TInterval>
{
	private readonly results: TInterval[];
	private index: number;

	constructor(
		collection: IntervalCollection<TInterval>,
		iteratesForward: boolean = true,
		start?: number,
		end?: number,
	) {
		this.results = [];
		this.index = 0;

		collection.gatherIterationResults(this.results, iteratesForward, start, end);
	}

	public next(): IteratorResult<TInterval> {
		if (this.index < this.results.length) {
			return {
				value: this.results[this.index++],
				done: false,
			};
		}

		return {
			value: undefined,
			done: true,
		};
	}
}

/**
 * Change events emitted by `IntervalCollection`s
 * @alpha
 */
export interface IIntervalCollectionEvent<TInterval extends ISerializableInterval> extends IEvent {
	/**
	 * This event is invoked whenever the endpoints of an interval may have changed.
	 * This can happen on:
	 * - local endpoint modification
	 * - ack of a remote endpoint modification
	 * - position change due to segment sliding (slides due to mergeTree segment deletion will always appear local)
	 * The `interval` argument reflects the new values.
	 * `previousInterval` contains transient `ReferencePosition`s at the same location as the interval's original
	 * endpoints. These references should be used for position information only.
	 * `local` reflects whether the change originated locally.
	 * `op` is defined if and only if the server has acked this change.
	 * `slide` is true if the change is due to sliding on removal of position
	 */
	(
		event: "changeInterval",
		listener: (
			interval: TInterval,
			previousInterval: TInterval,
			local: boolean,
			op: ISequencedDocumentMessage | undefined,
			slide: boolean,
		) => void,
	): void;
	/**
	 * This event is invoked whenever an interval is added or removed from the collection.
	 * `local` reflects whether the change originated locally.
	 * `op` is defined if and only if the server has acked this change.
	 */
	(
		event: "addInterval" | "deleteInterval",
		listener: (
			interval: TInterval,
			local: boolean,
			op: ISequencedDocumentMessage | undefined,
		) => void,
	): void;
	/**
	 * This event is invoked whenever an interval's properties have changed.
	 * `interval` reflects the state of the updated properties.
	 * `propertyDeltas` is a map-like whose keys contain all values that were changed, and whose
	 * values contain all previous values of the property set.
	 * This object can be used directly in a call to `changeProperties` to revert the property change if desired.
	 * `local` reflects whether the change originated locally.
	 * `op` is defined if and only if the server has acked this change.
	 */
	(
		event: "propertyChanged",
		listener: (
			interval: TInterval,
			propertyDeltas: PropertySet,
			local: boolean,
			op: ISequencedDocumentMessage | undefined,
		) => void,
	): void;
}

// solely for type checking in the implementation of add - will be removed once
// deprecated signatures are removed
const isSequencePlace = (place: any): place is SequencePlace => {
	return typeof place === "number" || typeof place === "string" || place.pos !== undefined;
};

/**
 * Collection of intervals that supports addition, modification, removal, and efficient spatial querying.
 * Changes to this collection will be incur updates on collaborating clients (i.e. they are not local-only).
 * @alpha
 */
export interface IIntervalCollection<TInterval extends ISerializableInterval>
	extends TypedEventEmitter<IIntervalCollectionEvent<TInterval>> {
	readonly attached: boolean;
	/**
	 * Attaches an index to this collection.
	 * All intervals which are part of this collection will be added to the index, and the index will automatically
	 * be updated when this collection updates due to local or remote changes.
	 *
	 * @remarks After attaching an index to an interval collection, applications should typically store this
	 * index somewhere in their in-memory data model for future reference and querying.
	 */
	attachIndex(index: IntervalIndex<TInterval>): void;
	/**
	 * Detaches an index from this collection.
	 * All intervals which are part of this collection will be removed from the index, and updates to this collection
	 * due to local or remote changes will no longer incur updates to the index.
	 *
	 * @returns `false` if the target index cannot be found in the indexes, otherwise remove all intervals in the index and return `true`.
	 */
	detachIndex(index: IntervalIndex<TInterval>): boolean;
	/**
	 * @returns the interval in this collection that has the provided `id`.
	 * If no interval in the collection has this `id`, returns `undefined`.
	 */
	getIntervalById(id: string): TInterval | undefined;
	/**
	 * Creates a new interval and add it to the collection.
	 * @deprecated call IntervalCollection.add without specifying an intervalType
	 * @param start - interval start position (inclusive)
	 * @param end - interval end position (exclusive)
	 * @param intervalType - type of the interval. All intervals are SlideOnRemove. Intervals may not be Transient.
	 * @param props - properties of the interval
	 * @returns The created interval
	 * @remarks See documentation on {@link SequenceInterval} for comments on
	 * interval endpoint semantics: there are subtleties with how the current
	 * half-open behavior is represented.
	 *
	 * Note that intervals may behave unexpectedly if the entire contents
	 * of the string are deleted. In this case, it is possible for one endpoint
	 * of the interval to become detached, while the other remains on the string.
	 *
	 * By adjusting the `side` and `pos` values of the `start` and `end` parameters,
	 * it is possible to control whether the interval expands to include content
	 * inserted at its start or end.
	 *
	 *	See {@link SequencePlace} for more details on the model.
	 *
	 *	@example
	 *
	 *	Given the string "ABCD":
	 *
	 *```typescript
	 *	// Refers to "BC". If any content is inserted before B or after C, this
	 *	// interval will include that content
	 *	//
	 *	// Picture:
	 *	// \{start\} - A[- B - C -]D - \{end\}
	 *	// \{start\} - A - B - C - D - \{end\}
	 *	collection.add(\{ pos: 0, side: Side.After \}, \{ pos: 3, side: Side.Before \}, IntervalType.SlideOnRemove);
	 *	// Equivalent to specifying the same positions and Side.Before.
	 *	// Refers to "ABC". Content inserted after C will be included in the
	 *	// interval, but content inserted before A will not.
	 *	// \{start\} -[A - B - C -]D - \{end\}
	 *	// \{start\} - A - B - C - D - \{end\}
	 *	collection.add(0, 3, IntervalType.SlideOnRemove);
	 *```
	 *
	 * In the case of the first example, if text is deleted,
	 *
	 * ```typescript
	 *	// Delete the character "B"
	 *	string.removeRange(1, 2);
	 * ```
	 *
	 * The start point of the interval will slide to the position immediately
	 * before "C", and the same will be true.
	 *
	 * ```
	 * \{start\} - A[- C -]D - \{end\}
	 * ```
	 *
	 * In this case, text inserted immediately before "C" would be included in
	 * the interval.
	 *
	 * ```typescript
	 * string.insertText(1, "EFG");
	 * ```
	 *
	 * With the string now being,
	 *
	 * ```
	 * \{start\} - A[- E - F - G - C -]D - \{end\}
	 * ```
	 *
	 * @privateRemarks TODO: ADO:5205 the above comment regarding behavior in
	 * the case that the entire interval has been deleted should be resolved at
	 * the same time as this ticket
	 */
	add(
		start: SequencePlace,
		end: SequencePlace,
		intervalType: IntervalType,
		props?: PropertySet,
	): TInterval;
	/**
	 * Creates a new interval and add it to the collection.
	 * @param start - interval start position (inclusive)
	 * @param end - interval end position (exclusive)
	 * @param props - properties of the interval
	 * @returns - the created interval
	 * @remarks - See documentation on {@link SequenceInterval} for comments on interval endpoint semantics: there are subtleties
	 * with how the current half-open behavior is represented.
	 */
	add({
		start,
		end,
		props,
	}: {
		start: SequencePlace;
		end: SequencePlace;
		props?: PropertySet;
	}): TInterval;
	/**
	 * Removes an interval from the collection.
	 * @param id - Id of the interval to remove
	 * @returns the removed interval
	 */
	removeIntervalById(id: string): TInterval | undefined;
	/**
	 * Changes the properties on an existing interval.
	 * @deprecated - call change with the id and and object containing the new properties
	 * @param id - Id of the interval whose properties should be changed
	 * @param props - Property set to apply to the interval. Shallow merging is used between any existing properties
	 * and `prop`, i.e. the interval will end up with a property object equivalent to `{ ...oldProps, ...props }`.
	 */
	changeProperties(id: string, props: PropertySet): void;
	/**
	 * Changes the endpoints of an existing interval.
	 * @deprecated - call change with the start and end parameters encapsulated in an object
	 * @param id - Id of the interval to change
	 * @param start - New start value. To leave the endpoint unchanged, pass the current value.
	 * @param end - New end value. To leave the endpoint unchanged, pass the current value.
	 * @returns the interval that was changed, if it existed in the collection.
	 */
	change(id: string, start: SequencePlace, end: SequencePlace): TInterval | undefined;
	/**
	 * Changes the endpoints, properties, or both of an existing interval.
	 * @param id - Id of the Interval to change
	 * @returns the interval that was changed, if it existed in the collection.
	 * Pass the desired new start position, end position, and/or properties in an object. Start and end positions must be changed
	 * simultaneously - they must either both be specified or both undefined. To only change the properties, leave both endpoints
	 * undefined. To only change the endpoints, leave the properties undefined.
	 */
	change(
		id: string,
		{ start, end, props }: { start?: SequencePlace; end?: SequencePlace; props?: PropertySet },
	): TInterval | undefined;

	attachDeserializer(onDeserialize: DeserializeCallback): void;
	/**
	 * @returns an iterator over all intervals in this collection.
	 */
	[Symbol.iterator](): Iterator<TInterval>;

	/**
	 * @returns a forward iterator over all intervals in this collection with start point equal to `startPosition`.
	 */
	CreateForwardIteratorWithStartPosition(startPosition: number): Iterator<TInterval>;

	/**
	 * @returns a backward iterator over all intervals in this collection with start point equal to `startPosition`.
	 */
	CreateBackwardIteratorWithStartPosition(startPosition: number): Iterator<TInterval>;

	/**
	 * @returns a forward iterator over all intervals in this collection with end point equal to `endPosition`.
	 */
	CreateForwardIteratorWithEndPosition(endPosition: number): Iterator<TInterval>;

	/**
	 * @returns a backward iterator over all intervals in this collection with end point equal to `endPosition`.
	 */
	CreateBackwardIteratorWithEndPosition(endPosition: number): Iterator<TInterval>;

	/**
	 * Gathers iteration results that optionally match a start/end criteria into the provided array.
	 * @param results - Array to gather the results into. In lieu of a return value, this array will be populated with
	 * intervals matching the query upon edit.
	 * @param iteratesForward - whether or not iteration should be in the forward direction
	 * @param start - If provided, only match intervals whose start point is equal to `start`.
	 * @param end - If provided, only match intervals whose end point is equal to `end`.
	 */
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number,
		end?: number,
	): void;

	/**
	 * @deprecated - Users must manually attach the corresponding interval index to utilize this functionality, for instance:
	 *
	 * ```typescript
	 * const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
	 * collection.attachIndex(overlappingIntervalsIndex)
	 * const result = overlappingIntervalsIndex.findOverlappingIntervals(start, end);
	 * ```
	 *
	 * @returns an array of all intervals in this collection that overlap with the interval
	 * `[startPosition, endPosition]`.
	 */
	findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[];

	/**
	 * Applies a function to each interval in this collection.
	 */
	map(fn: (interval: TInterval) => void): void;

	/**
	 * @deprecated - due to the forthcoming change where the endpointIndex will no longer be
	 * automatically added to the collection. Users are advised to independently attach the
	 * index to the collection and utilize the API accordingly, for instance:
	 * ```typescript
	 * const endpointIndex = createEndpointIndex(sharedString);
	 * collection.attachIndex(endpointIndex);
	 * const result1 = endpointIndex.previousInterval(pos);
	 * ```
	 * If an index is used repeatedly, applications should generally attach it once and store it in memory.
	 */
	previousInterval(pos: number): TInterval | undefined;

	/**
	 * @deprecated - due to the forthcoming change where the endpointIndex will no longer be
	 * automatically added to the collection. Users are advised to independently attach the
	 * index to the collection and utilize the API accordingly, for instance:
	 * ```typescript
	 * const endpointIndex = createEndpointIndex(sharedString);
	 * collection.attachIndex(endpointIndex);
	 * const result2 = endpointIndex.nextInterval(pos);
	 * ```
	 */
	nextInterval(pos: number): TInterval | undefined;
}

/**
 * {@inheritdoc IIntervalCollection}
 */
export class IntervalCollection<TInterval extends ISerializableInterval>
	extends TypedEventEmitter<IIntervalCollectionEvent<TInterval>>
	implements IIntervalCollection<TInterval>
{
	private savedSerializedIntervals?: ISerializedInterval[];
	private localCollection: LocalIntervalCollection<TInterval> | undefined;
	private onDeserialize: DeserializeCallback | undefined;
	private client: Client | undefined;
	private readonly localSeqToSerializedInterval = new Map<
		number,
		ISerializedInterval | SerializedIntervalDelta
	>();
	private readonly localSeqToRebasedInterval = new Map<
		number,
		ISerializedInterval | SerializedIntervalDelta
	>();
	private readonly pendingChangesStart: Map<string, ISerializedInterval[]> = new Map<
		string,
		ISerializedInterval[]
	>();
	private readonly pendingChangesEnd: Map<string, ISerializedInterval[]> = new Map<
		string,
		ISerializedInterval[]
	>();

	public get attached(): boolean {
		return !!this.localCollection;
	}

	/** @internal */
	constructor(
		private readonly helpers: IIntervalHelpers<TInterval>,
		private readonly requiresClient: boolean,
		private readonly emitter: IValueOpEmitter,
		serializedIntervals: ISerializedInterval[] | ISerializedIntervalCollectionV2,
		private readonly options: Partial<SequenceOptions> = {},
	) {
		super();

		this.savedSerializedIntervals = Array.isArray(serializedIntervals)
			? serializedIntervals
			: serializedIntervals.intervals.map((i) =>
					decompressInterval(i, serializedIntervals.label),
			  );
	}

	/**
	 * {@inheritdoc IIntervalCollection.attachIndex}
	 */
	public attachIndex(index: IntervalIndex<TInterval>): void {
		if (!this.attached) {
			throw new LoggingError("The local interval collection must exist");
		}
		for (const interval of this) {
			index.add(interval);
		}

		this.localCollection?.appendIndex(index);
	}

	/**
	 * {@inheritdoc IIntervalCollection.detachIndex}
	 */
	public detachIndex(index: IntervalIndex<TInterval>): boolean {
		if (!this.attached) {
			throw new LoggingError("The local interval collection must exist");
		}

		// Avoid removing intervals if the index does not exist
		if (!this.localCollection?.removeIndex(index)) {
			return false;
		}

		for (const interval of this) {
			index.remove(interval);
		}

		return true;
	}

	private rebasePositionWithSegmentSlide(
		pos: number | "start" | "end",
		seqNumberFrom: number,
		localSeq: number,
	): number | "start" | "end" | undefined {
		if (!this.client) {
			throw new LoggingError("mergeTree client must exist");
		}

		if (pos === "start" || pos === "end") {
			return pos;
		}

		const { clientId } = this.client.getCollabWindow();
		const { segment, offset } = this.client.getContainingSegment(
			pos,
			{
				referenceSequenceNumber: seqNumberFrom,
				clientId: this.client.getLongClientId(clientId),
			},
			localSeq,
		);

		// if segment is undefined, it slid off the string
		assert(segment !== undefined, 0x54e /* No segment found */);

		const segoff =
			getSlideToSegoff(
				{ segment, offset },
				undefined,
				this.options.mergeTreeReferencesCanSlideToEndpoint,
			) ?? segment;

		// case happens when rebasing op, but concurrently entire string has been deleted
		if (segoff.segment === undefined || segoff.offset === undefined) {
			return DetachedReferencePosition;
		}

		assert(
			offset !== undefined && 0 <= offset && offset < segment.cachedLength,
			0x54f /* Invalid offset */,
		);
		return this.client.findReconnectionPosition(segoff.segment, localSeq) + segoff.offset;
	}

	private computeRebasedPositions(
		localSeq: number,
	): ISerializedInterval | SerializedIntervalDelta {
		assert(
			this.client !== undefined,
			0x550 /* Client should be defined when computing rebased position */,
		);
		const original = this.localSeqToSerializedInterval.get(localSeq);
		assert(
			original !== undefined,
			0x551 /* Failed to store pending serialized interval info for this localSeq. */,
		);
		const rebased = { ...original };
		const { start, end, sequenceNumber } = original;
		if (start !== undefined) {
			rebased.start = this.rebasePositionWithSegmentSlide(start, sequenceNumber, localSeq);
		}
		if (end !== undefined) {
			rebased.end = this.rebasePositionWithSegmentSlide(end, sequenceNumber, localSeq);
		}
		return rebased;
	}

	/** @internal */
	public attachGraph(client: Client, label: string) {
		if (this.attached) {
			throw new LoggingError("Only supports one Sequence attach");
		}

		if (client === undefined && this.requiresClient) {
			throw new LoggingError("Client required for this collection");
		}

		// Instantiate the local interval collection based on the saved intervals
		this.client = client;
		if (client) {
			client.on("normalize", () => {
				for (const localSeq of this.localSeqToSerializedInterval.keys()) {
					this.localSeqToRebasedInterval.set(
						localSeq,
						this.computeRebasedPositions(localSeq),
					);
				}
			});
		}

		this.localCollection = new LocalIntervalCollection<TInterval>(
			client,
			label,
			this.helpers,
			this.options,
			(interval, previousInterval) => this.emitChange(interval, previousInterval, true, true),
		);
		if (this.savedSerializedIntervals) {
			for (const serializedInterval of this.savedSerializedIntervals) {
				this.localCollection.ensureSerializedId(serializedInterval);
				const {
					start: startPos,
					end: endPos,
					intervalType,
					properties,
					startSide,
					endSide,
				} = serializedInterval;
				const start =
					typeof startPos === "number" && startSide !== undefined
						? { pos: startPos, side: startSide }
						: startPos;
				const end =
					typeof endPos === "number" && endSide !== undefined
						? { pos: endPos, side: endSide }
						: endPos;
				const interval = this.helpers.create(
					label,
					start,
					end,
					client,
					intervalType,
					undefined,
					true,
					this.options.mergeTreeReferencesCanSlideToEndpoint,
				);
				if (properties) {
					interval.addProperties(properties);
				}
				this.localCollection.add(interval);
			}
		}
		this.savedSerializedIntervals = undefined;
	}

	/**
	 * Gets the next local sequence number, modifying this client's collab window in doing so.
	 */
	private getNextLocalSeq(): number {
		if (this.client) {
			return ++this.client.getCollabWindow().localSeq;
		}

		return 0;
	}

	private emitChange(
		interval: TInterval,
		previousInterval: TInterval,
		local: boolean,
		slide: boolean,
		op?: ISequencedDocumentMessage,
	): void {
		// Temporarily make references transient so that positional queries work (non-transient refs
		// on resolve to DetachedPosition on any segments that don't contain them). The original refType
		// is restored as single-endpoint changes re-use previous references.
		let startRefType: ReferenceType;
		let endRefType: ReferenceType;
		if (previousInterval instanceof SequenceInterval) {
			startRefType = previousInterval.start.refType;
			endRefType = previousInterval.end.refType;
			previousInterval.start.refType = ReferenceType.Transient;
			previousInterval.end.refType = ReferenceType.Transient;
			this.emit("changeInterval", interval, previousInterval, local, op, slide);
			previousInterval.start.refType = startRefType;
			previousInterval.end.refType = endRefType;
		} else {
			this.emit("changeInterval", interval, previousInterval, local, op, slide);
		}
	}

	/**
	 * {@inheritdoc IIntervalCollection.getIntervalById}
	 */
	public getIntervalById(id: string): TInterval | undefined {
		if (!this.localCollection) {
			throw new LoggingError("attach must be called before accessing intervals");
		}
		return this.localCollection.idIntervalIndex.getIntervalById(id);
	}

	private assertStickinessEnabled(start: SequencePlace, end: SequencePlace) {
		if (
			!(typeof start === "number" && typeof end === "number") &&
			!this.options.intervalStickinessEnabled
		) {
			throw new UsageError(
				"attempted to set interval stickiness without enabling `intervalStickinessEnabled` feature flag",
			);
		}
	}

	/**
	 * {@inheritdoc IIntervalCollection.add}
	 * @deprecated call IntervalCollection.add without specifying an intervalType
	 */
	public add(
		start: SequencePlace,
		end: SequencePlace,
		intervalType: IntervalType,
		props?: PropertySet,
	): TInterval;

	public add({
		start,
		end,
		props,
	}: {
		start: SequencePlace;
		end: SequencePlace;
		props?: PropertySet;
	}): TInterval;

	public add(
		start:
			| SequencePlace
			| {
					start: SequencePlace;
					end: SequencePlace;
					props?: PropertySet;
			  },
		end?: SequencePlace,
		intervalType?: IntervalType,
		props?: PropertySet,
	): TInterval {
		let intStart: SequencePlace;
		let intEnd: SequencePlace;
		let type: IntervalType;
		let properties: PropertySet | undefined;

		if (isSequencePlace(start)) {
			intStart = start;
			assert(end !== undefined, 0x7c0 /* end must be defined */);
			intEnd = end;
			assert(intervalType !== undefined, 0x7c1 /* intervalType must be defined */);
			type = intervalType;
			properties = props;
		} else {
			intStart = start.start;
			intEnd = start.end;
			type = IntervalType.SlideOnRemove;
			properties = start.props;
		}

		if (!this.localCollection) {
			throw new LoggingError("attach must be called prior to adding intervals");
		}
		if (type & IntervalType.Transient) {
			throw new LoggingError("Can not add transient intervals");
		}

		const { startSide, endSide, startPos, endPos } = endpointPosAndSide(intStart, intEnd);

		assert(
			startPos !== undefined &&
				endPos !== undefined &&
				startSide !== undefined &&
				endSide !== undefined,
			0x793 /* start and end cannot be undefined because they were not passed in as undefined */,
		);

		const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);

		this.assertStickinessEnabled(intStart, intEnd);

		const interval: TInterval = this.localCollection.addInterval(
			toSequencePlace(startPos, startSide),
			toSequencePlace(endPos, endSide),
			type,
			properties,
		);

		if (interval) {
			if (!this.isCollaborating && interval instanceof SequenceInterval) {
				setSlideOnRemove(interval.start);
				setSlideOnRemove(interval.end);
			}
			const serializedInterval: ISerializedInterval = {
				start: startPos,
				end: endPos,
				intervalType: type,
				properties: interval.properties,
				sequenceNumber: this.client?.getCurrentSeq() ?? 0,
				stickiness,
				startSide,
				endSide,
			};
			const localSeq = this.getNextLocalSeq();
			this.localSeqToSerializedInterval.set(localSeq, serializedInterval);
			// Local ops get submitted to the server. Remote ops have the deserializer run.
			this.emitter.emit("add", undefined, serializedInterval, { localSeq });
		}

		this.emit("addInterval", interval, true, undefined);

		return interval;
	}

	private deleteExistingInterval(
		interval: TInterval,
		local: boolean,
		op?: ISequencedDocumentMessage,
	) {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}
		// The given interval is known to exist in the collection.
		this.localCollection.removeExistingInterval(interval);

		if (interval) {
			// Local ops get submitted to the server. Remote ops have the deserializer run.
			if (local) {
				this.emitter.emit("delete", undefined, interval.serialize(), {
					localSeq: this.getNextLocalSeq(),
				});
			} else {
				if (this.onDeserialize) {
					this.onDeserialize(interval);
				}
			}
		}

		this.emit("deleteInterval", interval, local, op);
	}

	/**
	 * {@inheritdoc IIntervalCollection.removeIntervalById}
	 */
	public removeIntervalById(id: string): TInterval | undefined {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}
		const interval = this.localCollection.idIntervalIndex.getIntervalById(id);
		if (interval) {
			this.deleteExistingInterval(interval, true, undefined);
		}
		return interval;
	}

	/**
	 * {@inheritdoc IIntervalCollection.changeProperties}
	 * @deprecated - call change with the id and an object containing the new props values
	 */
	public changeProperties(id: string, props: PropertySet) {
		this.change(id, { props });
	}

	/**
	 * {@inheritdoc IIntervalCollection.change}
	 * @deprecated - call change with the id and an object containing the new start, end, and/or props values
	 */
	public change(id: string, start: SequencePlace, end: SequencePlace): TInterval | undefined;
	/**
	 * {@inheritdoc IIntervalCollection.change}
	 */
	public change(
		id: string,
		{ start, end, props }: { start?: SequencePlace; end?: SequencePlace; props?: PropertySet },
	): TInterval | undefined;
	public change(
		arg1: string,
		arg2: SequencePlace | { start?: SequencePlace; end?: SequencePlace; props?: PropertySet },
		arg3?: SequencePlace,
	): TInterval | undefined {
		const id: string = arg1;
		let start: SequencePlace | undefined;
		let end: SequencePlace | undefined;
		let props: PropertySet | undefined;
		if (isSequencePlace(arg2)) {
			start = arg2;
			end = arg3;
		} else {
			start = arg2.start;
			end = arg2.end;
			props = arg2.props;
		}

		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}

		// Force id to be a string.
		if (typeof id !== "string") {
			throw new UsageError("Change API requires an ID that is a string");
		}

		// Ensure that both start and end are defined or both are undefined.
		if ((start === undefined) !== (end === undefined)) {
			throw new UsageError(
				"Change API requires both start and end to be defined or undefined",
			);
		}

		// prevent the overwriting of an interval label, it should remain unchanged
		// once it has been inserted into the collection.
		if (props?.[reservedRangeLabelsKey] !== undefined) {
			throw new UsageError(
				"The label property should not be modified once inserted to the collection",
			);
		}

		const interval = this.getIntervalById(id);
		if (interval) {
			let deltaProps: PropertySet | undefined;
			let newInterval: TInterval | undefined;
			if (props !== undefined) {
				deltaProps = interval.addProperties(
					props,
					true,
					this.isCollaborating ? UnassignedSequenceNumber : UniversalSequenceNumber,
				);
			}
			if (start !== undefined && end !== undefined) {
				newInterval = this.localCollection.changeInterval(interval, start, end);
				if (!this.isCollaborating && newInterval instanceof SequenceInterval) {
					setSlideOnRemove(newInterval.start);
					setSlideOnRemove(newInterval.end);
				}
			}
			const serializedInterval: SerializedIntervalDelta = interval.serialize();
			const { startPos, startSide, endPos, endSide } = endpointPosAndSide(start, end);
			const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);
			serializedInterval.start = startPos;
			serializedInterval.end = endPos;
			serializedInterval.startSide = startSide;
			serializedInterval.endSide = endSide;
			serializedInterval.stickiness = stickiness;
			// Emit a property bag containing the ID and the other (if any) properties changed
			serializedInterval.properties = {
				[reservedIntervalIdKey]: interval.getIntervalId(),
				...props,
			};
			const localSeq = this.getNextLocalSeq();
			this.localSeqToSerializedInterval.set(localSeq, serializedInterval);
			this.emitter.emit("change", undefined, serializedInterval, { localSeq });
			if (deltaProps !== undefined) {
				this.emit("propertyChanged", interval, deltaProps, true, undefined);
			}
			if (newInterval) {
				this.addPendingChange(id, serializedInterval);
				this.emitChange(newInterval, interval, true, false);
			}
			return newInterval;
		}
		// No interval to change
		return undefined;
	}

	private get isCollaborating(): boolean {
		return this.client?.getCollabWindow().collaborating ?? false;
	}

	private addPendingChange(id: string, serializedInterval: SerializedIntervalDelta) {
		if (!this.isCollaborating) {
			return;
		}
		if (serializedInterval.start !== undefined) {
			this.addPendingChangeHelper(id, this.pendingChangesStart, serializedInterval);
		}
		if (serializedInterval.end !== undefined) {
			this.addPendingChangeHelper(id, this.pendingChangesEnd, serializedInterval);
		}
	}

	private addPendingChangeHelper(
		id: string,
		pendingChanges: Map<string, SerializedIntervalDelta[]>,
		serializedInterval: SerializedIntervalDelta,
	) {
		let entries: SerializedIntervalDelta[] | undefined = pendingChanges.get(id);
		if (!entries) {
			entries = [];
			pendingChanges.set(id, entries);
		}
		entries.push(serializedInterval);
	}

	private removePendingChange(serializedInterval: SerializedIntervalDelta) {
		// Change ops always have an ID.
		const id: string = serializedInterval.properties?.[reservedIntervalIdKey];
		if (serializedInterval.start !== undefined) {
			this.removePendingChangeHelper(id, this.pendingChangesStart, serializedInterval);
		}
		if (serializedInterval.end !== undefined) {
			this.removePendingChangeHelper(id, this.pendingChangesEnd, serializedInterval);
		}
	}

	private removePendingChangeHelper(
		id: string,
		pendingChanges: Map<string, SerializedIntervalDelta[]>,
		serializedInterval: SerializedIntervalDelta,
	) {
		const entries = pendingChanges.get(id);
		if (entries) {
			const pendingChange = entries.shift();
			if (entries.length === 0) {
				pendingChanges.delete(id);
			}
			if (
				pendingChange?.start !== serializedInterval.start ||
				pendingChange?.end !== serializedInterval.end
			) {
				throw new LoggingError("Mismatch in pending changes");
			}
		}
	}

	private hasPendingChangeStart(id: string) {
		const entries = this.pendingChangesStart.get(id);
		return entries && entries.length !== 0;
	}

	private hasPendingChangeEnd(id: string) {
		const entries = this.pendingChangesEnd.get(id);
		return entries && entries.length !== 0;
	}

	/** @internal */
	public ackChange(
		serializedInterval: ISerializedInterval,
		local: boolean,
		op: ISequencedDocumentMessage,
		localOpMetadata: IMapMessageLocalMetadata | undefined,
	) {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}

		if (local) {
			assert(
				localOpMetadata !== undefined,
				0x552 /* op metadata should be defined for local op */,
			);
			this.localSeqToSerializedInterval.delete(localOpMetadata?.localSeq);
			// This is an ack from the server. Remove the pending change.
			this.removePendingChange(serializedInterval);
		}

		// Note that the ID is in the property bag only to allow us to find the interval.
		// This API cannot change the ID, and writing to the ID property will result in an exception. So we
		// strip it out of the properties here.
		const { [reservedIntervalIdKey]: id, ...newProps } = serializedInterval.properties ?? {};
		assert(id !== undefined, 0x3fe /* id must exist on the interval */);
		const interval: TInterval | undefined = this.getIntervalById(id);
		if (!interval) {
			// The interval has been removed locally; no-op.
			return;
		}

		if (local) {
			// Let the propertyManager prune its pending change-properties set.
			interval.propertyManager?.ackPendingProperties({
				type: MergeTreeDeltaType.ANNOTATE,
				props: serializedInterval.properties ?? {},
			});

			this.ackInterval(interval, op);
		} else {
			// If there are pending changes with this ID, don't apply the remote start/end change, as the local ack
			// should be the winning change.
			let start: number | "start" | "end" | undefined;
			let end: number | "start" | "end" | undefined;
			// Track pending start/end independently of one another.
			if (!this.hasPendingChangeStart(id)) {
				start = serializedInterval.start;
			}
			if (!this.hasPendingChangeEnd(id)) {
				end = serializedInterval.end;
			}

			let newInterval = interval;
			if (start !== undefined || end !== undefined) {
				// If changeInterval gives us a new interval, work with that one. Otherwise keep working with
				// the one we originally found in the tree.
				newInterval =
					this.localCollection.changeInterval(
						interval,
						toOptionalSequencePlace(start, serializedInterval.startSide),
						toOptionalSequencePlace(end, serializedInterval.endSide),
						op,
					) ?? interval;
			}
			const deltaProps = newInterval.addProperties(newProps, true, op.sequenceNumber);
			if (this.onDeserialize) {
				this.onDeserialize(newInterval);
			}

			if (newInterval !== interval) {
				this.emitChange(newInterval, interval, local, false, op);
			}

			const changedProperties = Object.keys(newProps).length > 0;
			if (changedProperties) {
				this.emit("propertyChanged", interval, deltaProps, local, op);
			}
		}
	}

	/**
	 * {@inheritdoc IIntervalCollection.attachDeserializer}
	 */
	public attachDeserializer(onDeserialize: DeserializeCallback): void {
		// If no deserializer is specified can skip all processing work
		if (!onDeserialize) {
			return;
		}

		// Start by storing the callbacks so that any subsequent modifications make use of them
		this.onDeserialize = onDeserialize;

		// Trigger the async prepare work across all values in the collection
		if (this.attached) {
			this.map(onDeserialize);
		}
	}

	/**
	 * Returns new interval after rebasing. If undefined, the interval was
	 * deleted as a result of rebasing. This can occur if the interval applies
	 * to a range that no longer exists, and the interval was unable to slide.
	 *
	 * @internal
	 */
	public rebaseLocalInterval(
		opName: string,
		serializedInterval: SerializedIntervalDelta,
		localSeq: number,
	): SerializedIntervalDelta | undefined {
		if (!this.client) {
			// If there's no associated mergeTree client, the originally submitted op is still correct.
			return serializedInterval;
		}
		if (!this.attached) {
			throw new LoggingError("attachSequence must be called");
		}

		const { intervalType, properties, stickiness, startSide, endSide } = serializedInterval;

		const { start: startRebased, end: endRebased } =
			this.localSeqToRebasedInterval.get(localSeq) ?? this.computeRebasedPositions(localSeq);

		const intervalId = properties?.[reservedIntervalIdKey];
		const localInterval = this.localCollection?.idIntervalIndex.getIntervalById(intervalId);

		const rebased: SerializedIntervalDelta = {
			start: startRebased,
			end: endRebased,
			intervalType,
			sequenceNumber: this.client?.getCurrentSeq() ?? 0,
			properties,
			stickiness,
			startSide,
			endSide,
		};

		if (
			opName === "change" &&
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- ?? is not logically equivalent when .hasPendingChangeStart returns false.
			(this.hasPendingChangeStart(intervalId) || this.hasPendingChangeEnd(intervalId))
		) {
			this.removePendingChange(serializedInterval);
			this.addPendingChange(intervalId, rebased);
		}

		// if the interval slid off the string, rebase the op to be a noop and delete the interval.
		if (
			startRebased === DetachedReferencePosition ||
			endRebased === DetachedReferencePosition
		) {
			if (localInterval) {
				this.localCollection?.removeExistingInterval(localInterval);
			}
			return undefined;
		}

		if (localInterval !== undefined) {
			// we know we must be using `SequenceInterval` because `this.client` exists
			assert(
				localInterval instanceof SequenceInterval,
				0x3a0 /* localInterval must be `SequenceInterval` when used with client */,
			);
			// The rebased op may place this interval's endpoints on different segments. Calling `changeInterval` here
			// updates the local client's state to be consistent with the emitted op.
			this.localCollection?.changeInterval(
				localInterval,
				toOptionalSequencePlace(startRebased, startSide),
				toOptionalSequencePlace(endRebased, endSide),
				undefined,
				localSeq,
			);
		}

		return rebased;
	}

	private getSlideToSegment(
		lref: LocalReferencePosition,
	): { segment: ISegment | undefined; offset: number | undefined } | undefined {
		if (!this.client) {
			throw new LoggingError("client does not exist");
		}
		const segoff = { segment: lref.getSegment(), offset: lref.getOffset() };
		if (segoff.segment?.localRefs?.has(lref) !== true) {
			return undefined;
		}
		const newSegoff = getSlideToSegoff(
			segoff,
			undefined,
			this.options.mergeTreeReferencesCanSlideToEndpoint,
		);
		const value: { segment: ISegment | undefined; offset: number | undefined } | undefined =
			segoff.segment === newSegoff.segment && segoff.offset === newSegoff.offset
				? undefined
				: newSegoff;
		return value;
	}

	private ackInterval(interval: TInterval, op: ISequencedDocumentMessage): void {
		// Only SequenceIntervals need potential sliding
		if (!(interval instanceof SequenceInterval)) {
			return;
		}

		if (
			!refTypeIncludesFlag(interval.start, ReferenceType.StayOnRemove) &&
			!refTypeIncludesFlag(interval.end, ReferenceType.StayOnRemove)
		) {
			return;
		}

		const newStart = this.getSlideToSegment(interval.start);
		const newEnd = this.getSlideToSegment(interval.end);

		const id = interval.properties[reservedIntervalIdKey];
		const hasPendingStartChange = this.hasPendingChangeStart(id);
		const hasPendingEndChange = this.hasPendingChangeEnd(id);

		if (!hasPendingStartChange) {
			setSlideOnRemove(interval.start);
		}

		if (!hasPendingEndChange) {
			setSlideOnRemove(interval.end);
		}

		const needsStartUpdate = newStart !== undefined && !hasPendingStartChange;
		const needsEndUpdate = newEnd !== undefined && !hasPendingEndChange;

		if (needsStartUpdate || needsEndUpdate) {
			if (!this.localCollection) {
				throw new LoggingError("Attach must be called before accessing intervals");
			}

			// `interval`'s endpoints will get modified in-place, so clone it prior to doing so for event emission.
			const oldInterval = interval.clone() as TInterval & SequenceInterval;

			// In this case, where we change the start or end of an interval,
			// it is necessary to remove and re-add the interval listeners.
			// This ensures that the correct listeners are added to the LocalReferencePosition.
			this.localCollection.removeExistingInterval(interval);
			if (!this.client) {
				throw new LoggingError("client does not exist");
			}

			if (needsStartUpdate) {
				const props = interval.start.properties;
				interval.start = createPositionReferenceFromSegoff(
					this.client,
					newStart,
					interval.start.refType,
					op,
					undefined,
					undefined,
					startReferenceSlidingPreference(interval.stickiness),
					startReferenceSlidingPreference(interval.stickiness) ===
						SlidingPreference.BACKWARD,
				);
				if (props) {
					interval.start.addProperties(props);
				}
				const oldSeg = oldInterval.start.getSegment();
				// remove and rebuild start interval as transient for event
				this.client.removeLocalReferencePosition(oldInterval.start);
				oldInterval.start.refType = ReferenceType.Transient;
				oldSeg?.localRefs?.addLocalRef(oldInterval.start, oldInterval.start.getOffset());
			}
			if (needsEndUpdate) {
				const props = interval.end.properties;
				interval.end = createPositionReferenceFromSegoff(
					this.client,
					newEnd,
					interval.end.refType,
					op,
					undefined,
					undefined,
					endReferenceSlidingPreference(interval.stickiness),
					endReferenceSlidingPreference(interval.stickiness) ===
						SlidingPreference.FORWARD,
				);
				if (props) {
					interval.end.addProperties(props);
				}
				// remove and rebuild end interval as transient for event
				const oldSeg = oldInterval.end.getSegment();
				this.client.removeLocalReferencePosition(oldInterval.end);
				oldInterval.end.refType = ReferenceType.Transient;
				oldSeg?.localRefs?.addLocalRef(oldInterval.end, oldInterval.end.getOffset());
			}
			this.localCollection.add(interval);
			this.emitChange(interval, oldInterval as TInterval, true, true, op);
		}
	}

	/** @internal */
	public ackAdd(
		serializedInterval: ISerializedInterval,
		local: boolean,
		op: ISequencedDocumentMessage,
		localOpMetadata: IMapMessageLocalMetadata | undefined,
	) {
		if (local) {
			assert(
				localOpMetadata !== undefined,
				0x553 /* op metadata should be defined for local op */,
			);
			this.localSeqToSerializedInterval.delete(localOpMetadata.localSeq);
			const id: string = serializedInterval.properties?.[reservedIntervalIdKey];
			const localInterval = this.getIntervalById(id);
			if (localInterval) {
				this.ackInterval(localInterval, op);
			}
			return;
		}

		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		this.localCollection.ensureSerializedId(serializedInterval);

		const interval: TInterval = this.localCollection.addInterval(
			toSequencePlace(serializedInterval.start, serializedInterval.startSide ?? Side.Before),
			toSequencePlace(serializedInterval.end, serializedInterval.endSide ?? Side.Before),
			serializedInterval.intervalType,
			serializedInterval.properties,
			op,
		);

		if (interval) {
			if (this.onDeserialize) {
				this.onDeserialize(interval);
			}
		}

		this.emit("addInterval", interval, local, op);

		return interval;
	}

	/** @internal */
	public ackDelete(
		serializedInterval: ISerializedInterval,
		local: boolean,
		op: ISequencedDocumentMessage,
	): void {
		if (local) {
			// Local ops were applied when the message was created and there's no "pending delete"
			// state to book keep: remote operation application takes into account possibility of
			// locally deleted interval whenever a lookup happens.
			return;
		}

		if (!this.localCollection) {
			throw new LoggingError("attach must be called prior to deleting intervals");
		}

		const id = this.localCollection.ensureSerializedId(serializedInterval);
		const interval = this.localCollection.idIntervalIndex.getIntervalById(id);
		if (interval) {
			this.deleteExistingInterval(interval, local, op);
		}
	}

	/**
	 * @internal
	 */
	public serializeInternal(): ISerializedIntervalCollectionV2 {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.serialize();
	}

	/**
	 * @returns an iterator over all intervals in this collection.
	 */
	public [Symbol.iterator](): IntervalCollectionIterator<TInterval> {
		const iterator = new IntervalCollectionIterator<TInterval>(this);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateForwardIteratorWithStartPosition}
	 */
	public CreateForwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval> {
		const iterator = new IntervalCollectionIterator<TInterval>(this, true, startPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateBackwardIteratorWithStartPosition}
	 */
	public CreateBackwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval> {
		const iterator = new IntervalCollectionIterator<TInterval>(this, false, startPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateForwardIteratorWithEndPosition}
	 */
	public CreateForwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval> {
		const iterator = new IntervalCollectionIterator<TInterval>(
			this,
			true,
			undefined,
			endPosition,
		);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateBackwardIteratorWithEndPosition}
	 */
	public CreateBackwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval> {
		const iterator = new IntervalCollectionIterator<TInterval>(
			this,
			false,
			undefined,
			endPosition,
		);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.gatherIterationResults}
	 */
	public gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number,
		end?: number,
	) {
		if (!this.localCollection) {
			return;
		}

		this.localCollection.overlappingIntervalsIndex.gatherIterationResults(
			results,
			iteratesForward,
			start,
			end,
		);
	}

	/**
	 * {@inheritdoc IIntervalCollection.findOverlappingIntervals}
	 */
	public findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[] {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.overlappingIntervalsIndex.findOverlappingIntervals(
			startPosition,
			endPosition,
		);
	}

	/**
	 * {@inheritdoc IIntervalCollection.map}
	 */
	public map(fn: (interval: TInterval) => void) {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		for (const interval of this.localCollection.idIntervalIndex) {
			fn(interval);
		}
	}

	/**
	 * {@inheritdoc IIntervalCollection.previousInterval}
	 */
	public previousInterval(pos: number): TInterval | undefined {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.endIntervalIndex.previousInterval(pos);
	}

	/**
	 * {@inheritdoc IIntervalCollection.nextInterval}
	 */
	public nextInterval(pos: number): TInterval | undefined {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.endIntervalIndex.nextInterval(pos);
	}
}

function setSlideOnRemove(lref: LocalReferencePosition) {
	let refType = lref.refType;
	refType = refType & ~ReferenceType.StayOnRemove;
	refType = refType | ReferenceType.SlideOnRemove;
	lref.refType = refType;
}

/**
 * Information that identifies an interval within a `Sequence`.
 * @internal
 */
export interface IntervalLocator {
	/**
	 * Label for the collection the interval is a part of
	 */
	label: string;
	/**
	 * Interval within that collection
	 */
	interval: SequenceInterval;
}

/**
 * Returns an object that can be used to find the interval a given LocalReferencePosition belongs to.
 * @returns undefined if the reference position is not the endpoint of any interval (e.g. it was created
 * on the merge tree directly by app code), otherwise an {@link IntervalLocator} for the interval this
 * endpoint is a part of.
 * @internal
 */
export function intervalLocatorFromEndpoint(
	potentialEndpoint: LocalReferencePosition,
): IntervalLocator | undefined {
	const { interval, [reservedRangeLabelsKey]: collectionNameArray } =
		potentialEndpoint.properties ?? {};
	return interval && collectionNameArray?.length === 1
		? { label: collectionNameArray[0], interval }
		: undefined;
}
