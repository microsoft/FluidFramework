/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { IEventThisPlaceHolder } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	Client,
	IJSONSegment,
	IMergeTreeAnnotateMsg,
	IMergeTreeDeltaOp,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeGroupMsg,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeObliterateMsg,
	IMergeTreeOp,
	IMergeTreeRemoveMsg,
	IRelativePosition,
	ISegment,
	ISegmentAction,
	LocalReferencePosition,
	MergeTreeDeltaType,
	MergeTreeRevertibleDriver,
	PropertySet,
	ReferencePosition,
	ReferenceType,
	SlidingPreference,
	createAnnotateRangeOp,
	// eslint-disable-next-line import/no-deprecated
	createGroupOp,
	createInsertOp,
	createObliterateRangeOp,
	createRemoveRangeOp,
	matchProperties,
	type AdjustParams,
	type InteriorSequencePlace,
	type MapLike,
} from "@fluidframework/merge-tree/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import {
	ObjectStoragePartition,
	SummaryTreeBuilder,
} from "@fluidframework/runtime-utils/internal";
import {
	IFluidSerializer,
	ISharedObjectEvents,
	SharedObject,
	type ISharedObject,
} from "@fluidframework/shared-object-base/internal";
import {
	LoggingError,
	createChildLogger,
	createConfigBasedOptionsProxy,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import Deque from "double-ended-queue";

import {
	IIntervalCollection,
	SequenceIntervalCollectionValueType,
} from "./intervalCollection.js";
import { IMapOperation, IntervalCollectionMap } from "./intervalCollectionMap.js";
import {
	IMapMessageLocalMetadata,
	IValueChanged,
	type SequenceOptions,
} from "./intervalCollectionMapInterfaces.js";
import { SequenceInterval } from "./intervals/index.js";
import {
	SequenceDeltaEvent,
	SequenceDeltaEventClass,
	SequenceMaintenanceEvent,
	SequenceMaintenanceEventClass,
} from "./sequenceDeltaEvent.js";
import { ISharedIntervalCollection } from "./sharedIntervalCollection.js";

const snapshotFileName = "header";
const contentPath = "content";

/**
 * Events emitted in response to changes to the sequence data.
 *
 * @remarks
 *
 * The following is the list of events emitted.
 *
 * ### "sequenceDelta"
 *
 * The sequenceDelta event is emitted when segments are inserted, annotated, or removed.
 *
 * #### Listener signature
 *
 * ```typescript
 * (event: SequenceDeltaEvent, target: IEventThisPlaceHolder) => void
 * ```
 * - `event` - Various information on the segments that were modified.
 *
 * - `target` - The sequence itself.
 *
 * ### "maintenance"
 *
 * The maintenance event is emitted when segments are modified during merge-tree maintenance.
 *
 * #### Listener signature
 *
 * ```typescript
 * (event: SequenceMaintenanceEvent, target: IEventThisPlaceHolder) => void
 * ```
 * - `event` - Various information on the segments that were modified.
 *
 * - `target` - The sequence itself.
 * @legacy
 * @alpha
 */
export interface ISharedSegmentSequenceEvents extends ISharedObjectEvents {
	(
		event: "createIntervalCollection",
		listener: (label: string, local: boolean, target: IEventThisPlaceHolder) => void,
	): void;
	(
		event: "sequenceDelta",
		listener: (event: SequenceDeltaEvent, target: IEventThisPlaceHolder) => void,
	): void;
	(
		event: "maintenance",
		listener: (event: SequenceMaintenanceEvent, target: IEventThisPlaceHolder) => void,
	): void;
}

/**
 * @legacy
 * @alpha
 */
export interface ISharedSegmentSequence<T extends ISegment>
	extends ISharedObject<ISharedSegmentSequenceEvents>,
		ISharedIntervalCollection<SequenceInterval>,
		MergeTreeRevertibleDriver {
	/**
	 * Creates a `LocalReferencePosition` on this SharedString. If the refType does not include
	 * ReferenceType.Transient, the returned reference will be added to the localRefs on the provided segment.
	 * @param segment - Segment to add the local reference on
	 * @param offset - Offset on the segment at which to place the local reference
	 * @param refType - ReferenceType for the created local reference
	 * @param properties - PropertySet to place on the created local reference
	 */
	createLocalReferencePosition(
		segment: T,
		offset: number,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
		canSlideToEndpoint?: boolean,
	): LocalReferencePosition;

	/**
	 * Removes a `LocalReferencePosition` from this SharedString.
	 */
	removeLocalReferencePosition(
		lref: LocalReferencePosition,
	): LocalReferencePosition | undefined;

	/**
	 * Returns the length of the current sequence for the client
	 */
	getLength(): number;

	/**
	 * Returns the current position of a segment, and -1 if the segment
	 * does not exist in this sequence
	 * @param segment - The segment to get the position of
	 */
	getPosition(segment: ISegment): number;

	/**
	 * Resolves a `ReferencePosition` into a character position using this client's perspective.
	 *
	 * Reference positions that point to a character that has been removed will
	 * always return the position of the nearest non-removed character, regardless
	 * of `ReferenceType`. To handle this case specifically, one may wish
	 * to look at the segment returned by `ReferencePosition.getSegment`.
	 */
	localReferencePositionToPosition(lref: ReferencePosition): number;

	/**
	 * Walk the underlying segments of the sequence.
	 * The walked segments may extend beyond the range if the segments cross the
	 * ranges start or end boundaries.
	 *
	 * Set split range to true to ensure only segments within the range are walked.
	 *
	 * @param handler - The function to handle each segment. Traversal ends if
	 * this function returns true.
	 * @param start - Optional. The start of range walk.
	 * @param end - Optional. The end of range walk
	 * @param accum - Optional. An object that will be passed to the handler for accumulation
	 * @param splitRange - Optional. Splits boundary segments on the range boundaries. Defaults to false.
	 */
	walkSegments<TClientData>(
		handler: ISegmentAction<TClientData>,
		start?: number,
		end?: number,
		accum?: TClientData,
		splitRange?: boolean,
	): void;

	/**
	 * Inserts a segment directly before a `ReferencePosition`.
	 * @param refPos - The reference position to insert the segment at
	 * @param segment - The segment to insert
	 */
	insertAtReferencePosition(pos: ReferencePosition, segment: T): void;

	/**
	 * Finds the segment information (i.e. segment + offset) corresponding to a character position in the SharedString.
	 * If the position is past the end of the string, `segment` and `offset` on the returned object may be undefined.
	 * @param pos - Character position (index) into the current local view of the SharedString.
	 */
	getContainingSegment(pos: number): {
		segment: T | undefined;
		offset: number | undefined;
	};

	getPropertiesAtPosition(pos: number): PropertySet | undefined;

	/**
	 * @returns An iterable object that enumerates the IntervalCollection labels.
	 *
	 * @example
	 *
	 * ```typescript
	 * const iter = this.getIntervalCollectionKeys();
	 * for (key of iter)
	 *     const collection = this.getIntervalCollection(key);
	 *     ...
	 * ```
	 */
	getIntervalCollectionLabels(): IterableIterator<string>;

	/**
	 * Retrieves the interval collection keyed on `label`. If no such interval collection exists,
	 * creates one.
	 */
	getIntervalCollection(label: string): IIntervalCollection<SequenceInterval>;

	/**
	 * Obliterate is similar to remove, but differs in that segments concurrently
	 * inserted into an obliterated range will also be removed.
	 * Inserts are considered concurrent to an obliterate iff the insert op's seq is after the obliterate op's refSeq
	 * and the insert's refSeq is before the obliterates seq.
	 * Inserts made by the client which most recently obliterated a range containing the insert position
	 * are not considered concurrent to any obliteration (the last client to obliterate gets the right to insert).
	 *
	 * The endpoints can either be inclusive or exclusive.
	 * Exclusive endpoints allow the obliterated range to "grow" to include adjacent concurrently inserted segments on that side.
	 *
	 * @param start - The start of the range to obliterate.
	 * Inclusive if side is Before or a number is provided.
	 * @param end - The end of the range to obliterate. Inclusive if side is After.
	 * If a number is provided it is treated as exclusive,
	 * but the endpoint does not expand in order to preserve existing behavior.
	 *
	 * @example Given the initial state `"|ABC>"`,
	 * `obliterateRange({ pos: 0, side: Side.After }, { pos: 4, side: Side.Before })` obliterates `"ABC"`, leaving only `"|>"`.
	 * `insertFromSpec(1, { text: "AAA"})` would insert `"AAA"` before |, resulting in `"|AAA>"`.
	 * If another client does the same thing but inserts `"BBB"` and gets sequenced later, all clients will eventually see `|BBB>`.
	 */
	obliterateRange(
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
	): void;

	/**
	 * @returns The most recent sequence number which has been acked by the server and processed by this
	 * SharedSegmentSequence.
	 */
	getCurrentSeq(): number;

	/**
	 * Annotates the range with the provided properties
	 *
	 * @param start - The inclusive start position of the range to annotate
	 * @param end - The exclusive end position of the range to annotate
	 * @param props - The properties to annotate the range with
	 *
	 */
	annotateRange(start: number, end: number, props: PropertySet): void;

	/**
	 * Annotates a specified range within the sequence by applying the provided adjustments.
	 *
	 * @param start - The inclusive start position of the range to annotate. This is a zero-based index.
	 * @param end - The exclusive end position of the range to annotate. This is a zero-based index.
	 * @param adjust - A map-like object specifying the properties to adjust. Each key-value pair represents a property and its corresponding adjustment to be applied over the range.
	 * An adjustment is defined by an object containing a `delta` to be added to the current property value, and optional `min` and `max` constraints to limit the adjusted value.
	 *
	 * @remarks
	 * The range is defined by the start and end positions, where the start position is inclusive and the end position is exclusive.
	 * The properties provided in the adjust parameter will be applied to the specified range. Each adjustment modifies the current value of the property by adding the specified `value`.
	 * If the current value is not a number, the `delta` will be summed with 0 to compute the new value. The optional `min` and `max` constraints are applied after the adjustment to ensure the final value falls within the specified bounds.
	 */
	annotateAdjustRange(start: number, end: number, adjust: MapLike<AdjustParams>): void;

	/**
	 * @param start - The inclusive start of the range to remove
	 * @param end - The exclusive end of the range to remove
	 */
	removeRange(start: number, end: number): void;

	/**
	 * Resolves a remote client's position against the local sequence
	 * and returns the remote client's position relative to the local
	 * sequence. The client ref seq must be above the minimum sequence number
	 * or the return value will be undefined.
	 * Generally this method is used in conjunction with signals which provide
	 * point in time values for the below parameters, and is useful for things
	 * like displaying user position. It should not be used with persisted values
	 * as persisted values will quickly become invalid as the remoteClientRefSeq
	 * moves below the minimum sequence number
	 * @param remoteClientPosition - The remote client's position to resolve
	 * @param remoteClientRefSeq - The reference sequence number of the remote client
	 * @param remoteClientId - The client id of the remote client
	 */
	resolveRemoteClientPosition(
		remoteClientPosition: number,
		remoteClientRefSeq: number,
		remoteClientId: string,
	): number | undefined;

	// #region APIs we might want to remove
	/**
	 * Initializes the object as a local, non-shared object. This object can become shared after
	 * it is attached to the document.
	 * @privateRemarks
	 * TODO: determine if this API (from SharedObject) is needed by users of the encapsulated API, declarative API or both,
	 * and handle exposing it in a consistent way for all SharedObjects if needed.
	 */
	initializeLocal(): void;

	/**
	 * @deprecated The ability to create group ops will be removed in an upcoming
	 * release, as group ops are redundant with the native batching capabilities
	 * of the runtime
	 */
	// eslint-disable-next-line import/no-deprecated
	groupOperation(groupOp: IMergeTreeGroupMsg): void;

	getRangeExtentsOfPosition(pos: number): {
		posStart: number | undefined;
		posAfterEnd: number | undefined;
	};

	/**
	 * Inserts a segment
	 * @param start - The position to insert the segment at
	 * @param spec - The segment to inserts spec
	 */
	insertFromSpec(pos: number, spec: IJSONSegment): void;

	/**
	 * Given a position specified relative to a marker id, lookup the marker
	 * and convert the position to a character position.
	 * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
	 */
	posFromRelativePos(relativePos: IRelativePosition): number;

	// #endregion
}

/**
 * @internal
 */
export abstract class SharedSegmentSequence<T extends ISegment>
	extends SharedObject<ISharedSegmentSequenceEvents>
	implements ISharedSegmentSequence<T>
{
	/**
	 * This promise is always immediately resolved, and awaiting it has no effect.
	 * @deprecated SharedSegmentSequence no longer supports partial loading.
	 * References to this promise may safely be deleted without affecting behavior.
	 */
	get loaded(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * This is a safeguard to avoid problematic reentrancy of local ops. This type of scenario occurs if the user of SharedString subscribes
	 * to the `sequenceDelta` event and uses the callback for a local op to submit further local ops.
	 * Historically (before 2.0.0-internal.6.1.0), doing so would result in eventual consistency issues or a corrupted document.
	 * These issues were fixed in #16815 which makes such reentrancy no different from applying the ops in order but not from within the change events,
	 * but there is still little test coverage for reentrant scenarios.
	 * Additionally, applications submitting ops from inside change events need to take extreme care that their data models also support reentrancy.
	 * Since this is likely not the case, by default SharedString throws when encountering reentrant ops.
	 *
	 * An application using SharedString which explicitly wants to opt in to allowing reentrancy anyway can set `sharedStringPreventReentrancy`
	 * on the data store options to `false`.
	 */
	protected guardReentrancy: <TRet>(callback: () => TRet) => TRet;

	private static createOpsFromDelta(event: SequenceDeltaEvent): IMergeTreeDeltaOp[] {
		const ops: IMergeTreeDeltaOp[] = [];
		for (const r of event.ranges) {
			switch (event.deltaOperation) {
				case MergeTreeDeltaType.ANNOTATE: {
					const lastAnnotate = ops[ops.length - 1] as IMergeTreeAnnotateMsg;
					const props: PropertySet = {};
					for (const key of Object.keys(r.propertyDeltas)) {
						props[key] = r.segment.properties?.[key] ?? null;
					}
					if (
						lastAnnotate &&
						lastAnnotate.pos2 === r.position &&
						matchProperties(lastAnnotate.props, props)
					) {
						lastAnnotate.pos2 += r.segment.cachedLength;
					} else {
						ops.push(
							createAnnotateRangeOp(r.position, r.position + r.segment.cachedLength, props),
						);
					}
					break;
				}

				case MergeTreeDeltaType.INSERT:
					ops.push(createInsertOp(r.position, r.segment.clone().toJSONObject()));
					break;

				case MergeTreeDeltaType.REMOVE: {
					const lastRem = ops[ops.length - 1] as IMergeTreeRemoveMsg;
					if (lastRem?.pos1 === r.position) {
						assert(lastRem.pos2 !== undefined, 0x3ff /* pos2 should not be undefined here */);
						lastRem.pos2 += r.segment.cachedLength;
					} else {
						ops.push(createRemoveRangeOp(r.position, r.position + r.segment.cachedLength));
					}
					break;
				}

				case MergeTreeDeltaType.OBLITERATE: {
					// eslint-disable-next-line import/no-deprecated
					const lastRem = ops[ops.length - 1] as IMergeTreeObliterateMsg;
					if (lastRem?.pos1 === r.position) {
						assert(lastRem.pos2 !== undefined, 0x874 /* pos2 should not be undefined here */);
						lastRem.pos2 += r.segment.cachedLength;
					} else {
						ops.push(createObliterateRangeOp(r.position, r.position + r.segment.cachedLength));
					}
					break;
				}

				default:
			}
		}
		return ops;
	}

	/**
	 * Note: this field only provides a lower-bound on the reference sequence numbers for in-flight ops.
	 * The exact reason isn't understood, but some e2e tests suggest that the runtime may sometimes process
	 * incoming leave/join ops before putting an op that this DDS submits over the wire.
	 *
	 * E.g. SharedString submits an op while deltaManager has lastSequenceNumber = 10, but before the runtime
	 * puts this op over the wire, it processes a client join/leave op with sequence number 11, so the referenceSequenceNumber
	 * on the SharedString op is 11.
	 *
	 * The reference sequence numbers placed in this queue are also not accurate for stashed ops due to how the applyStashedOp
	 * flow works at the runtime level. This is a legitimate bug, and AB#6602 tracks one way to fix it (stop reaching all the way
	 * to deltaManager's lastSequenceNumber to obtain refSeq, instead leveraging some analogous notion on the container or datastore
	 * runtime).
	 */
	private readonly inFlightRefSeqs = new Deque<number>();

	private ongoingResubmitRefSeq: number | undefined;

	/**
	 * Gets the reference sequence number (i.e. sequence number of the runtime's last processed op) for an op submitted
	 * in the current context.
	 *
	 * This value can be optionally overridden using `useResubmitRefSeq`.
	 * IntervalCollection's resubmit logic currently relies on preserving merge information from when the op was originally submitted,
	 * even if the op is resubmitted more than once. Thus during resubmit, `inFlightRefSeqs` gets populated with the
	 * original refSeq rather than the refSeq at the time of reconnection.
	 *
	 * @remarks - In some not fully understood cases, the runtime may process incoming ops before putting an op that this
	 * DDS submits over the wire. See `inFlightRefSeqs` for more details.
	 */
	private get currentRefSeq() {
		return this.ongoingResubmitRefSeq ?? this.deltaManager.lastSequenceNumber;
	}

	protected client: Client;
	private messagesSinceMSNChange: ISequencedDocumentMessage[] = [];
	private readonly intervalCollections: IntervalCollectionMap<SequenceInterval>;
	constructor(
		dataStoreRuntime: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
		public readonly segmentFromSpec: (spec: IJSONSegment) => ISegment,
	) {
		super(id, dataStoreRuntime, attributes, "fluid_sequence_");

		const getMinInFlightRefSeq = () => this.inFlightRefSeqs.get(0);
		this.guardReentrancy =
			(dataStoreRuntime.options.sharedStringPreventReentrancy ?? true)
				? ensureNoReentrancy
				: createReentrancyDetector((depth) => {
						if (totalReentrancyLogs > 0) {
							totalReentrancyLogs--;
							this.logger.sendTelemetryEvent(
								{ eventName: "LocalOpReentry", depth },
								new LoggingError(reentrancyErrorMessage),
							);
						}
					});

		const options = createConfigBasedOptionsProxy<SequenceOptions>(
			loggerToMonitoringContext(this.logger).config,
			"Fluid.Sequence",
			{
				mergeTreeEnableObliterate: (c, n) => c.getBoolean(n),
				mergeTreeEnableSidedObliterate: (c, n) => c.getBoolean(n),
				intervalStickinessEnabled: (c, n) => c.getBoolean(n),
				mergeTreeReferencesCanSlideToEndpoint: (c, n) => c.getBoolean(n),
				mergeTreeEnableAnnotateAdjust: (c, n) => c.getBoolean(n),
			},
			dataStoreRuntime.options,
		);

		this.client = new Client(
			segmentFromSpec,
			createChildLogger({
				logger: this.logger,
				namespace: "SharedSegmentSequence.MergeTreeClient",
			}),
			options,
			getMinInFlightRefSeq,
		);

		this.client.prependListener("delta", (opArgs, deltaArgs) => {
			const event = new SequenceDeltaEventClass(opArgs, deltaArgs, this.client);
			if (event.isLocal) {
				this.submitSequenceMessage(opArgs.op);
			}
			if (deltaArgs.deltaSegments.length > 0) {
				this.emit("sequenceDelta", event, this);
			}
		});

		this.client.on("maintenance", (args, opArgs) => {
			this.emit(
				"maintenance",
				new SequenceMaintenanceEventClass(opArgs, args, this.client),
				this,
			);
		});

		this.intervalCollections = new IntervalCollectionMap(
			this.serializer,
			this.handle,
			(op, localOpMetadata) => {
				if (!this.isAttached()) {
					return;
				}

				this.inFlightRefSeqs.push(this.currentRefSeq);
				this.submitLocalMessage(op, localOpMetadata);
			},
			new SequenceIntervalCollectionValueType(),
			options,
		);
	}

	public removeRange(start: number, end: number): void {
		this.guardReentrancy(() => this.client.removeRangeLocal(start, end));
	}

	public obliterateRange(
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
	): void {
		this.guardReentrancy(() => this.client.obliterateRangeLocal(start, end));
	}

	// eslint-disable-next-line import/no-deprecated
	public groupOperation(groupOp: IMergeTreeGroupMsg): void {
		this.guardReentrancy(() => this.client.localTransaction(groupOp));
	}

	public getContainingSegment(pos: number): {
		segment: T | undefined;
		offset: number | undefined;
	} {
		return this.client.getContainingSegment<T>(pos);
	}

	public getLength(): number {
		return this.client.getLength();
	}

	public getPosition(segment: ISegment): number {
		return this.client.getPosition(segment);
	}

	public annotateRange(start: number, end: number, props: PropertySet): void {
		this.guardReentrancy(() => this.client.annotateRangeLocal(start, end, props));
	}

	public annotateAdjustRange(start: number, end: number, adjust: MapLike<AdjustParams>): void {
		this.guardReentrancy(() => this.client.annotateAdjustRangeLocal(start, end, adjust));
	}

	public getPropertiesAtPosition(pos: number): PropertySet | undefined {
		return this.client.getPropertiesAtPosition(pos);
	}

	public getRangeExtentsOfPosition(pos: number): {
		posStart: number | undefined;
		posAfterEnd: number | undefined;
	} {
		return this.client.getRangeExtentsOfPosition(pos);
	}

	public createLocalReferencePosition(
		segment: T,
		offset: number,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
		canSlideToEndpoint?: boolean,
	): LocalReferencePosition {
		return this.client.createLocalReferencePosition(
			segment,
			offset,
			refType,
			properties,
			slidingPreference,
			canSlideToEndpoint,
		);
	}

	public localReferencePositionToPosition(lref: ReferencePosition): number {
		return this.client.localReferencePositionToPosition(lref);
	}

	public removeLocalReferencePosition(
		lref: LocalReferencePosition,
	): LocalReferencePosition | undefined {
		return this.client.removeLocalReferencePosition(lref);
	}

	public resolveRemoteClientPosition(
		remoteClientPosition: number,
		remoteClientRefSeq: number,
		remoteClientId: string,
	): number | undefined {
		return this.client.resolveRemoteClientPosition(
			remoteClientPosition,
			remoteClientRefSeq,
			remoteClientId,
		);
	}

	private submitSequenceMessage(message: IMergeTreeOp) {
		if (!this.isAttached()) {
			return;
		}

		this.inFlightRefSeqs.push(this.currentRefSeq);

		const metadata = this.client.peekPendingSegmentGroups(
			message.type === MergeTreeDeltaType.GROUP ? message.ops.length : 1,
		);

		this.submitLocalMessage(message, metadata);
	}

	public posFromRelativePos(relativePos: IRelativePosition): number {
		return this.client.posFromRelativePos(relativePos);
	}

	public walkSegments<TClientData>(
		handler: ISegmentAction<TClientData>,
		start?: number,
		end?: number,
		accum?: TClientData,
		splitRange: boolean = false,
	): void {
		this.client.walkSegments(handler, start, end, accum as TClientData, splitRange);
	}

	public getCurrentSeq(): number {
		return this.client.getCurrentSeq();
	}

	public insertAtReferencePosition(pos: ReferencePosition, segment: T): void {
		this.guardReentrancy(() => this.client.insertAtReferencePositionLocal(pos, segment));
	}

	public insertFromSpec(pos: number, spec: IJSONSegment): void {
		const segment = this.segmentFromSpec(spec);
		this.guardReentrancy(() => this.client.insertSegmentLocal(pos, segment));
	}

	public getIntervalCollection(label: string): IIntervalCollection<SequenceInterval> {
		return this.intervalCollections.get(label);
	}

	public getIntervalCollectionLabels(): IterableIterator<string> {
		return this.intervalCollections.keys();
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		// conditionally write the interval collection blob
		// only if it has entries
		if (this.intervalCollections.size > 0) {
			builder.addBlob(snapshotFileName, this.intervalCollections.serialize(serializer));
		}

		builder.addWithStats(contentPath, this.summarizeMergeTree(serializer));

		return builder.getSummaryTree();
	}

	/**
	 * Runs serializer over the GC data for this SharedMatrix.
	 * All the IFluidHandle's represent routes to other objects.
	 */
	protected processGCDataCore(serializer: IFluidSerializer) {
		if (this.intervalCollections.size > 0) {
			this.intervalCollections.serialize(serializer);
		}

		this.client.serializeGCData(this.handle, serializer);
	}

	/**
	 * Replace the range specified from start to end with the provided segment
	 * This is done by inserting the segment at the end of the range, followed
	 * by removing the contents of the range
	 * For a zero or reverse range (start \>= end), insert at end do not remove anything
	 * @param start - The start of the range to replace
	 * @param end - The end of the range to replace
	 * @param segment - The segment that will replace the range
	 */
	protected replaceRange(start: number, end: number, segment: ISegment): void {
		// Insert at the max end of the range when start > end, but still remove the range later
		const insertIndex: number = Math.max(start, end);

		// Insert first, so local references can slide to the inserted seg if any
		const insert = this.guardReentrancy(() =>
			this.client.insertSegmentLocal(insertIndex, segment),
		);

		if (insert && start < end) {
			this.removeRange(start, end);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onConnect}
	 */
	protected onConnect() {
		// Update merge tree collaboration information with new client ID and then resend pending ops
		this.client.startOrUpdateCollaboration(this.runtime.clientId);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect() {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
	 */
	protected reSubmitCore(content: any, localOpMetadata: unknown) {
		const originalRefSeq = this.inFlightRefSeqs.shift();
		assert(
			originalRefSeq !== undefined,
			0x8bb /* Expected a recorded refSeq when resubmitting an op */,
		);
		this.useResubmitRefSeq(originalRefSeq, () => {
			if (
				!this.intervalCollections.tryResubmitMessage(
					content,
					localOpMetadata as IMapMessageLocalMetadata,
				)
			) {
				this.submitSequenceMessage(
					this.client.regeneratePendingOp(content as IMergeTreeOp, localOpMetadata),
				);
			}
		});
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService) {
		if (await storage.contains(snapshotFileName)) {
			const blob = await storage.readBlob(snapshotFileName);
			const header = bufferToString(blob, "utf8");
			this.intervalCollections.populate(header);
		}

		try {
			// this will load the header, and return a promise
			// that will resolve when the body is loaded
			// and the catchup ops are available.
			const { catchupOpsP } = await this.client.load(
				this.runtime,
				new ObjectStoragePartition(storage, contentPath),
				this.serializer,
			);

			// process the catch up ops, and finishing the loading process
			(await catchupOpsP).forEach((m) => {
				const collabWindow = this.client.getCollabWindow();
				if (
					m.minimumSequenceNumber < collabWindow.minSeq ||
					m.referenceSequenceNumber < collabWindow.minSeq ||
					m.sequenceNumber <= collabWindow.minSeq ||
					// sequenceNumber could be the same if messages are part of a grouped batch
					m.sequenceNumber < collabWindow.currentSeq
				) {
					throw new Error(
						`Invalid catchup operations in snapshot: ${JSON.stringify({
							op: {
								seq: m.sequenceNumber,
								minSeq: m.minimumSequenceNumber,
								refSeq: m.referenceSequenceNumber,
							},
							collabWindow: {
								seq: collabWindow.currentSeq,
								minSeq: collabWindow.minSeq,
							},
						})}`,
					);
				}
				this.processMergeTreeMsg(m);
			});

			// Initialize the interval collections
			this.initializeIntervalCollections();
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "SequenceLoadFailed" }, error);
			throw error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (local) {
			const recordedRefSeq = this.inFlightRefSeqs.shift();
			assert(recordedRefSeq !== undefined, 0x8bc /* No pending recorded refSeq found */);
			// TODO: AB#7076: Some equivalent assert should be enabled. This fails some e2e stashed op tests because
			// the deltaManager may have seen more messages than the runtime has processed while amidst the stashed op
			// flow, so e.g. when `applyStashedOp` is called and the DDS is put in a state where it expects an ack for
			// one of its messages, the delta manager has actually already seen subsequent messages from collaborators
			// which the in-flight message is concurrent to.
			// See "handles stashed ops created on top of sequenced local ops" for one such test case.
			// assert(recordedRefSeq <= message.referenceSequenceNumber, "RefSeq mismatch");
		}

		assert(
			message.type === MessageType.Operation,
			0x073 /* "Sequence message not operation" */,
		);

		const handled = this.intervalCollections.tryProcessMessage(
			message.contents as IMapOperation,
			local,
			message,
			localOpMetadata,
		);

		if (!handled) {
			this.processMergeTreeMsg(message, local);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.didAttach}
	 */
	protected didAttach() {
		// If we are not local, and we've attached we need to start generating and sending ops
		// so start collaboration and provide a default client id incase we are not connected
		if (this.isAttached()) {
			this.client.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.initializeLocalCore}
	 */
	protected initializeLocalCore() {
		super.initializeLocalCore();
		this.initializeIntervalCollections();
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(content: any): void {
		if (!this.intervalCollections.tryApplyStashedOp(content)) {
			this.client.applyStashedOp(content);
		}
	}

	private summarizeMergeTree(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const minSeq = this.deltaManager.minimumSequenceNumber;

		this.processMinSequenceNumberChanged(minSeq);

		this.messagesSinceMSNChange.forEach((m) => {
			m.minimumSequenceNumber = minSeq;
		});

		return this.client.summarize(
			this.runtime,
			this.handle,
			serializer,
			this.messagesSinceMSNChange,
		);
	}

	/**
	 *
	 * @param message - Message with decoded and hydrated handles
	 */
	private processMergeTreeMsg(message: ISequencedDocumentMessage, local?: boolean) {
		const ops: IMergeTreeDeltaOp[] = [];
		function transformOps(event: SequenceDeltaEvent) {
			ops.push(...SharedSegmentSequence.createOpsFromDelta(event));
		}
		const needsTransformation = message.referenceSequenceNumber !== message.sequenceNumber - 1;
		let stashMessage: Readonly<ISequencedDocumentMessage> = message;
		if (this.runtime.options.newMergeTreeSnapshotFormat !== true) {
			if (needsTransformation) {
				this.on("sequenceDelta", transformOps);
			}
		}

		this.client.applyMsg(message, local);

		if (this.runtime.options.newMergeTreeSnapshotFormat !== true) {
			if (needsTransformation) {
				this.removeListener("sequenceDelta", transformOps);
				// shallow clone the message as we only overwrite top level properties,
				// like referenceSequenceNumber and content only
				stashMessage = {
					...message,
					referenceSequenceNumber: stashMessage.sequenceNumber - 1,
					// eslint-disable-next-line import/no-deprecated
					contents: ops.length !== 1 ? createGroupOp(...ops) : ops[0],
				};
			}

			this.messagesSinceMSNChange.push(stashMessage);

			// Do GC every once in a while...
			if (
				this.messagesSinceMSNChange.length > 20 &&
				this.messagesSinceMSNChange[20].sequenceNumber < message.minimumSequenceNumber
			) {
				this.processMinSequenceNumberChanged(message.minimumSequenceNumber);
			}
		}
	}

	private processMinSequenceNumberChanged(minSeq: number) {
		let index = 0;
		for (; index < this.messagesSinceMSNChange.length; index++) {
			if (this.messagesSinceMSNChange[index].sequenceNumber > minSeq) {
				break;
			}
		}
		if (index !== 0) {
			this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
		}
	}

	private initializeIntervalCollections() {
		// Listen and initialize new SharedIntervalCollections
		this.intervalCollections.eventEmitter.on(
			"create",
			({ key, previousValue }: IValueChanged, local: boolean) => {
				const intervalCollection = this.intervalCollections.get(key);
				if (!intervalCollection.attached) {
					intervalCollection.attachGraph(this.client, key);
				}
				assert(
					previousValue === undefined,
					0x2c1 /* "Creating an interval collection that already exists?" */,
				);
				this.emit("createIntervalCollection", key, local, this);
			},
		);

		// Initialize existing SharedIntervalCollections
		for (const key of this.intervalCollections.keys()) {
			const intervalCollection = this.intervalCollections.get(key);
			intervalCollection.attachGraph(this.client, key);
		}
	}

	/**
	 * Overrides the "currently applicable reference sequence number" for the duration of the callback.
	 * See remarks on `currentRefSeq` for more context.
	 */
	private useResubmitRefSeq(refSeq: number, callback: () => void) {
		const previousResubmitRefSeq = this.ongoingResubmitRefSeq;
		this.ongoingResubmitRefSeq = refSeq;
		try {
			callback();
		} finally {
			this.ongoingResubmitRefSeq = previousResubmitRefSeq;
		}
	}
}

function createReentrancyDetector(
	onReentrancy: (depth: number) => void,
): <T>(callback: () => T) => T {
	let depth = 0;
	function detectReentrancy<T>(callback: () => T): T {
		if (depth > 0) {
			onReentrancy(depth);
		}
		depth++;
		try {
			return callback();
		} finally {
			depth--;
		}
	}

	return detectReentrancy;
}

/**
 * Apps which generate reentrant behavior may do so at a high frequency.
 * Logging even per-SharedSegmentSequence instance might be too noisy, and having a few logs from a session
 * is likely enough.
 */
let totalReentrancyLogs = 3;

/**
 * Resets the reentrancy log counter. Test-only API.
 */
export function resetReentrancyLogCounter() {
	totalReentrancyLogs = 3;
}

const reentrancyErrorMessage = "Reentrancy detected in sequence local ops";
const ensureNoReentrancy = createReentrancyDetector(() => {
	throw new LoggingError(reentrancyErrorMessage);
});
