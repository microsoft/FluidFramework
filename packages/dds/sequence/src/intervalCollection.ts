/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import {
	assert,
	DoublyLinkedList,
	unreachableCase,
	type ListNode,
} from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	Client,
	ISegment,
	LocalReferencePosition,
	PropertySet,
	ReferenceType,
	getSlideToSegoff,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	Side,
	SequencePlace,
	endpointPosAndSide,
	type ISegmentInternal,
	createLocalReconnectingPerspective,
	SlidingPreference,
} from "@fluidframework/merge-tree/internal";
import { LoggingError, UsageError } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	IntervalMessageLocalMetadata,
	SequenceOptions,
	type IIntervalCollectionTypeOperationValue,
	type IntervalAddLocalMetadata,
	type IntervalChangeLocalMetadata,
} from "./intervalCollectionMapInterfaces.js";
import {
	createIdIntervalIndex,
	EndpointIndex,
	OverlappingIntervalsIndex,
	type IEndpointIndex,
	type IIdIntervalIndex,
	type ISequenceOverlappingIntervalsIndex,
	type SequenceIntervalIndex,
} from "./intervalIndex/index.js";
import {
	CompressedSerializedInterval,
	ISerializedInterval,
	IntervalStickiness,
	IntervalType,
	SequenceInterval,
	SequenceIntervalClass,
	SerializedIntervalDelta,
	createPositionReferenceFromSegoff,
	createSequenceInterval,
	getSerializedProperties,
} from "./intervals/index.js";

export type ISerializedIntervalCollectionV1 = ISerializedInterval[];

export interface ISerializedIntervalCollectionV2 {
	label: string;
	version: 2;
	intervals: CompressedSerializedInterval[];
}

