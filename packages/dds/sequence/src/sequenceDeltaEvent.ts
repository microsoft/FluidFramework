/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy } from "@fluidframework/core-utils/internal";
import {
	// eslint-disable-next-line import/no-deprecated
	Client,
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
	ISegment,
	MergeTreeDeltaOperationType,
	MergeTreeDeltaOperationTypes,
	MergeTreeDeltaType,
	MergeTreeMaintenanceType,
	PropertySet, // eslint-disable-next-line import/no-deprecated
	SortedSegmentSet,
} from "@fluidframework/merge-tree/internal";

/**
 * Base class for SequenceDeltaEvent and SequenceMaintenanceEvent.
 *
 * The properties of this object and its sub-objects represent the state of the sequence at the
 * point in time at which the operation was applied.
 * They will not take into any future modifications performed to the underlying sequence and merge tree.
 * @legacy
 * @alpha
 */
export interface SequenceEvent<
	TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes,
> {
	readonly deltaOperation: TOperation;

	readonly deltaArgs: IMergeTreeDeltaCallbackArgs<TOperation>;
	/**
	 * The in-order ranges affected by this delta.
	 * These are not necessarily contiguous.
	 *
	 * @remarks - If processing code doesn't care about the order of the ranges, it may instead consider using the
	 * {@link @fluidframework/merge-tree#IMergeTreeDeltaCallbackArgs.deltaSegments|deltaSegments} field on {@link SequenceEvent.deltaArgs|deltaArgs}.
	 */
	readonly ranges: readonly Readonly<ISequenceDeltaRange<TOperation>>[];

	/**
	 * The client id of the client that made the change which caused the delta event
	 */
	readonly clientId: string | undefined;

	/**
	 * The first of the modified ranges.
	 */
	readonly first: Readonly<ISequenceDeltaRange<TOperation>>;

	/**
	 * The last of the modified ranges.
	 */
	readonly last: Readonly<ISequenceDeltaRange<TOperation>>;
}
export abstract class SequenceEventClass<
	TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes,
> implements SequenceEvent<TOperation>
{
	public readonly isLocal: boolean;
	public readonly deltaOperation: TOperation;
	// eslint-disable-next-line import/no-deprecated
	private readonly sortedRanges: Lazy<SortedSegmentSet<ISequenceDeltaRange<TOperation>>>;
	private readonly pFirst: Lazy<ISequenceDeltaRange<TOperation>>;
	private readonly pLast: Lazy<ISequenceDeltaRange<TOperation>>;

	constructor(
		public readonly opArgs: IMergeTreeDeltaOpArgs | undefined,
		/**
		 * Arguments reflecting the type of change that caused this event.
		 */
		public readonly deltaArgs: IMergeTreeDeltaCallbackArgs<TOperation>,
		// eslint-disable-next-line import/no-deprecated
		private readonly mergeTreeClient: Client,
	) {
		if (
			deltaArgs.operation !== MergeTreeDeltaType.OBLITERATE &&
			deltaArgs.operation !== MergeTreeMaintenanceType.ACKNOWLEDGED
		) {
			assert(
				deltaArgs.deltaSegments.length > 0,
				0x2d8 /* "Empty change event should not be emitted." */,
			);
		}
		this.deltaOperation = deltaArgs.operation;
		this.isLocal = opArgs?.sequencedMessage === undefined;

		// eslint-disable-next-line import/no-deprecated
		this.sortedRanges = new Lazy<SortedSegmentSet<ISequenceDeltaRange<TOperation>>>(() => {
			// eslint-disable-next-line import/no-deprecated
			const set = new SortedSegmentSet<ISequenceDeltaRange<TOperation>>();
			this.deltaArgs.deltaSegments.forEach((delta) => {
				const newRange: ISequenceDeltaRange<TOperation> = {
					operation: this.deltaArgs.operation,
					position: this.mergeTreeClient.getPosition(delta.segment),
					propertyDeltas: delta.propertyDeltas ?? {},
					segment: delta.segment,
				};
				set.addOrUpdate(newRange);
			});
			return set;
		});

		/*
		 * Non-null assertions are safe here because:
		 * - assert() ensures deltaSegments.length > 0 (except for OBLITERATE/ACKNOWLEDGED)
		 * - sortedRanges is populated by iterating deltaSegments
		 * - therefore items[0] and items[size-1] must exist in the non-empty set
		 */
		this.pFirst = new Lazy<ISequenceDeltaRange<TOperation>>(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			() => this.sortedRanges.value.items[0]!,
		);

		this.pLast = new Lazy<ISequenceDeltaRange<TOperation>>(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			() => this.sortedRanges.value.items[this.sortedRanges.value.size - 1]!,
		);
	}

	/**
	 * The in-order ranges affected by this delta.
	 * These are not necessarily contiguous.
	 *
	 * @remarks - If processing code doesn't care about the order of the ranges, it may instead consider using the
	 * {@link @fluidframework/merge-tree#IMergeTreeDeltaCallbackArgs.deltaSegments|deltaSegments} field on {@link SequenceEvent.deltaArgs|deltaArgs}.
	 */
	public get ranges(): readonly Readonly<ISequenceDeltaRange<TOperation>>[] {
		return this.sortedRanges.value.items;
	}

	/**
	 * The client id of the client that made the change which caused the delta event
	 */
	public get clientId(): string | undefined {
		return this.mergeTreeClient.longClientId;
	}

	/**
	 * The first of the modified ranges.
	 */
	public get first(): Readonly<ISequenceDeltaRange<TOperation>> {
		return this.pFirst.value;
	}

	/**
	 * The last of the modified ranges.
	 */
	public get last(): Readonly<ISequenceDeltaRange<TOperation>> {
		return this.pLast.value;
	}
}

