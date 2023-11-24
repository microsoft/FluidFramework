/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import {
	ISequencedDocumentMessage,
	ISummaryTree,
	ITree,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import { Trace } from "@fluid-internal/client-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import { Client } from "../client";
import { DoublyLinkedList } from "../collections";
import { UnassignedSequenceNumber } from "../constants";
import { IMergeBlock, IMergeLeaf, ISegment, Marker, MaxNodesInBlock } from "../mergeTreeNodes";
import { createAnnotateRangeOp, createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { IJSONSegment, IMarkerDef, IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops";
import { PropertySet } from "../properties";
import { SnapshotLegacy } from "../snapshotlegacy";
import { TextSegment } from "../textSegment";
import { getSlideToSegoff, MergeTree } from "../mergeTree";
import { MergeTreeTextHelper } from "../MergeTreeTextHelper";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback";
import { backwardExcursion, forwardExcursion, walkAllChildSegments } from "../mergeTreeNodeWalk";
import { DetachedReferencePosition, refHasTileLabel } from "../referencePositions";
import { MergeTreeRevertibleDriver } from "../revertibles";
import { IMergeTreeOptions, ReferencePosition } from "..";
import { TestSerializer } from "./testSerializer";
import { nodeOrdinalsHaveIntegrity } from "./testUtils";

export function specToSegment(spec: IJSONSegment): ISegment {
	const maybeText = TextSegment.fromJSONObject(spec);
	if (maybeText) {
		return maybeText;
	}

	const maybeMarker = Marker.fromJSONObject(spec);
	if (maybeMarker) {
		return maybeMarker;
	}

	throw new Error(`Unrecognized IJSONSegment type: '${JSON.stringify(spec)}'`);
}

const random = makeRandom(0xdeadbeef, 0xfeedbed);

export class TestClient extends Client {
	public static searchChunkSize = 256;
	public static readonly serializer = new TestSerializer();
	public measureOps = false;
	public accumTime = 0;
	public accumWindowTime = 0;
	public accumWindow = 0;
	public accumOps = 0;
	public maxWindowTime = 0;

	/**
	 * Used for in-memory testing.  This will queue a reference string for each client message.
	 */
	public static useCheckQ = false;

	public static async createFromClientSnapshot(
		client1: TestClient,
		newLongClientId: string,
	): Promise<TestClient> {
		const snapshot = new SnapshotLegacy(
			client1.mergeTree,
			createChildLogger({ namespace: "fluid:snapshot" }),
		);
		snapshot.extractSync();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const summaryTree = snapshot.emit([], TestClient.serializer, undefined!).summary;
		return TestClient.createFromSummary(
			summaryTree,
			newLongClientId,
			client1.specToSegment,
			client1.mergeTree.options,
		);
	}

	public static async createFromSnapshot(
		snapshotTree: ITree,
		newLongClientId: string,
		specToSeg: (spec: IJSONSegment) => ISegment,
		options?: PropertySet,
	): Promise<TestClient> {
		return TestClient.createFromStorage(
			new MockStorage(snapshotTree),
			newLongClientId,
			specToSeg,
			options,
		);
	}

	public static async createFromSummary(
		summaryTree: ISummaryTree,
		newLongClientId: string,
		specToSeg: (spec: IJSONSegment) => ISegment,
		options?: PropertySet,
	): Promise<TestClient> {
		return TestClient.createFromStorage(
			MockStorage.createFromSummary(summaryTree),
			newLongClientId,
			specToSeg,
			options,
		);
	}

	public static async createFromStorage(
		storage: MockStorage,
		newLongClientId: string,
		specToSeg: (spec: IJSONSegment) => ISegment,
		options?: PropertySet,
	): Promise<TestClient> {
		const client2 = new TestClient(options, specToSeg);
		const { catchupOpsP } = await client2.load(
			{
				logger: client2.logger,
				clientId: newLongClientId,
			} as any as IFluidDataStoreRuntime,
			storage,
			TestClient.serializer,
		);
		await catchupOpsP;
		return client2;
	}

	public readonly mergeTree: MergeTree;

	public readonly checkQ: DoublyLinkedList<string> = new DoublyLinkedList<string>();
	protected readonly q: DoublyLinkedList<ISequencedDocumentMessage> =
		new DoublyLinkedList<ISequencedDocumentMessage>();

	private readonly textHelper: MergeTreeTextHelper;
	constructor(options?: IMergeTreeOptions & PropertySet, specToSeg = specToSegment) {
		super(specToSeg, createChildLogger({ namespace: "fluid:testClient" }), options);
		this.mergeTree = (this as Record<"_mergeTree", MergeTree>)._mergeTree;
		this.textHelper = new MergeTreeTextHelper(this.mergeTree);

		// Validate by default
		this.on("delta", (o, d) => {
			// assert.notEqual(d.deltaSegments.length, 0);
			d.deltaSegments.forEach((s) => {
				if (d.operation === MergeTreeDeltaType.INSERT) {
					const seg: IMergeLeaf = s.segment;
					assert.notEqual(seg.parent, undefined);
				}
			});
		});
	}

	/**
	 * @internal
	 */
	public obliterateRange({
		start,
		end,
		refSeq,
		clientId,
		seq,
		overwrite = false,
		opArgs,
	}: {
		start: number;
		end: number;
		refSeq: number;
		clientId: number;
		seq: number;
		overwrite?: boolean;
		opArgs: IMergeTreeDeltaOpArgs;
	}): void {
		this.mergeTree.obliterateRange(start, end, refSeq, clientId, seq, overwrite, opArgs);
	}

	public getText(start?: number, end?: number): string {
		return this.textHelper.getText(this.getCurrentSeq(), this.getClientId(), "", start, end);
	}

	public enqueueTestString() {
		this.checkQ.push(this.getText());
	}
	public getMessageCount(): number {
		return this.q.length;
	}
	public enqueueMsg(msg: ISequencedDocumentMessage) {
		this.q.push(msg);
	}
	public dequeueMsg(): ISequencedDocumentMessage | undefined {
		return this.q.shift()?.data;
	}
	public applyMessages(msgCount: number) {
		let currMsgCount = msgCount;
		while (currMsgCount > 0) {
			const msg = this.dequeueMsg();
			if (msg) {
				this.applyMsg(msg);
			} else {
				break;
			}
			currMsgCount--;
		}

		return true;
	}

	public insertTextLocal(pos: number, text: string, props?: PropertySet) {
		const segment = new TextSegment(text);
		if (props) {
			segment.addProperties(props);
		}
		return this.insertSegmentLocal(pos, segment);
	}

	public insertTextRemote(
		pos: number,
		text: string,
		props: PropertySet | undefined,
		seq: number,
		refSeq: number,
		longClientId: string,
	) {
		const segment = new TextSegment(text);
		if (props) {
			segment.addProperties(props);
		}
		this.applyMsg(
			this.makeOpMessage(createInsertSegmentOp(pos, segment), seq, refSeq, longClientId),
		);
	}

	public removeRangeRemote(
		start: number,
		end: number,
		seq: number,
		refSeq: number,
		longClientId: string,
	) {
		this.applyMsg(
			this.makeOpMessage(createRemoveRangeOp(start, end), seq, refSeq, longClientId),
		);
	}

	public annotateRangeRemote(
		start: number,
		end: number,
		props: PropertySet,
		seq: number,
		refSeq: number,
		longClientId: string,
	) {
		this.applyMsg(
			this.makeOpMessage(createAnnotateRangeOp(start, end, props), seq, refSeq, longClientId),
		);
	}

	public insertMarkerLocal(pos: number, behaviors: ReferenceType, props?: PropertySet) {
		const segment = new Marker(behaviors);
		if (props) {
			segment.addProperties(props);
		}
		return this.insertSegmentLocal(pos, segment);
	}

	public insertMarkerRemote(
		pos: number,
		markerDef: IMarkerDef,
		props: PropertySet,
		seq: number,
		refSeq: number,
		longClientId: string,
	) {
		const segment = new Marker(markerDef.refType ?? ReferenceType.Tile);
		if (props) {
			segment.addProperties(props);
		}
		this.applyMsg(
			this.makeOpMessage(createInsertSegmentOp(pos, segment), seq, refSeq, longClientId),
		);
	}

	public relText(clientId: number, refSeq: number) {
		return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${this.textHelper.getText(
			refSeq,
			clientId,
		)}`;
	}

	public makeOpMessage(
		op: IMergeTreeOp | undefined,
		seq: number = UnassignedSequenceNumber,
		refSeq: number = this.getCurrentSeq(),
		longClientId?: string,
		minSeqNumber = 0,
	) {
		if (op === undefined) {
			throw new Error("op cannot be undefined");
		}
		const msg: ISequencedDocumentMessage = {
			clientId: longClientId ?? this.longClientId ?? "",
			clientSequenceNumber: 1,
			contents: op,
			metadata: undefined,
			minimumSequenceNumber: minSeqNumber,
			referenceSequenceNumber: refSeq,
			sequenceNumber: seq,
			timestamp: Date.now(),
			traces: [],
			type: MessageType.Operation,
		};
		return msg;
	}

	public validate() {
		assert(nodeOrdinalsHaveIntegrity(this.mergeTree.root));
	}

	public searchFromPos(pos: number, target: RegExp) {
		let start = pos;
		let chunk = "";
		while (start < this.getLength()) {
			chunk = this.getText(start, start + TestClient.searchChunkSize);

			const result = chunk.match(target);
			if (result?.index) {
				return { text: result[0], pos: result.index + start };
			}
			start += TestClient.searchChunkSize;
		}
	}

	public findRandomWord() {
		const len = this.getLength();
		const pos = random.integer(0, len);
		const nextWord = this.searchFromPos(pos, /\s\w+\b/);
		return nextWord;
	}

	public debugDumpTree(tree: MergeTree) {
		// want the segment's content and the state of insert/remove
		const test: string[] = [];
		walkAllChildSegments(tree.root, (segment) => {
			const prefixes: (string | undefined | number)[] = [];
			prefixes.push(
				segment.seq !== UnassignedSequenceNumber ? segment.seq : `L${segment.localSeq}`,
			);
			if (segment.removedSeq !== undefined) {
				prefixes.push(
					segment.removedSeq !== UnassignedSequenceNumber
						? segment.removedSeq
						: `L${segment.localRemovedSeq}`,
				);
			}
			test.push(`${prefixes.join(",")}:${(segment as any).text}`);
		});
	}

	/**
	 * Rebases a (local) position from the perspective `{ seq: seqNumberFrom, localSeq }` to the perspective
	 * of the current sequence number. This is desirable when rebasing operations for reconnection. Perform
	 * slow-path computations in this function without leveraging the merge-tree's structure
	 */
	public rebasePosition(pos: number, seqNumberFrom: number, localSeq: number): number {
		let segment: ISegment | undefined;
		let posAccumulated = 0;
		let offset = pos;
		const isInsertedInView = (seg: ISegment) =>
			(seg.seq !== undefined &&
				seg.seq !== UnassignedSequenceNumber &&
				seg.seq <= seqNumberFrom) ||
			(seg.localSeq !== undefined && seg.localSeq <= localSeq);

		const isRemovedFromView = ({ removedSeq, localRemovedSeq }: ISegment) =>
			(removedSeq !== undefined &&
				removedSeq !== UnassignedSequenceNumber &&
				removedSeq <= seqNumberFrom) ||
			(localRemovedSeq !== undefined && localRemovedSeq <= localSeq);

		walkAllChildSegments(this.mergeTree.root, (seg) => {
			assert(
				seg.seq !== undefined || seg.localSeq !== undefined,
				"either seq or localSeq should be defined",
			);
			segment = seg;

			if (isInsertedInView(seg) && !isRemovedFromView(seg)) {
				posAccumulated += seg.cachedLength;
				if (offset >= seg.cachedLength) {
					offset -= seg.cachedLength;
				}
			}

			// Keep going while we've yet to reach the segment at the desired position
			return posAccumulated <= pos;
		});

		assert(segment !== undefined, "No segment found");
		const segoff = getSlideToSegoff({ segment, offset }) ?? segment;
		if (segoff.segment === undefined || segoff.offset === undefined) {
			return DetachedReferencePosition;
		}

		return this.findReconnectionPosition(segoff.segment, localSeq) + segoff.offset;
	}

	public findReconnectionPosition(segment: ISegment, localSeq: number): number {
		const fasterComputedPosition = super.findReconnectionPosition(segment, localSeq);

		let segmentPosition = 0;
		const isInsertedInView = (seg: ISegment) =>
			seg.localSeq === undefined || seg.localSeq <= localSeq;
		const isRemovedFromView = ({ removedSeq, localRemovedSeq }: ISegment) =>
			removedSeq !== undefined &&
			(removedSeq !== UnassignedSequenceNumber ||
				(localRemovedSeq !== undefined && localRemovedSeq <= localSeq));
		const isMovedFromView = ({ movedSeq, localMovedSeq }: ISegment) =>
			movedSeq !== undefined &&
			(movedSeq !== UnassignedSequenceNumber ||
				(localMovedSeq !== undefined && localMovedSeq <= localSeq));
		/*
            Walk the segments up to the current segment, and calculate its
            position taking into account local segments that were modified,
            after the current segment.
        */
		walkAllChildSegments(this.mergeTree.root, (seg) => {
			// If we've found the desired segment, terminate the walk and return 'segmentPosition'.
			if (seg === segment) {
				return false;
			}

			// Otherwise, advance segmentPosition if the segment has been inserted and not removed
			// with respect to the given 'localSeq'.
			//
			// Note that all ACKed / remote ops are applied and we only need concern ourself with
			// determining if locally pending ops fall before/after the given 'localSeq'.
			if (isInsertedInView(seg) && !isRemovedFromView(seg) && !isMovedFromView(seg)) {
				segmentPosition += seg.cachedLength;
			}

			return true;
		});

		assert.equal(
			fasterComputedPosition,
			segmentPosition,
			"Expected fast-path computation to match result from walk all segments",
		);
		return segmentPosition;
	}

	/**
	 * @param channel - Attribution channel name to request information from.
	 * @returns an array of all attribution seq#s from the current perspective.
	 * The `i`th entry of the array is the attribution key for the character at position `i`.
	 * Validates segments either all have attribution information or none of them.
	 * If no segment has attribution information, returns undefined.
	 */
	public getAllAttributionSeqs(channel?: string): (number | AttributionKey | undefined)[] {
		const seqs: (number | AttributionKey | undefined)[] = [];
		this.walkAllSegments((segment) => {
			for (let i = 0; i < segment.cachedLength; i++) {
				const key = segment.attribution?.getAtOffset(i, channel);
				seqs.push(key?.type === "op" ? key.seq : key);
			}
			return true;
		});

		return seqs;
	}

	/**
	 * Override and add some test only metrics
	 */
	public applyMsg(msg: ISequencedDocumentMessage, local: boolean = false) {
		let traceStart: Trace | undefined;
		if (this.measureOps) {
			traceStart = Trace.start();
		}

		super.applyMsg(msg, local);

		if (traceStart) {
			this.accumTime += elapsedMicroseconds(traceStart);
			this.accumOps++;
			this.accumWindow += this.getCurrentSeq() - this.getCollabWindow().minSeq;
		}
	}

	/**
	 * Override and add some test only metrics
	 */
	updateMinSeq(minSeq: number) {
		let trace: Trace | undefined;
		if (this.measureOps) {
			trace = Trace.start();
		}

		super.updateMinSeq(minSeq);
		if (trace) {
			const elapsed = elapsedMicroseconds(trace);
			this.accumWindowTime += elapsed;
			if (elapsed > this.maxWindowTime) {
				this.maxWindowTime = elapsed;
			}
		}
	}

	slowSearchForMarker(
		startPos: number,
		markerLabel: string,
		forwards = true,
	): ReferencePosition | undefined {
		let foundMarker: Marker | undefined;

		const { segment } = this.getContainingSegment(startPos);
		const segWithParent: IMergeLeaf = segment as IMergeLeaf;

		if (Marker.is(segWithParent)) {
			if (refHasTileLabel(segWithParent, markerLabel)) {
				foundMarker = segWithParent;
			}
		} else {
			if (forwards) {
				forwardExcursion(segWithParent, (seg) => {
					if (Marker.is(seg)) {
						if (refHasTileLabel(seg, markerLabel)) {
							foundMarker = seg;
							return false;
						}
					}
				});
			} else {
				backwardExcursion(segWithParent, (seg) => {
					if (Marker.is(seg)) {
						if (refHasTileLabel(seg, markerLabel)) {
							foundMarker = seg;
							return false;
						}
					}
				});
			}
		}

		return foundMarker;
	}
}

function elapsedMicroseconds(trace: Trace) {
	return trace.trace().duration * 1000;
}

// the client doesn't submit ops, so this adds a callback to capture them
export type TestClientRevertibleDriver = MergeTreeRevertibleDriver &
	Partial<{ submitOpCallback?: (op: IMergeTreeOp | undefined) => void }>;

export const createRevertDriver = (client: TestClient): TestClientRevertibleDriver => {
	return {
		removeRange(start: number, end: number) {
			const op = client.removeRangeLocal(start, end);
			this.submitOpCallback?.(op);
		},
		annotateRange(start: number, end: number, props: PropertySet) {
			const op = client.annotateRangeLocal(start, end, props);
			this.submitOpCallback?.(op);
		},
		insertFromSpec(pos: number, spec: IJSONSegment) {
			const op = client.insertSegmentLocal(pos, client.specToSegment(spec));
			this.submitOpCallback?.(op);
		},
	};
};

export interface MergeTreeStats {
	maxHeight: number;
	nodeCount: number;
	leafCount: number;
	removedLeafCount: number;
	liveCount: number;
	histo: number[];
	windowTime?: number;
	packTime?: number;
	ordTime?: number;
	maxOrdTime?: number;
}

export function getStats(tree: MergeTree) {
	const nodeGetStats = (block: IMergeBlock): MergeTreeStats => {
		const stats: MergeTreeStats = {
			maxHeight: 0,
			nodeCount: 0,
			leafCount: 0,
			removedLeafCount: 0,
			liveCount: 0,
			histo: [],
		};
		for (let k = 0; k < MaxNodesInBlock; k++) {
			stats.histo[k] = 0;
		}
		for (let i = 0; i < block.childCount; i++) {
			const child = block.children[i];
			let height = 1;
			if (!child.isLeaf()) {
				const childStats = nodeGetStats(child);
				height = 1 + childStats.maxHeight;
				stats.nodeCount += childStats.nodeCount;
				stats.leafCount += childStats.leafCount;
				stats.removedLeafCount += childStats.removedLeafCount;
				stats.liveCount += childStats.liveCount;
				for (let j = 0; j < MaxNodesInBlock; j++) {
					stats.histo[j] += childStats.histo[j];
				}
			} else {
				stats.leafCount++;
				const segment = child;
				if (segment.removedSeq !== undefined) {
					stats.removedLeafCount++;
				}
			}
			if (height > stats.maxHeight) {
				stats.maxHeight = height;
			}
		}
		stats.histo[block.childCount]++;
		stats.nodeCount++;
		stats.liveCount += block.childCount;
		return stats;
	};
	const rootStats = nodeGetStats(tree.root);
	return rootStats;
}
