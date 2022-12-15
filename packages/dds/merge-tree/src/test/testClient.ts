/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage, ISummaryTree, ITree, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import random from "random-js";
import { Client } from "../client";
import {
    List,
} from "../collections";
import { UnassignedSequenceNumber } from "../constants";
import { IMergeBlock, ISegment, Marker, MaxNodesInBlock, MergeTreeStats } from "../mergeTreeNodes";
import { createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { IJSONSegment, IMarkerDef, IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops";
import { PropertySet } from "../properties";
import { SnapshotLegacy } from "../snapshotlegacy";
import { TextSegment } from "../textSegment";
import { MergeTree } from "../mergeTree";
import { MergeTreeTextHelper } from "../MergeTreeTextHelper";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback";
import { walkAllChildSegments } from "../mergeTreeNodeWalk";
import { LocalReferencePosition } from "../localReference";
import { InternalRevertDriver } from "../revertibles";
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

const mt = random.engines.mt19937();
mt.seedWithArray([0xDEADBEEF, 0xFEEDBED]);

export class TestClient extends Client {
    public static searchChunkSize = 256;
    public static readonly serializer = new TestSerializer();

    /**
     * Used for in-memory testing.  This will queue a reference string for each client message.
     */
    public static useCheckQ = false;

    public static async createFromClientSnapshot(client1: TestClient, newLongClientId: string): Promise<TestClient> {
        const snapshot = new SnapshotLegacy(client1.mergeTree, DebugLogger.create("fluid:snapshot"));
        snapshot.extractSync();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const summaryTree = snapshot.emit([], TestClient.serializer, undefined!).summary;
        return TestClient.createFromSummary(
            summaryTree, newLongClientId, client1.specToSegment, client1.mergeTree.options);
    }

    public static async createFromSnapshot(
        snapshotTree: ITree,
        newLongClientId: string,
        specToSeg: (spec: IJSONSegment) => ISegment,
        options?: PropertySet): Promise<TestClient> {
        return TestClient.createFromStorage(new MockStorage(snapshotTree), newLongClientId, specToSeg, options);
    }

    public static async createFromSummary(
        summaryTree: ISummaryTree,
        newLongClientId: string,
        specToSeg: (spec: IJSONSegment) => ISegment,
        options?: PropertySet): Promise<TestClient> {
        return TestClient.createFromStorage(
            MockStorage.createFromSummary(summaryTree), newLongClientId, specToSeg, options);
    }

    public static async createFromStorage(
        storage: MockStorage,
        newLongClientId: string,
        specToSeg: (spec: IJSONSegment) => ISegment,
        options?: PropertySet): Promise<TestClient> {
        const client2 = new TestClient(options, specToSeg);
        const { catchupOpsP } = await client2.load(
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            {
                logger: client2.logger,
                clientId: newLongClientId,
            } as IFluidDataStoreRuntime,
            storage,
            TestClient.serializer);
        await catchupOpsP;
        return client2;
    }

    public readonly mergeTree: MergeTree;

    public readonly checkQ: List<string> = new List<string>();
    protected readonly q: List<ISequencedDocumentMessage> = new List<ISequencedDocumentMessage>();

    private readonly textHelper: MergeTreeTextHelper;
    constructor(
        options?: PropertySet,
        specToSeg = specToSegment) {
        super(
            specToSeg,
            DebugLogger.create("fluid:testClient"),
            options);
        this.mergeTree = (this as Record<"_mergeTree", MergeTree>)._mergeTree;
        this.textHelper = new MergeTreeTextHelper(this.mergeTree);

        // Validate by default
        this.mergeTree.mergeTreeDeltaCallback = (o, d) => {
            // assert.notEqual(d.deltaSegments.length, 0);
            d.deltaSegments.forEach((s) => {
                if (d.operation === MergeTreeDeltaType.INSERT) {
                    assert.notEqual(s.segment.parent, undefined);
                }
            });
        };
    }

    /**
     * @internal
     */
    public obliterateRange({ start, end, refSeq, clientId, seq, overwrite = false, opArgs }: {
        start: number;
        end: number;
        refSeq: number;
        clientId: number;
        seq: number;
        overwrite?: boolean;
        opArgs: IMergeTreeDeltaOpArgs;
    }): void {
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, overwrite, opArgs);
    }

    public obliterateRangeLocal(start: number, end: number) {
        return this.removeRangeLocal(start, end);
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

    public insertTextLocal(
        pos: number,
        text: string,
        props?: PropertySet,
    ) {
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
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            longClientId));
    }

    public removeRangeRemote(
        start: number,
        end: number,
        seq: number,
        refSeq: number,
        longClientId: string,
    ) {
        this.applyMsg(this.makeOpMessage(
            createRemoveRangeOp(start, end),
            seq,
            refSeq,
            longClientId));
    }

    public insertMarkerLocal(
        pos: number,
        behaviors: ReferenceType,
        props?: PropertySet,
    ) {
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
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            longClientId));
    }

    public relText(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${this.textHelper.getText(refSeq, clientId)}`;
    }

    public makeOpMessage(
        op: IMergeTreeOp | undefined,
        seq: number = UnassignedSequenceNumber,
        refSeq: number = this.getCurrentSeq(),
        longClientId?: string,
        minSeqNumber = 0) {
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
            term: 1,
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
                return { text: result[0], pos: (result.index + start) };
            }
            start += TestClient.searchChunkSize;
        }
    }

    public findRandomWord() {
        const len = this.getLength();
        const pos = random.integer(0, len)(mt);
        const nextWord = this.searchFromPos(pos, /\s\w+\b/);
        return nextWord;
    }

    public debugDumpTree(tree: MergeTree) {
        // want the segment's content and the state of insert/remove
        const test: string[] = [];
        walkAllChildSegments(tree.root,
            (segment) => {
                const prefixes: (string | undefined | number)[] = [];
                prefixes.push(segment.seq !== UnassignedSequenceNumber ? segment.seq : `L${segment.localSeq}`);
                if (segment.removedSeq !== undefined) {
                    prefixes.push(segment.removedSeq !== UnassignedSequenceNumber
                        ? segment.removedSeq
                        : `L${segment.localRemovedSeq}`);
                }
                test.push(`${prefixes.join(",")}:${(segment as any).text}`);
            });
    }

    private findReconnectionPositionSegment?: ISegment;

    /**
     * client.ts has accelerated versions of these methods which leverage the merge-tree's structure.
     * To help verify their correctness, we additionally perform slow-path computations of the same values
     * (which involve linear walks of the tree) and assert they match.
     */
    public rebasePosition(pos: number, seqNumberFrom: number, localSeq: number): number {
        const fastPathResult = super.rebasePosition(pos, seqNumberFrom, localSeq);
        const fastPathSegment = this.findReconnectionPositionSegment;
        this.findReconnectionPositionSegment = undefined;

        let segment: ISegment | undefined;
        let posAccumulated = 0;
        let offset = pos;
        const isInsertedInView = (seg: ISegment) =>
            (seg.seq !== undefined && seg.seq !== UnassignedSequenceNumber && seg.seq <= seqNumberFrom)
            || (seg.localSeq !== undefined && seg.localSeq <= localSeq);

        const isRemovedFromView = ({ removedSeq, localRemovedSeq }: ISegment) =>
            (removedSeq !== undefined && removedSeq !== UnassignedSequenceNumber && removedSeq <= seqNumberFrom)
            || (localRemovedSeq !== undefined && localRemovedSeq <= localSeq);

        walkAllChildSegments(this.mergeTree.root, (seg) => {
            assert(seg.seq !== undefined || seg.localSeq !== undefined, "either seq or localSeq should be defined");
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

        const segoff = this.getSlideToSegment({ segment, offset }) ?? segment;

        const slowPathResult =
            segoff.segment !== undefined
            && segoff.offset !== undefined
            && this.findReconnectionPosition(segoff.segment, localSeq) + segoff.offset;

        assert.equal(fastPathSegment, segoff.segment ?? undefined, "Unequal rebasePosition computed segments");
        assert.equal(fastPathResult, slowPathResult, "Unequal rebasePosition results");
        return fastPathResult;
    }

    protected findReconnectionPosition(segment: ISegment, localSeq: number): number {
        this.findReconnectionPositionSegment = segment;
        const fasterComputedPosition = super.findReconnectionPosition(segment, localSeq);

        let segmentPosition = 0;
        const isInsertedInView = (seg: ISegment) => seg.localSeq === undefined || seg.localSeq <= localSeq;
        const isRemovedFromView = ({ removedSeq, localRemovedSeq }: ISegment) => removedSeq !== undefined &&
            (removedSeq !== UnassignedSequenceNumber || (localRemovedSeq !== undefined && localRemovedSeq <= localSeq));

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
            if (isInsertedInView(seg) && !isRemovedFromView(seg)) {
                segmentPosition += seg.cachedLength;
            }

            return true;
        });

        assert(fasterComputedPosition === segmentPosition,
            "Expected fast-path computation to match result from walk all segments");
        return segmentPosition;
    }
}

// the client doesn't submit ops, so this adds a callback to capture them
export type TestClientRevertibleDriver =
    InternalRevertDriver & Partial<{ submitOpCallback?: (op: IMergeTreeOp | undefined) => void; }>;

export const createRevertDriver =
    (client: TestClient): TestClientRevertibleDriver => {
    return {
        createLocalReferencePosition: client.createLocalReferencePosition.bind(client),

        removeRange(start: number, end: number) {
            const op = client.removeRangeLocal(start, end);
            this.submitOpCallback?.(op);
        },
        getPosition(segment: ISegment): number {
            return client.getPosition(segment);
        },
        annotateRange(
            start: number,
            end: number,
            props: PropertySet) {
                const op = client.annotateRangeLocal(start, end, props, undefined);
                this.submitOpCallback?.(op);
            },
        insertFromSpec(pos: number, spec: IJSONSegment) {
            const op = client.insertSegmentLocal(pos, client.specToSegment(spec));
            this.submitOpCallback?.(op);
        },
        localReferencePositionToPosition(lref: LocalReferencePosition): number {
            return client.localReferencePositionToPosition(lref);
        },
        getContainingSegment: client.getContainingSegment.bind(client),

    };
};

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
