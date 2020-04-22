import { Snapshot } from "./snapshot";
import { IJSONSegment } from ".";

export interface VersionedMergeTreeChunk {
    version: undefined | "0" | "1";
}

export type MergeTreeChunkV0SegmentSpec = IJSONSegment | IJSONSegmentWithMergeInfo;

// tslint:disable-next-line:interface-name
export interface MergeTreeChunkV0 extends VersionedMergeTreeChunk {
    version: "0",
    chunkStartSegmentIndex: number;
    chunkSegmentCount: number;
    // Back-compat name: change to chunkSequenceLength
    chunkLengthChars: number;
    // Back-compat name: change to totalSequenceLength
    totalLengthChars: number;
    totalSegmentCount: number;
    chunkSequenceNumber: number;
    chunkMinSequenceNumber?: number;
    // Back-compat name: change to segments
    segmentTexts: (MergeTreeChunkV0SegmentSpec)[];
}

export interface MergeTreeHeaderMetadata{
    totalSequenceLength: number,
    chunkIds: string[],
    sequenceNumber: number,
    minSequenceNumber: number,
}

export interface MergeTreeChunkV1 extends VersionedMergeTreeChunk{
    version: "1",
    chunkStartSegmentIndex: number;
    chunkSegmentCount: number;
    chunkLength: number;
    segments: IJSONSegmentWithMergeInfo[];
    headerMetadata?: MergeTreeHeaderMetadata;
}

/**
 * Used during snapshotting to record the metadata required to merge segments above the MSN
 * to the raw output of `ISegment.toJSONObject()`.  (Note that IJSONSegment may be a raw
 * string or array, which is why this interface wraps the original IJSONSegment instead of
 * extending it.)
 */
export interface IJSONSegmentWithMergeInfo {
    json: IJSONSegment;
    client?: string;
    seq?: number;
    removedClient?: string;
    removedSeq?: number;
}

/**
 * Returns true if the given 'spec' is an IJSONSegmentWithMergeInfo.
 */
export function hasMergeInfo(spec: IJSONSegment | IJSONSegmentWithMergeInfo): spec is IJSONSegmentWithMergeInfo {
    return !!spec && typeof spec === "object" && "json" in spec;
}

export function toLatestVersion(path: string, chunk: MergeTreeChunkV0 | MergeTreeChunkV1): MergeTreeChunkV1 {
    switch (chunk.version) {
        case undefined:
        case "0":
            let headerMetadata: MergeTreeHeaderMetadata;
            if (path === Snapshot.header) {
                headerMetadata = {
                    chunkIds: [Snapshot.header],
                    minSequenceNumber: chunk.chunkMinSequenceNumber,
                    sequenceNumber: chunk.chunkSequenceNumber,
                    totalSequenceLength: chunk.totalLengthChars,
                };
            }
            return {
                version: "1",
                chunkLength: chunk.chunkLengthChars,
                chunkSegmentCount: chunk.chunkSegmentCount,
                chunkStartSegmentIndex: chunk.chunkStartSegmentIndex,
                headerMetadata,
                segments: chunk.segmentTexts.map<IJSONSegmentWithMergeInfo>(
                    (s)=> hasMergeInfo(s) ? s : { json:s }),
            };

        case "1":
            return chunk;

        default:
            const unknownChunk = chunk as VersionedMergeTreeChunk;
            throw new Error(`Unsupported chunk path: ${path} version: ${unknownChunk.version}`);
    }
}
