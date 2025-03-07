/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { NonCollabClient } from "./constants.js";
import { MergeTree } from "./mergeTree.js";
import { timestampUtils, type ISegmentPrivate } from "./mergeTreeNodes.js";
import { matchProperties } from "./properties.js";
import { isInserted, isRemoved2 } from "./segmentInfos.js";
import {
	JsonSegmentSpecs,
	MergeTreeChunkLegacy,
	serializeAsMinSupportedVersion,
} from "./snapshotChunks.js";

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

/**
 * @internal
 */
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
	private segments: ISegmentPrivate[] | undefined;
	private readonly logger: ITelemetryLoggerExt;
	private readonly chunkSize: number;

	constructor(
		public mergeTree: MergeTree,
		logger: ITelemetryLoggerExt,
		public filename?: string,
		public onCompletion?: () => void,
	) {
		this.logger = createChildLogger({ logger, namespace: "Snapshot" });
		this.chunkSize =
			mergeTree?.options?.mergeTreeSnapshotChunkSize ?? SnapshotLegacy.sizeOfFirstChunk;
	}

	private getSeqLengthSegs(
		allSegments: ISegmentPrivate[],
		approxSequenceLength: number,
		startIndex = 0,
	): MergeTreeChunkLegacy {
		const segs: ISegmentPrivate[] = [];
		let sequenceLength = 0;
		let segCount = 0;
		let segsWithAttribution = 0;
		while (
			sequenceLength < approxSequenceLength &&
			startIndex + segCount < allSegments.length
		) {
			const pseg = allSegments[startIndex + segCount];
			segs.push(pseg);
			if (pseg.attribution) {
				segsWithAttribution++;
			}
			sequenceLength += pseg.cachedLength;
			segCount++;
		}

		assert(
			segsWithAttribution === 0 || segsWithAttribution === segCount,
			0x4bf /* all or no segments should have attribution */,
		);

		const attributionSerializer = this.mergeTree.attributionPolicy?.serializer;
		assert(
			segsWithAttribution === 0 || attributionSerializer !== undefined,
			0x559 /* attribution serializer must be provided when there are segments with attribution. */,
		);
		return {
			version: undefined,
			chunkStartSegmentIndex: startIndex,
			chunkSegmentCount: segCount,
			chunkLengthChars: sequenceLength,
			totalLengthChars: this.header!.segmentsTotalLength,
			totalSegmentCount: allSegments.length,
			chunkSequenceNumber: this.header!.seq,
			segmentTexts: segs.map((seg) => seg.toJSONObject() as JsonSegmentSpecs),
			attribution:
				segsWithAttribution > 0 || this.mergeTree.attributionPolicy?.isAttached
					? attributionSerializer?.serializeAttributionCollections(segs)
					: undefined,
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
		const chunk1 = this.getSeqLengthSegs(this.segments!, this.chunkSize);
		let length: number = chunk1.chunkLengthChars;
		let segments: number = chunk1.chunkSegmentCount;
		const builder = new SummaryTreeBuilder();
		builder.addBlob(
			SnapshotLegacy.header,
			serializeAsMinSupportedVersion(
				SnapshotLegacy.header,
				chunk1,
				this.logger,
				this.mergeTree.options,
				serializer,
				bind,
			),
		);

		if (chunk1.chunkSegmentCount < chunk1.totalSegmentCount!) {
			const chunk2 = this.getSeqLengthSegs(
				this.segments!,
				this.header!.segmentsTotalLength,
				chunk1.chunkSegmentCount,
			);
			length += chunk2.chunkLengthChars;
			segments += chunk2.chunkSegmentCount;
			builder.addBlob(
				SnapshotLegacy.body,
				serializeAsMinSupportedVersion(
					SnapshotLegacy.body,
					chunk2,
					this.logger,
					this.mergeTree.options,
					serializer,
					bind,
				),
			);
		}

		assert(
			length === this.header!.segmentsTotalLength,
			0x05d /* "emit: mismatch in segmentsTotalLength" */,
		);

		assert(
			segments === chunk1.totalSegmentCount,
			0x05e /* "emit: mismatch in totalSegmentCount" */,
		);

		if (catchUpMsgs !== undefined && catchUpMsgs.length > 0) {
			// Messages used to have a "term" property which has since been removed.
			// It is benign so it doesn't really need to be deleted here, but doing so permits snapshot tests
			// to pass with an exact match (and matching the updated definition of ISequencedDocumentMessage).
			for (const message of catchUpMsgs) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				delete (message as any).term;
			}
			builder.addBlob(
				this.mergeTree.options?.catchUpBlobName ?? SnapshotLegacy.catchupOps,
				serializer ? serializer.stringify(catchUpMsgs, bind) : JSON.stringify(catchUpMsgs),
			);
		}

		return builder.getSummaryTree();
	}

	extractSync(): ISegmentPrivate[] {
		const collabWindow = this.mergeTree.collabWindow;
		const seq = (this.seq = collabWindow.minSeq);
		this.header = {
			segmentsTotalLength: this.mergeTree.getLength(
				this.mergeTree.collabWindow.minSeq,
				NonCollabClient,
			),
			seq: this.mergeTree.collabWindow.minSeq,
		};

		let originalSegments = 0;

		const segs: ISegmentPrivate[] = [];
		let prev: ISegmentPrivate | undefined;
		const extractSegment = (segment: ISegmentPrivate): boolean => {
			if (
				isInserted(segment) &&
				timestampUtils.lte(segment.insert, collabWindow.minSeqTime) &&
				// TODO: Audit old code. You changed the behavior here as it previously didn't check for obliterate.
				// That seems like a bug and the changed version here seems more correct, but beware it is different.
				(!isRemoved2(segment) ||
					timestampUtils.gte(segment.removes2[0], collabWindow.minSeqTime))
			) {
				originalSegments += 1;
				const properties =
					segment.propertyManager?.getAtSeq(segment.properties, seq) ?? segment.properties;
				if (prev?.canAppend(segment) && matchProperties(prev.properties, properties)) {
					prev.append(segment.clone());
				} else {
					prev = segment.clone();
					prev.properties = properties;
					segs.push(prev);
				}
			}
			return true;
		};

		this.mergeTree.mapRange(extractSegment, this.seq, NonCollabClient, undefined);

		this.segments = [];
		let totalLength: number = 0;
		segs.map((segment) => {
			totalLength += segment.cachedLength;
			if (segment.properties !== undefined && Object.keys(segment.properties).length === 0) {
				segment.properties = undefined;
			}
			this.segments!.push(segment);
		});

		// To reduce potential spam from this telemetry, we sample only a small
		// percentage of summaries
		if (Math.abs(originalSegments - segs.length) > 500 && Math.random() < 0.005) {
			this.logger.sendTelemetryEvent({
				eventName: "MergeTreeLegacySummarizeSegmentCount",
				originalSegments,
				segmentsAfterCombine: segs.length,
				segmentsLen: this.segments.length,
			});
		}

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