/**
 * The event object returned on sequenceDelta events.
 *
 * The properties of this object and its sub-objects represent the state of the sequence at the
 * point in time at which the operation was applied.
 * They will not take into consideration any future modifications performed to the underlying sequence and merge tree.
 *
 * For group ops, each op will get its own event, and the group op property will be set on the op args.
 *
 * Ops may get multiple events. For instance, an insert-replace will get a remove then an insert event.
 * @legacy
 * @alpha
 */
export interface SequenceDeltaEvent extends SequenceEvent<MergeTreeDeltaOperationType> {
	readonly opArgs: IMergeTreeDeltaOpArgs;

	/**
	 * Whether the event was caused by a locally-made change.
	 */
	readonly isLocal: boolean;
}
export class SequenceDeltaEventClass
	extends SequenceEventClass<MergeTreeDeltaOperationType>
	implements SequenceDeltaEvent
{
	constructor(
		public readonly opArgs: IMergeTreeDeltaOpArgs,
		deltaArgs: IMergeTreeDeltaCallbackArgs,
		// eslint-disable-next-line import/no-deprecated
		mergeTreeClient: Client,
	) {
		super(opArgs, deltaArgs, mergeTreeClient);
	}
}

/**
 * The event object returned on maintenance events.
 *
 * The properties of this object and its sub-objects represent the state of the sequence at the
 * point in time at which the operation was applied.
 * They will not take into consideration any future modifications performed to the underlying sequence and merge tree.
 * @legacy
 * @alpha
 */
export interface SequenceMaintenanceEvent extends SequenceEvent<MergeTreeMaintenanceType> {
	readonly opArgs: IMergeTreeDeltaOpArgs | undefined;
}
export class SequenceMaintenanceEventClass
	extends SequenceEventClass<MergeTreeMaintenanceType>
	implements SequenceMaintenanceEvent
{
	constructor(
		/**
		 * Defined iff `deltaArgs.operation` is {@link @fluidframework/merge-tree#MergeTreeMaintenanceType.ACKNOWLEDGED|MergeTreeMaintenanceType.ACKNOWLEDGED}.
		 *
		 * In that case, this argument provides information about the change which was acknowledged.
		 */
		public readonly opArgs: IMergeTreeDeltaOpArgs | undefined,
		deltaArgs: IMergeTreeMaintenanceCallbackArgs,
		// eslint-disable-next-line import/no-deprecated
		mergeTreeClient: Client,
	) {
		super(opArgs, deltaArgs, mergeTreeClient);
	}
}

/**
 * A range that has changed corresponding to a segment modification.
 * @legacy
 * @alpha
 */
export interface ISequenceDeltaRange<
	TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes,
> {
	/**
	 * The type of operation that changed this range.
	 *
	 * @remarks Consuming code should typically compare this to the enum values defined in
	 * `MergeTreeDeltaOperationTypes`.
	 */
	operation: TOperation;

	/**
	 * The index of the start of the range.
	 */
	position: number;

	/**
	 * The segment that corresponds to the range.
	 */
	segment: ISegment;

	/**
	 * Deltas object which contains all modified properties with their previous values.
	 * Since `undefined` doesn't survive a round-trip through JSON serialization, the old value being absent
	 * is instead encoded with `null`.
	 *
	 * @remarks This object is motivated by undo/redo scenarios, and provides a convenient "inverse op" to apply to
	 * undo a property change.
	 *
	 * @example
	 *
	 * If a segment initially had properties `{ foo: "1", bar: 2 }` and it was annotated with
	 * `{ foo: 3, baz: 5 }`, the corresponding event would have a `propertyDeltas` of `{ foo: "1", baz: null }`.
	 */
	propertyDeltas: PropertySet;
}
