/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { NonCollabClient, UnassignedSequenceNumber } from "./constants";
import {
    ISegment,
    MergeTree,
} from "./mergeTree";
import { IJSONSegment } from "./ops";
import { matchProperties } from "./properties";
import {
    MergeTreeChunkLegacy,
    serializeAsMinSupportedVersion,
} from "./snapshotChunks";

interface SnapshotHeader {
    chunkCount?: number;
    segmentsTotalLength: number;
    indexOffset?: number;
    segmentsOffset?: number;
    seq: number;
    // TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
    //       (See https://github.com/microsoft/FluidFramework/issues/84)
    minSeq?: number;
}

export class SnapshotLegacy {
    public static readonly header = "header";
    public static readonly body = "body";
    private static readonly catchupOps = "catchupOps";

    // Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
    // Please note that this number has no direct relationship to anything other than size of raw text (characters).
    // As we produce json for the blob (and then send over the wire compressed), this number
    // is really hard to correlate with any actual metric that matters (like bytes over the wire).
    // For test with small number of chunks it would be closer to blob size,
    // for very chunky text, blob size can easily be 4x-8x of that number.
    public static readonly sizeOfFirstChunk: number = 10000;

    private header: SnapshotHeader | undefined;
    private seq: number | undefined;
    private segments: IJSONSegment[] | undefined;
    private segmentLengths: number[] | undefined;
    private readonly logger: ITelemetryLogger;
    private readonly chunkSize: number;

    constructor(public mergeTree: MergeTree, logger: ITelemetryLogger, public filename?: string,
        public onCompletion?: () => void) {
        this.logger = ChildLogger.create(logger, "Snapshot");
        this.chunkSize = mergeTree?.options?.mergeTreeSnapshotChunkSize ?? SnapshotLegacy.sizeOfFirstChunk;
    }

    private getSeqLengthSegs(
        allSegments: IJSONSegment[],
        allLengths: number[],
        approxSequenceLength: number,
        startIndex = 0): MergeTreeChunkLegacy {
        const segs: IJSONSegment[] = [];
        let sequenceLength = 0;
        let segCount = 0;
        while ((sequenceLength < approxSequenceLength) && ((startIndex + segCount) < allSegments.length)) {
            const pseg = allSegments[startIndex + segCount];
            segs.push(pseg);
            sequenceLength += allLengths[startIndex + segCount];
            segCount++;
        }
        return {
            version: undefined,
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: sequenceLength,
            totalLengthChars: this.header!.segmentsTotalLength,
            totalSegmentCount: allSegments.length,
            chunkSequenceNumber: this.header!.seq,
            segmentTexts: segs,
        };
    }

    /**
     * Emits the snapshot to an ISummarizeResult. If provided the optional IFluidSerializer will be used when
     * serializing the summary data rather than JSON.stringify.
     */
    emit(
        catchUpMsgs: ISequencedDocumentMessage[],
        serializer: IFluidSerializer,
        bind: IFluidHandle,
    ): ISummaryTreeWithStats {
        const chunk1 = this.getSeqLengthSegs(this.segments!, this.segmentLengths!, this.chunkSize);
        let length: number = chunk1.chunkLengthChars;
        let segments: number = chunk1.chunkSegmentCount;
        const builder = new SummaryTreeBuilder();
        builder.addBlob(SnapshotLegacy.header, serializeAsMinSupportedVersion(
            SnapshotLegacy.header,
            chunk1,
            this.logger,
            this.mergeTree.options,
            serializer,
            bind));

        if (chunk1.chunkSegmentCount < chunk1.totalSegmentCount!) {
            const chunk2 = this.getSeqLengthSegs(this.segments!, this.segmentLengths!,
                this.header!.segmentsTotalLength, chunk1.chunkSegmentCount);
            length += chunk2.chunkLengthChars;
            segments += chunk2.chunkSegmentCount;
            builder.addBlob(SnapshotLegacy.body, serializeAsMinSupportedVersion(
                SnapshotLegacy.body,
                chunk2,
                this.logger,
                this.mergeTree.options,
                serializer,
                bind));
        }

        assert(
            length === this.header!.segmentsTotalLength,
            0x05d /* "emit: mismatch in segmentsTotalLength" */);

        assert(
            segments === chunk1.totalSegmentCount,
            0x05e /* "emit: mismatch in totalSegmentCount" */);

        if (catchUpMsgs !== undefined && catchUpMsgs.length > 0) {
            builder.addBlob(
                this.mergeTree.options?.catchUpBlobName ?? SnapshotLegacy.catchupOps,
                serializer ? serializer.stringify(catchUpMsgs, bind) : JSON.stringify(catchUpMsgs));
        }

        return builder.getSummaryTree();
    }

    extractSync() {
        const collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq,
                NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };

        const segs: ISegment[] = [];
        let prev: ISegment | undefined;
        const extractSegment =
            // eslint-disable-next-line max-len
            (segment: ISegment, pos: number, refSeq: number, clientId: number, start: number | undefined, end: number | undefined) => {
                if ((segment.seq !== UnassignedSequenceNumber) && (segment.seq! <= this.seq!) &&
                    ((segment.removedSeq === undefined) || (segment.removedSeq === UnassignedSequenceNumber) ||
                        (segment.removedSeq > this.seq!))) {
                    if (prev?.canAppend(segment)
                        && matchProperties(prev.properties, segment.properties)
                    ) {
                        prev = prev.clone();
                        prev.append(segment.clone());
                    } else {
                        if (prev) {
                            segs.push(prev);
                        }
                        prev = segment;
                    }
                }
                return true;
            };

        this.mergeTree.map({ leaf: extractSegment }, this.seq, NonCollabClient, undefined);
        if (prev) {
            segs.push(prev);
        }

        this.segments = [];
        this.segmentLengths = [];
        let totalLength: number = 0;
        segs.map((segment) => {
            totalLength += segment.cachedLength;
            this.segments!.push(segment.toJSONObject());
            this.segmentLengths!.push(segment.cachedLength);
        });

        // We observed this.header.segmentsTotalLength < totalLength to happen in some cases
        // When this condition happens, we might not write out all segments in getSeqLengthSegs()
        // when writing out "body". Issue #1995 tracks following up on the core of the problem.
        // In the meantime, this code makes sure we will write out all segments properly

        if (this.header.segmentsTotalLength !== totalLength) {
            this.logger.sendErrorEvent({
                eventName: "SegmentsTotalLengthMismatch",
                totalLength,
                segmentsTotalLength: this.header.segmentsTotalLength,
            });
            this.header.segmentsTotalLength = totalLength;
        }

        return this.segments;
    }
}
