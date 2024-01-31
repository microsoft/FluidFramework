/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	// eslint-disable-next-line import/no-deprecated
	Client,
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
	ISegment,
	MergeTreeDeltaOperationType,
	MergeTreeDeltaOperationTypes,
	MergeTreeMaintenanceType,
	PropertySet,
	// eslint-disable-next-line import/no-deprecated
	SortedSegmentSet,
} from "@fluidframework/merge-tree";

/**
 * Base class for SequenceDeltaEvent and SequenceMaintenanceEvent.
 *
 * The properties of this object and its sub-objects represent the state of the sequence at the
 * point in time at which the operation was applied.
 * They will not take into any future modifications performed to the underlying sequence and merge tree.
 * @alpha
 */
export abstract class SequenceEvent<
	TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes,
> {
	public readonly deltaOperation: TOperation;
	// eslint-disable-next-line import/no-deprecated
	private readonly sortedRanges: Lazy<SortedSegmentSet<ISequenceDeltaRange<TOperation>>>;
	private readonly pFirst: Lazy<ISequenceDeltaRange<TOperation>>;
	private readonly pLast: Lazy<ISequenceDeltaRange<TOperation>>;

	constructor(
		public readonly deltaArgs: IMergeTreeDeltaCallbackArgs<TOperation>,
		// eslint-disable-next-line import/no-deprecated
		private readonly mergeTreeClient: Client,
	) {
		assert(
			deltaArgs.deltaSegments.length > 0,
			0x2d8 /* "Empty change event should not be emitted." */,
		);
		this.deltaOperation = deltaArgs.operation;

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

		this.pFirst = new Lazy<ISequenceDeltaRange<TOperation>>(
			() => this.sortedRanges.value.items[0],
		);

		this.pLast = new Lazy<ISequenceDeltaRange<TOperation>>(
			() => this.sortedRanges.value.items[this.sortedRanges.value.size - 1],
		);
	}

	/**
	 * The in-order ranges affected by this delta.
	 * These may not be continuous.
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
 * @alpha
 */
export class SequenceDeltaEvent extends SequenceEvent<MergeTreeDeltaOperationType> {
	/**
	 * Whether the event was caused by a locally-made change.
	 */
	public readonly isLocal: boolean;

	constructor(
		public readonly opArgs: IMergeTreeDeltaOpArgs,
		deltaArgs: IMergeTreeDeltaCallbackArgs,
		// eslint-disable-next-line import/no-deprecated
		mergeTreeClient: Client,
	) {
		super(deltaArgs, mergeTreeClient);
		this.isLocal = opArgs.sequencedMessage === undefined;
	}
}

/**
 * The event object returned on maintenance events.
 *
 * The properties of this object and its sub-objects represent the state of the sequence at the
 * point in time at which the operation was applied.
 * They will not take into consideration any future modifications performed to the underlying sequence and merge tree.
 * @alpha
 */
export class SequenceMaintenanceEvent extends SequenceEvent<MergeTreeMaintenanceType> {
	constructor(
		public readonly opArgs: IMergeTreeDeltaOpArgs | undefined,
		deltaArgs: IMergeTreeMaintenanceCallbackArgs,
		// eslint-disable-next-line import/no-deprecated
		mergeTreeClient: Client,
	) {
		super(deltaArgs, mergeTreeClient);
	}
}

/**
 * A range that has changed corresponding to a segment modification.
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

class Lazy<T> {
	private pValue: T | undefined;
	private pEvaluated: boolean;
	constructor(private readonly valueGenerator: () => T) {
		this.pEvaluated = false;
	}

	public get evaluated(): boolean {
		return this.pEvaluated;
	}

	public get value(): T {
		if (!this.pEvaluated) {
			this.pEvaluated = true;
			this.pValue = this.valueGenerator();
		}
		return this.pValue as T;
	}
}