function sidesFromStickiness(stickiness: IntervalStickiness) {
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

export function toSequencePlace(
	pos: number | "start" | "end",
	side: Side | undefined,
): SequencePlace {
	return typeof pos === "number" && side !== undefined ? { pos, side } : pos;
}

export function toOptionalSequencePlace(
	pos: number | "start" | "end" | undefined,
	side: Side | undefined,
): SequencePlace | undefined {
	return typeof pos === "number" && side !== undefined ? { pos, side } : pos;
}

export class LocalIntervalCollection {
	public readonly overlappingIntervalsIndex: ISequenceOverlappingIntervalsIndex;
	public readonly idIntervalIndex: IIdIntervalIndex;
	public readonly endIntervalIndex: IEndpointIndex;
	private readonly indexes: Set<SequenceIntervalIndex>;

	constructor(
		private readonly client: Client,
		private readonly label: string,
		private readonly options: Partial<SequenceOptions>,
		/** Callback invoked each time one of the endpoints of an interval slides. */
		private readonly onPositionChange?: (
			interval: SequenceIntervalClass,
			previousInterval: SequenceIntervalClass,
		) => void,
	) {
		this.overlappingIntervalsIndex = new OverlappingIntervalsIndex(client);
		this.idIntervalIndex = createIdIntervalIndex();
		this.endIntervalIndex = new EndpointIndex(client);
		this.indexes = new Set([
			this.overlappingIntervalsIndex,
			this.idIntervalIndex,
			this.endIntervalIndex,
		]);
	}

	/**
	 * Validates that a serialized interval has the ID property. Creates an ID
	 * if one does not already exist
	 *
	 * @param serializedInterval - The interval to be checked
	 * @returns The interval's existing or newly created id
	 */

	private removeIntervalFromIndexes(interval: SequenceIntervalClass) {
		for (const index of this.indexes) {
			index.remove(interval);
		}
	}

	public appendIndex(index: SequenceIntervalIndex) {
		this.indexes.add(index);
	}

	public removeIndex(index: SequenceIntervalIndex): boolean {
		return this.indexes.delete(index);
	}

	public removeExistingInterval(interval: SequenceIntervalClass) {
		this.removeIntervalFromIndexes(interval);
		this.removeIntervalListeners(interval);
	}

	public addInterval(
		id: string,
		start: SequencePlace,
		end: SequencePlace,
		props?: PropertySet,
		op?: ISequencedDocumentMessage,
	) {
		// This check is intended to prevent scenarios where a random interval is created and then
		// inserted into a collection. The aim is to ensure that the collection is created first
		// then the user can create/add intervals based on the collection
		if (
			props?.[reservedRangeLabelsKey] !== undefined &&
			props[reservedRangeLabelsKey][0] !== this.label
		) {
			throw new LoggingError(
				"Adding an interval that belongs to another interval collection is not permitted",
			);
		}
		const interval: SequenceIntervalClass = createSequenceInterval(
			this.label,
			id,
			start,
			end,
			this.client,
			IntervalType.SlideOnRemove,
			op,
			undefined,
			this.options.mergeTreeReferencesCanSlideToEndpoint,
			props,
			false,
		);

		this.add(interval);
		return interval;
	}

	private linkEndpointsToInterval(interval: SequenceIntervalClass): void {
		interval.start.addProperties({ interval });
		interval.end.addProperties({ interval });
	}

	private addIntervalToIndexes(interval: SequenceIntervalClass) {
		for (const index of this.indexes) {
			index.add(interval);
		}
	}

	public add(interval: SequenceIntervalClass): void {
		this.linkEndpointsToInterval(interval);
		this.addIntervalToIndexes(interval);
		this.addIntervalListeners(interval);
	}

	public changeInterval(
		interval: SequenceIntervalClass,
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
		);
		if (newInterval) {
			this.removeExistingInterval(interval);
			this.add(newInterval);
		}
		return newInterval;
	}

	public serialize(
		version: "1" | "2",
	): ISerializedIntervalCollectionV1 | ISerializedIntervalCollectionV2 {
		if (version === "1") {
			return Array.from(this.idIntervalIndex, (interval) => interval.serialize());
		}
		return {
			label: this.label,
			intervals: Array.from(this.idIntervalIndex, (interval) =>
				compressInterval(interval.serialize()),
			),
			version: 2,
		};
	}

	private addIntervalListeners(interval: SequenceIntervalClass) {
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
		let previousInterval: SequenceIntervalClass | undefined;
		let pendingChanges = 0;
		interval.addPositionChangeListeners(
			() => {
				pendingChanges++;
				// Note: both start and end can change and invoke beforeSlide on each endpoint before afterSlide.
				if (!previousInterval) {
					previousInterval = interval.clone();
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

	private removeIntervalListeners(interval: SequenceIntervalClass) {
		interval.removePositionChangeListeners();
	}
}

/**
 * @legacy
 * @alpha
 */
export type DeserializeCallback = (properties: PropertySet) => void;

class IntervalCollectionIterator implements Iterator<SequenceIntervalClass> {
	private readonly results: SequenceIntervalClass[];
	private index: number;

	constructor(
		collection: IntervalCollection,
		iteratesForward: boolean = true,
		start?: number,
		end?: number,
	) {
		this.results = [];
		this.index = 0;

		collection.gatherIterationResults(this.results, iteratesForward, start, end);
	}

	public next(): IteratorResult<SequenceIntervalClass> {
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
 * @legacy
 * @alpha
 */
export interface ISequenceIntervalCollectionEvents extends IEvent {
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
			interval: SequenceInterval,
			previousInterval: SequenceInterval,
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
			interval: SequenceInterval,
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
			interval: SequenceInterval,
			propertyDeltas: PropertySet,
			local: boolean,
			op: ISequencedDocumentMessage | undefined,
		) => void,
	): void;
	/**
	 * This event is invoked whenever an interval's endpoints or properties (or both) have changed.
	 * `interval` reflects the state of the updated endpoints or properties.
	 * `propertyDeltas` is a map-like whose keys contain all values that were changed, and whose
	 * values contain all previous values of the property set.
	 * This object can be used directly in a call to `changeProperties` to revert the property change if desired.
	 * 'previousInterval' contains transient `ReferencePosition`s at the same location as the interval's original
	 * endpoints. These references should be used for position information only. In the case of a property change
	 * only, this argument should be undefined.
	 * `local` reflects whether the change originated locally.
	 * `slide` is true if the change is due to sliding on removal of position.
	 */
	(
		event: "changed",
		listener: (
			interval: SequenceInterval,
			propertyDeltas: PropertySet,
			previousInterval: SequenceInterval | undefined,
			local: boolean,
			slide: boolean,
		) => void,
	): void;
}

/**
 * Collection of intervals that supports addition, modification, removal, and efficient spatial querying.
 * Changes to this collection will be incur updates on collaborating clients (i.e. they are not local-only).
 * @legacy
 * @alpha
 */
export interface ISequenceIntervalCollection
	extends TypedEventEmitter<ISequenceIntervalCollectionEvents> {
	readonly attached: boolean;
	/**
	 * Attaches an index to this collection.
	 * All intervals which are part of this collection will be added to the index, and the index will automatically
	 * be updated when this collection updates due to local or remote changes.
	 *
	 * @remarks After attaching an index to an interval collection, applications should typically store this
	 * index somewhere in their in-memory data model for future reference and querying.
	 */
	attachIndex(index: SequenceIntervalIndex): void;
	/**
	 * Detaches an index from this collection.
	 * All intervals which are part of this collection will be removed from the index, and updates to this collection
	 * due to local or remote changes will no longer incur updates to the index.
	 *
	 * @returns `false` if the target index cannot be found in the indexes, otherwise remove all intervals in the index and return `true`.
	 */
	detachIndex(index: SequenceIntervalIndex): boolean;
	/**
	 * @returns the interval in this collection that has the provided `id`.
	 * If no interval in the collection has this `id`, returns `undefined`.
	 */
	getIntervalById(id: string): SequenceInterval | undefined;
	/**
	 * Creates a new interval and add it to the collection.
	 * @param start - interval start position (inclusive)
	 * @param end - interval end position (exclusive)
	 * @param props - properties of the interval
	 * @returns - the created interval
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
	 *	See {@link @fluidframework/merge-tree#SequencePlace} for more details on the model.
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
	add({
		start,
		end,
		props,
	}: {
		start: SequencePlace;
		end: SequencePlace;
		props?: PropertySet;
	}): SequenceInterval;
	/**
	 * Removes an interval from the collection.
	 * @param id - Id of the interval to remove
	 * @returns the removed interval
	 */
	removeIntervalById(id: string): SequenceInterval | undefined;
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
	): SequenceInterval | undefined;

	/**
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	attachDeserializer(onDeserialize: DeserializeCallback): void;
	/**
	 * @returns an iterator over all intervals in this collection.
	 */
	[Symbol.iterator](): Iterator<SequenceInterval>;

	/**
	 * @returns a forward iterator over all intervals in this collection with start point equal to `startPosition`.
	 */
	CreateForwardIteratorWithStartPosition(startPosition: number): Iterator<SequenceInterval>;

	/**
	 * @returns a backward iterator over all intervals in this collection with start point equal to `startPosition`.
	 */
	CreateBackwardIteratorWithStartPosition(startPosition: number): Iterator<SequenceInterval>;

	/**
	 * @returns a forward iterator over all intervals in this collection with end point equal to `endPosition`.
	 */
	CreateForwardIteratorWithEndPosition(endPosition: number): Iterator<SequenceInterval>;

	/**
	 * @returns a backward iterator over all intervals in this collection with end point equal to `endPosition`.
	 */
	CreateBackwardIteratorWithEndPosition(endPosition: number): Iterator<SequenceInterval>;

	/**
	 * Gathers iteration results that optionally match a start/end criteria into the provided array.
	 * @param results - Array to gather the results into. In lieu of a return value, this array will be populated with
	 * intervals matching the query upon edit.
	 * @param iteratesForward - whether or not iteration should be in the forward direction
	 * @param start - If provided, only match intervals whose start point is equal to `start`.
	 * @param end - If provided, only match intervals whose end point is equal to `end`.
	 */
	gatherIterationResults(
		results: SequenceInterval[],
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
	findOverlappingIntervals(startPosition: number, endPosition: number): SequenceInterval[];

	/**
	 * Applies a function to each interval in this collection.
	 */
	map(fn: (interval: SequenceInterval) => void): void;

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
	previousInterval(pos: number): SequenceInterval | undefined;

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
	nextInterval(pos: number): SequenceInterval | undefined;
}

type PendingChanges = Partial<
	Record<
		string,
		{
			/**
			 * The local metadatas are stores in order of submission, FIFO.
			 * This matches how ops are ordered, and should maintained
			 * across, submit, process, resubmit, and rollback.
			 */
			local: DoublyLinkedList<IntervalMessageLocalMetadata>;
			/**
			 * The endpointChanges are unordered, and are used to determine
			 * if any local changes also change the endpoints. The nodes of the
			 * list are also stored in the individual change op metadatas, and
			 * are removed as those metadatas are handled.
			 */
			endpointChanges?: DoublyLinkedList<
				IntervalAddLocalMetadata | IntervalChangeLocalMetadata
			>;
			consensus: SequenceIntervalClass | undefined;
		}
	>
>;

function removeMetadataFromPendingChanges(
	localOpMetadataNode: ListNode<IntervalMessageLocalMetadata> | unknown,
): IntervalMessageLocalMetadata {
	const acked = (localOpMetadataNode as ListNode<IntervalMessageLocalMetadata>)?.remove()
		?.data;
	assert(acked !== undefined, 0xbbe /* local change must exist */);
	acked.endpointChangesNode?.remove();
	return acked;
}

function clearEmptyPendingEntry(pendingChanges: PendingChanges, id: string) {
	const pending = pendingChanges[id];
	if (pending !== undefined && pending.local.empty) {
		assert(
			pending.endpointChanges?.empty !== false,
			0xbc0 /* endpointChanges must be empty if not pending changes */,
		);
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete pendingChanges[id];
	}
	return pending;
}

function hasEndpointChanges(
	serialized: SerializedIntervalDelta,
): serialized is ISerializedInterval {
	return serialized.start !== undefined && serialized.end !== undefined;
}

/**
 * {@inheritdoc IIntervalCollection}
 */
export class IntervalCollection
	extends TypedEventEmitter<ISequenceIntervalCollectionEvents>
	implements ISequenceIntervalCollection
{
	private savedSerializedIntervals?: ISerializedIntervalCollectionV1;
	private localCollection: LocalIntervalCollection | undefined;
	private onDeserialize: DeserializeCallback | undefined;
	private client: Client | undefined;

	private readonly pending: PendingChanges = {};

	public get attached(): boolean {
		return !!this.localCollection;
	}

	private readonly submitDelta: (
		op: IIntervalCollectionTypeOperationValue,
		md: IntervalMessageLocalMetadata,
		consensus?: SequenceIntervalClass,
	) => void;

	constructor(
		submitDelta: (op: IIntervalCollectionTypeOperationValue, md: unknown) => void,
		serializedIntervals: ISerializedIntervalCollectionV1 | ISerializedIntervalCollectionV2,
		private readonly options: Partial<SequenceOptions> = {},
	) {
		super();

		this.submitDelta = (op, md, consensus) => {
			const { id } = getSerializedProperties(op.value);
			const pending = (this.pending[id] ??= {
				local: new DoublyLinkedList(),
				consensus,
			});
			if (md.type === "add" || (md.type === "change" && hasEndpointChanges(op.value))) {
				const endpointChanges = (pending.endpointChanges ??= new DoublyLinkedList());
				md.endpointChangesNode = endpointChanges.push(md).last;
			}
			submitDelta(op, pending.local.push(md).last);
		};

		this.savedSerializedIntervals = Array.isArray(serializedIntervals)
			? serializedIntervals
			: serializedIntervals.intervals.map((i) =>
					decompressInterval(i, serializedIntervals.label),
				);
	}

	/**
	 * {@inheritdoc IIntervalCollection.attachIndex}
	 */
	public attachIndex(index: SequenceIntervalIndex): void {
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
	public detachIndex(index: SequenceIntervalIndex): boolean {
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

	public rollback(op: IIntervalCollectionTypeOperationValue, maybeMetadata: unknown) {
		const localOpMetadata = removeMetadataFromPendingChanges(maybeMetadata);
		const { value } = op;
		const { id, properties } = getSerializedProperties(value);
		const pending = clearEmptyPendingEntry(this.pending, id);
		const previous = pending?.local.empty
			? pending.consensus
			: pending?.local.last?.data.interval;
		const { type, interval } = localOpMetadata;
		switch (type) {
			case "add": {
				this.deleteExistingInterval({ interval, local: true, rollback: true });
				interval.dispose();
				break;
			}
			case "change": {
				const changeProperties = Object.keys(properties).length > 0;
				const deltaProps = changeProperties
					? interval.changeProperties(properties, undefined, true)
					: undefined;
				if (localOpMetadata.endpointChangesNode !== undefined) {
					this.localCollection?.removeExistingInterval(interval);
					assert(previous !== undefined, 0xbd2 /* must have existed to change */);
					this.localCollection?.add(previous);
					this.emitChange(previous, interval, true, true);
				}
				if (previous !== interval) {
					interval.dispose();
				}
				if (changeProperties) {
					this.emit("propertyChanged", previous, deltaProps, true, undefined);
				}
				break;
			}
			case "delete": {
				assert(previous !== undefined, 0xbd3 /* must have existed to delete */);
				this.localCollection?.add(previous);
				this.emit("addInterval", previous, true, undefined);
				break;
			}
			default:
				unreachableCase(type);
		}
	}

	public process(
		op: IIntervalCollectionTypeOperationValue,
		local: boolean,
		message: ISequencedDocumentMessage,
		maybeMetadata: unknown,
	) {
		const localOpMetadata = local
			? removeMetadataFromPendingChanges(maybeMetadata)
			: undefined;

		const { opName, value } = op;
		const { id } = getSerializedProperties(value);
		assert(
			(local === false && localOpMetadata === undefined) || opName === localOpMetadata?.type,
			0xbc1 /* must be same type */,
		);
		let newConsensus = localOpMetadata?.interval;
		switch (opName) {
			case "add": {
				newConsensus = this.ackAdd(
					value,
					local,
					message,
					// this cast is safe because of the above assert which
					// validates the op and metadata types match for local changes
					localOpMetadata as IntervalAddLocalMetadata | undefined,
				);
				break;
			}

			case "delete": {
				this.ackDelete(value, local, message);
				break;
			}

			case "change": {
				newConsensus = this.ackChange(
					value,
					local,
					message, // this cast is safe because of the above assert which
					// validates the op and metadata types match for local changes
					localOpMetadata as IntervalChangeLocalMetadata | undefined,
				);
				break;
			}
			default:
				unreachableCase(opName);
		}
		const pending = clearEmptyPendingEntry(this.pending, id);

		if (pending !== undefined) {
			pending.consensus = newConsensus;
		}
	}

	public resubmitMessage(
		op: IIntervalCollectionTypeOperationValue,
		maybeMetadata: unknown,
		squash: boolean,
	): void {
		const { opName, value } = op;

		const localOpMetadata = removeMetadataFromPendingChanges(maybeMetadata);

		const rebasedValue =
			localOpMetadata.endpointChangesNode === undefined
				? value
				: this.rebaseLocalInterval(value, localOpMetadata, squash);

		if (rebasedValue === undefined) {
			const { id } = getSerializedProperties(value);
			clearEmptyPendingEntry(this.pending, id);
			return;
		}

		this.submitDelta({ opName, value: rebasedValue as any }, localOpMetadata);
	}

	public applyStashedOp(op: IIntervalCollectionTypeOperationValue): void {
		const { opName, value } = op;
		const { id, properties } = getSerializedProperties(value);
		switch (opName) {
			case "add": {
				this.add({
					id,
					// Todo: we should improve typing so we know add ops always have start and end
					start: toSequencePlace(value.start, value.startSide),
					end: toSequencePlace(value.end, value.endSide),
					props: properties,
				});
				break;
			}
			case "change": {
				this.change(id, {
					start: toOptionalSequencePlace(value.start, value.startSide),
					end: toOptionalSequencePlace(value.end, value.endSide),
					props: properties,
				});
				break;
			}
			case "delete": {
				this.removeIntervalById(id);
				break;
			}
			default:
				throw new Error("unknown ops should not be stashed");
		}
	}

	private rebaseReferenceWithSegmentSlide(
		ref: LocalReferencePosition,
		localSeq: number,
		squash: boolean,
	): { segment: ISegment; offset: number } | undefined {
		if (!this.client) {
			throw new LoggingError("mergeTree client must exist");
		}

		const { clientId } = this.client.getCollabWindow();
		const segment: ISegmentInternal | undefined = ref.getSegment();
		if (segment?.endpointType) {
			return { segment, offset: 0 };
		}
		const offset = ref.getOffset();

		const segoff = getSlideToSegoff(
			segment === undefined ? undefined : { segment, offset },
			ref.slidingPreference,
			createLocalReconnectingPerspective(
				this.client.getCurrentSeq(),
				clientId,
				localSeq,
				squash,
			),
			ref.canSlideToEndpoint,
		);

		// case happens when rebasing op, but concurrently entire string has been deleted
		if (segoff === undefined) {
			if (ref.canSlideToEndpoint !== true) {
				return undefined;
			}
			return {
				segment:
					ref.slidingPreference === SlidingPreference.FORWARD
						? this.client.endOfTree
						: this.client.startOfTree,
				offset: 0,
			};
		}
		return segoff;
	}

	private computeRebasedPositions(
		localOpMetadata: IntervalAddLocalMetadata | IntervalChangeLocalMetadata,
		squash: boolean,
	): Record<"start" | "end", { segment: ISegmentInternal; offset: number }> | "detached" {
		assert(
			this.client !== undefined,
			0x550 /* Client should be defined when computing rebased position */,
		);

		const { localSeq, interval } = localOpMetadata;
		const start = this.rebaseReferenceWithSegmentSlide(interval.start, localSeq, squash);
		if (start === undefined) {
			return "detached";
		}
		const end = this.rebaseReferenceWithSegmentSlide(interval.end, localSeq, squash);
		if (end === undefined) {
			return "detached";
		}
		return { start, end };
	}

	public attachGraph(client: Client, label: string) {
		if (this.attached) {
			throw new LoggingError("Only supports one Sequence attach");
		}

		if (client === undefined) {
			throw new LoggingError("Client required for this collection");
		}

		// Instantiate the local interval collection based on the saved intervals
		this.client = client;
		if (client) {
			client.on("normalize", (squash) => {
				for (const pending of Object.values(this.pending)) {
					if (pending?.endpointChanges !== undefined) {
						for (const local of pending.endpointChanges) {
							this.rebaseLocalInterval(local.data.interval.serialize(), local.data, squash);
						}
					}
				}
			});
		}

		this.localCollection = new LocalIntervalCollection(
			client,
			label,
			this.options,
			(interval, previousInterval) => this.emitChange(interval, previousInterval, true, true),
		);
		if (this.savedSerializedIntervals) {
			for (const serializedInterval of this.savedSerializedIntervals) {
				const { id, properties } = getSerializedProperties(serializedInterval);
				const {
					start: startPos,
					end: endPos,
					intervalType,
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
				const interval = createSequenceInterval(
					label,
					id,
					start,
					end,
					client,
					intervalType,
					undefined,
					true,
					this.options.mergeTreeReferencesCanSlideToEndpoint,
					properties,
				);
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
		interval: SequenceIntervalClass,
		previousInterval: SequenceIntervalClass,
		local: boolean,
		slide: boolean,
		op?: ISequencedDocumentMessage,
	): void {
		// Temporarily make references transient so that positional queries work (non-transient refs
		// on resolve to DetachedPosition on any segments that don't contain them). The original refType
		// is restored as single-endpoint changes re-use previous references.

		const startRefType = previousInterval.start.refType;
		const endRefType = previousInterval.end.refType;
		previousInterval.start.refType = ReferenceType.Transient;
		previousInterval.end.refType = ReferenceType.Transient;
		this.emit("changeInterval", interval, previousInterval, local, op, slide);
		this.emit("changed", interval, undefined, previousInterval ?? undefined, local, slide);
		previousInterval.start.refType = startRefType;
		previousInterval.end.refType = endRefType;
	}

	/**
	 * {@inheritdoc IIntervalCollection.getIntervalById}
	 */
	public getIntervalById(id: string): SequenceIntervalClass | undefined {
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
	 */
	public add({
		id,
		start,
		end,
		props,
	}: {
		id?: string;
		start: SequencePlace;
		end: SequencePlace;
		props?: PropertySet;
	}): SequenceIntervalClass {
		if (!this.localCollection) {
			throw new LoggingError("attach must be called prior to adding intervals");
		}

		const { startSide, endSide, startPos, endPos } = endpointPosAndSide(start, end);

		assert(
			startPos !== undefined &&
				endPos !== undefined &&
				startSide !== undefined &&
				endSide !== undefined,
			0x793 /* start and end cannot be undefined because they were not passed in as undefined */,
		);

		this.assertStickinessEnabled(start, end);

		const intervalId = id ?? uuid();

		const interval: SequenceIntervalClass = this.localCollection.addInterval(
			intervalId,
			toSequencePlace(startPos, startSide),
			toSequencePlace(endPos, endSide),
			props,
			undefined,
		);

		if (interval) {
			if (!this.isCollaborating) {
				setSlideOnRemove(interval.start);
				setSlideOnRemove(interval.end);
			}
			const serializedInterval: ISerializedInterval = interval.serialize();
			const localSeq = this.getNextLocalSeq();
			if (this.isCollaborating) {
				this.submitDelta(
					{
						opName: "add",
						value: serializedInterval,
					},
					{
						type: "add",
						localSeq,
						interval,
					},
				);
			}
		}

		this.emit("addInterval", interval, true, undefined);

		return interval;
	}

	private deleteExistingInterval({
		interval,
		local,
		op,
		rollback,
	}: {
		interval: SequenceIntervalClass;
		local: boolean;
		op?: ISequencedDocumentMessage;
		rollback?: boolean;
	}) {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}
		// The given interval is known to exist in the collection.
		this.localCollection.removeExistingInterval(interval);

		if (interval) {
			// Local ops get submitted to the server. Remote ops have the deserializer run.
			if (local && rollback !== true) {
				const value = interval.serialize();
				this.submitDelta(
					{
						opName: "delete",
						value,
					},
					{
						type: "delete",
						localSeq: this.getNextLocalSeq(),
					},
					interval,
				);
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
	public removeIntervalById(id: string): SequenceIntervalClass | undefined {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}
		const interval = this.getIntervalById(id);
		if (interval) {
			this.deleteExistingInterval({ interval, local: true });
		}
		return interval;
	}
	/**
	 * {@inheritdoc IIntervalCollection.change}
	 */
	public change(
		id: string,
		{
			start,
			end,
			props,
			rollback,
		}: { start?: SequencePlace; end?: SequencePlace; props?: PropertySet; rollback?: boolean },
	): SequenceIntervalClass | undefined {
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
			let newInterval: SequenceIntervalClass | undefined;
			if (props !== undefined) {
				deltaProps = interval.changeProperties(props, undefined, rollback);
			}
			const changeEndpoints = start !== undefined && end !== undefined;
			if (changeEndpoints) {
				newInterval = this.localCollection.changeInterval(interval, start, end);
				if (!this.isCollaborating && newInterval !== undefined) {
					setSlideOnRemove(newInterval.start);
					setSlideOnRemove(newInterval.end);
				}
			}

			if (this.isCollaborating && rollback !== true) {
				// Emit a property bag containing the ID and the other (if any) properties changed
				const serializedInterval: SerializedIntervalDelta = (
					newInterval ?? interval
				).serializeDelta({ props, includeEndpoints: changeEndpoints });
				const localSeq = this.getNextLocalSeq();

				const metadata: IntervalChangeLocalMetadata = {
					type: "change",
					localSeq,
					interval: newInterval ?? interval,
				};

				this.submitDelta(
					{
						opName: "change",
						value: serializedInterval,
					},
					metadata,
					interval,
				);
			}
			if (deltaProps !== undefined) {
				this.emit("propertyChanged", interval, deltaProps, true, undefined);
				this.emit(
					"changed",
					newInterval ?? interval,
					deltaProps,
					newInterval ? interval : undefined,
					true,
					false,
				);
			}
			if (newInterval) {
				this.emitChange(newInterval, interval, true, false);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				interval.start.properties!.interval = undefined;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				interval.end.properties!.interval = undefined;
			}
			return newInterval;
		}
		// No interval to change
		return undefined;
	}

	private get isCollaborating(): boolean {
		return this.client?.getCollabWindow().collaborating ?? false;
	}

	private hasPendingEndpointChanges(id: string) {
		return this.pending[id]?.endpointChanges?.empty === false;
	}

	public ackChange(
		serializedInterval: SerializedIntervalDelta,
		local: boolean,
		op: ISequencedDocumentMessage,
		localOpMetadata: IntervalChangeLocalMetadata | undefined,
	) {
		if (!this.localCollection) {
			throw new LoggingError("Attach must be called before accessing intervals");
		}

		// Note that the ID is in the property bag only to allow us to find the interval.
		// This API cannot change the ID, and writing to the ID property will result in an exception. So we
		// strip it out of the properties here.
		const { id, properties } = getSerializedProperties(serializedInterval);
		assert(id !== undefined, 0x3fe /* id must exist on the interval */);

		if (local) {
			assert(localOpMetadata !== undefined, 0xbd4 /* local must have metadata */);
			const { interval } = localOpMetadata;
			interval.ackPropertiesChange(properties, op);

			this.ackInterval(interval, op);
			return interval;
		} else {
			const latestInterval = this.getIntervalById(id);
			const intervalToChange: SequenceIntervalClass | undefined =
				this.pending[id]?.consensus ?? latestInterval;

			const isLatestInterval = intervalToChange === latestInterval;

			if (!intervalToChange) {
				return intervalToChange;
			}

			const deltaProps = intervalToChange.changeProperties(properties, op);

			let newInterval = intervalToChange;
			if (hasEndpointChanges(serializedInterval)) {
				const { start, end, startSide, endSide } = serializedInterval;
				newInterval = intervalToChange.modify(
					"",
					toOptionalSequencePlace(start, startSide ?? Side.Before),
					toOptionalSequencePlace(end, endSide ?? Side.Before),
					op,
				);
				if (isLatestInterval) {
					this.localCollection.removeExistingInterval(intervalToChange);
					this.localCollection.add(newInterval);
					this.emitChange(newInterval, intervalToChange, local, false, op);
					if (this.onDeserialize) {
						this.onDeserialize(newInterval);
					}
				}
			}

			if (deltaProps !== undefined && Object.keys(deltaProps).length > 0) {
				this.emit("propertyChanged", latestInterval, deltaProps, local, op);
				this.emit("changed", latestInterval, deltaProps, undefined, local, false);
			}
			return newInterval;
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
	 */
	public rebaseLocalInterval(
		original: SerializedIntervalDelta,
		localOpMetadata: IntervalAddLocalMetadata | IntervalChangeLocalMetadata,
		squash: boolean,
	): SerializedIntervalDelta | undefined {
		if (!this.client || !hasEndpointChanges(original)) {
			// If there's no associated mergeTree client, the originally submitted op is still correct.
			return original;
		}
		if (!this.attached || this.localCollection === undefined) {
			throw new LoggingError("attachSequence must be called");
		}

		const { localSeq, interval } = localOpMetadata;
		const { id } = getSerializedProperties(original);

		const rebasedEndpoint = this.computeRebasedPositions(localOpMetadata, squash);
		const localInterval = this.getIntervalById(id);

		// if the interval slid off the string, rebase the op to be a noop and delete the interval.
		if (rebasedEndpoint === "detached") {
			if (
				localInterval !== undefined &&
				(localInterval === interval || localOpMetadata.type === "add")
			) {
				this.localCollection?.removeExistingInterval(localInterval);
			}
			return undefined;
		}

		const { start, end } = rebasedEndpoint;
		if (
			interval.start.getSegment() !== start.segment ||
			interval.start.getOffset() !== start.offset ||
			interval.end.getSegment() !== end.segment ||
			interval.end.getOffset() !== end.offset
		) {
			if (localInterval === interval) {
				this.localCollection.removeExistingInterval(localInterval);
			}
			const old = interval.clone();
			interval.moveEndpointReferences(rebasedEndpoint);
			if (localInterval === interval) {
				this.localCollection.add(interval);
				this.emitChange(interval, old, true, true);
			}
			old.dispose();
		}

		return {
			...original,
			start:
				start.segment.endpointType ??
				this.client.findReconnectionPosition(start.segment, localSeq) + start.offset,
			end:
				end.segment.endpointType ??
				this.client.findReconnectionPosition(end.segment, localSeq) + end.offset,
			sequenceNumber: this.client?.getCurrentSeq() ?? 0,
		};
	}

	private getSlideToSegment(
		lref: LocalReferencePosition,
	): { segment: ISegment; offset: number } | undefined {
		if (!this.client) {
			throw new LoggingError("client does not exist");
		}
		const segment: ISegmentInternal | undefined = lref.getSegment();
		if (segment === undefined) {
			return undefined;
		}
		const segoff = {
			segment,
			offset: lref.getOffset(),
		};
		if (segoff.segment.localRefs?.has(lref) !== true) {
			return undefined;
		}
		return getSlideToSegoff(
			segoff,
			lref.slidingPreference,
			undefined,
			lref.canSlideToEndpoint,
		);
	}

	private ackInterval(interval: SequenceIntervalClass, op: ISequencedDocumentMessage): void {
		if (
			!refTypeIncludesFlag(interval.start, ReferenceType.StayOnRemove) &&
			!refTypeIncludesFlag(interval.end, ReferenceType.StayOnRemove)
		) {
			return;
		}

		const newStart = this.getSlideToSegment(interval.start);
		const newEnd = this.getSlideToSegment(interval.end);

		const id = interval.getIntervalId();
		const hasPendingChange = this.hasPendingEndpointChanges(id);

		if (!hasPendingChange) {
			setSlideOnRemove(interval.start);
			setSlideOnRemove(interval.end);
		}

		const needsStartUpdate =
			newStart?.segment !== interval.start.getSegment() && !hasPendingChange;
		const needsEndUpdate = newEnd?.segment !== interval.end.getSegment() && !hasPendingChange;

		if (needsStartUpdate || needsEndUpdate) {
			if (!this.localCollection) {
				throw new LoggingError("Attach must be called before accessing intervals");
			}

			// `interval`'s endpoints will get modified in-place, so clone it prior to doing so for event emission.
			const oldInterval = interval.clone();

			const isLatestInterval = this.getIntervalById(id) === interval;

			if (isLatestInterval) {
				// In this case, where we change the start or end of an interval,
				// it is necessary to remove and re-add the interval listeners.
				// This ensures that the correct listeners are added to the LocalReferencePosition.
				this.localCollection.removeExistingInterval(interval);
			}
			if (!this.client) {
				throw new LoggingError("client does not exist");
			}

			if (needsStartUpdate) {
				const props = interval.start.properties;
				interval.start = createPositionReferenceFromSegoff({
					client: this.client,
					segoff: newStart,
					refType: interval.start.refType,
					op,
					slidingPreference: interval.start.slidingPreference,
					canSlideToEndpoint: interval.start.canSlideToEndpoint,
				});
				if (props) {
					interval.start.addProperties(props);
				}
				const oldSeg: ISegmentInternal | undefined = oldInterval.start.getSegment();
				// remove and rebuild start interval as transient for event
				this.client.removeLocalReferencePosition(oldInterval.start);
				oldInterval.start.refType = ReferenceType.Transient;
				oldSeg?.localRefs?.addLocalRef(oldInterval.start, oldInterval.start.getOffset());
			}
			if (needsEndUpdate) {
				const props = interval.end.properties;
				interval.end = createPositionReferenceFromSegoff({
					client: this.client,
					segoff: newEnd,
					refType: interval.end.refType,
					op,
					slidingPreference: interval.end.slidingPreference,
					canSlideToEndpoint: interval.end.canSlideToEndpoint,
				});
				if (props) {
					interval.end.addProperties(props);
				}
				// remove and rebuild end interval as transient for event
				const oldSeg: ISegmentInternal | undefined = oldInterval.end.getSegment();
				this.client.removeLocalReferencePosition(oldInterval.end);
				oldInterval.end.refType = ReferenceType.Transient;
				oldSeg?.localRefs?.addLocalRef(oldInterval.end, oldInterval.end.getOffset());
			}
			if (isLatestInterval) {
				this.localCollection.add(interval);
				this.emitChange(interval, oldInterval, true, true, op);
			}
		}
	}

	public ackAdd(
		serializedInterval: ISerializedInterval,
		local: boolean,
		op: ISequencedDocumentMessage,
		localOpMetadata: IntervalAddLocalMetadata | undefined,
	): SequenceIntervalClass {
		const { id, properties } = getSerializedProperties(serializedInterval);

		if (local) {
			assert(
				localOpMetadata !== undefined,
				0x553 /* op metadata should be defined for local op */,
			);
			this.ackInterval(localOpMetadata.interval, op);
			return localOpMetadata.interval;
		}

		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		const interval: SequenceIntervalClass = this.localCollection.addInterval(
			id,
			toSequencePlace(serializedInterval.start, serializedInterval.startSide ?? Side.Before),
			toSequencePlace(serializedInterval.end, serializedInterval.endSide ?? Side.Before),
			properties,
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

	public ackDelete(
		serializedInterval: SerializedIntervalDelta,
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

		const { id } = getSerializedProperties(serializedInterval);
		const interval = this.getIntervalById(id);
		if (interval) {
			this.deleteExistingInterval({ interval, local, op });
		}
	}

	public serializeInternal(
		version: "1" | "2",
	): ISerializedIntervalCollectionV1 | ISerializedIntervalCollectionV2 {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.serialize(version);
	}

	/**
	 * @returns an iterator over all intervals in this collection.
	 */
	public [Symbol.iterator](): IntervalCollectionIterator {
		const iterator = new IntervalCollectionIterator(this);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateForwardIteratorWithStartPosition}
	 */
	public CreateForwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator {
		const iterator = new IntervalCollectionIterator(this, true, startPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateBackwardIteratorWithStartPosition}
	 */
	public CreateBackwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator {
		const iterator = new IntervalCollectionIterator(this, false, startPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateForwardIteratorWithEndPosition}
	 */
	public CreateForwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator {
		const iterator = new IntervalCollectionIterator(this, true, undefined, endPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.CreateBackwardIteratorWithEndPosition}
	 */
	public CreateBackwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator {
		const iterator = new IntervalCollectionIterator(this, false, undefined, endPosition);
		return iterator;
	}

	/**
	 * {@inheritdoc IIntervalCollection.gatherIterationResults}
	 */
	public gatherIterationResults(
		results: SequenceIntervalClass[],
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
	public findOverlappingIntervals(
		startPosition: number,
		endPosition: number,
	): SequenceInterval[] {
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
	public map(fn: (interval: SequenceIntervalClass) => void) {
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
	public previousInterval(pos: number): SequenceInterval | undefined {
		if (!this.localCollection) {
			throw new LoggingError("attachSequence must be called");
		}

		return this.localCollection.endIntervalIndex.previousInterval(pos);
	}

	/**
	 * {@inheritdoc IIntervalCollection.nextInterval}
	 */
	public nextInterval(pos: number): SequenceInterval | undefined {
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
	interval: SequenceIntervalClass;
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
