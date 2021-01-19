/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IFluidSerializer,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PropertySet } from "./properties";
import { SnapshotLegacy } from "./snapshotlegacy";
import { IJSONSegment } from "./ops";

export interface VersionedMergeTreeChunk {
    version: undefined | "1";
}

export type JsonSegmentSpecs = IJSONSegment | IJSONSegmentWithMergeInfo;

export interface MergeTreeChunkLegacy extends VersionedMergeTreeChunk {
    version: undefined;
    chunkStartSegmentIndex: number,
    chunkSegmentCount: number;
    chunkLengthChars: number;
    totalLengthChars: number;
    totalSegmentCount: number;
    chunkSequenceNumber: number;
    chunkMinSequenceNumber?: number;
    segmentTexts: JsonSegmentSpecs[];
    headerMetadata?: MergeTreeHeaderMetadata;
}

export interface MergeTreeHeaderChunkMetadata {
    id: string,
}

export interface MergeTreeHeaderMetadata {
    totalLength: number,
    totalSegmentCount: number,
    orderedChunkMetadata: MergeTreeHeaderChunkMetadata[],
    sequenceNumber: number,
    minSequenceNumber: number,
}

export interface MergeTreeChunkV1 extends VersionedMergeTreeChunk {
    version: "1",
    startIndex: number;
    segmentCount: number;
    length: number;
    segments: JsonSegmentSpecs[];
    headerMetadata: MergeTreeHeaderMetadata | undefined;
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

export function serializeAsMinSupportedVersion(
    path: string,
    chunk: VersionedMergeTreeChunk,
    logger: ITelemetryLogger,
    options: PropertySet | undefined,
    serializer: IFluidSerializer,
    bind?: IFluidHandle) {
    let targetChuck: MergeTreeChunkLegacy;

    if (chunk.version !== undefined) {
        logger.send({
            eventName: "MergeTreeChunk:serializeAsMinSupportedVersion",
            category: "generic",
            fromChunkVersion: chunk.version,
            toChunkVersion: undefined,
        });
    }

    switch (chunk.version) {
        case undefined:
            targetChuck = chunk as MergeTreeChunkLegacy;
            targetChuck.headerMetadata = buildHeaderMetadataForLegecyChunk(path, targetChuck, options);
            break;

        case "1":
            const chunkV1 = chunk as MergeTreeChunkV1;
            const headerMetadata = path === SnapshotLegacy.header ? chunkV1.headerMetadata : undefined;
            targetChuck = {
                version: undefined,
                chunkStartSegmentIndex: chunkV1.startIndex,
                chunkLengthChars: chunkV1.length,
                chunkSegmentCount: chunkV1.segmentCount,
                segmentTexts: chunkV1.segments,
                totalLengthChars: headerMetadata?.totalLength,
                totalSegmentCount: headerMetadata?.totalSegmentCount,
                chunkSequenceNumber: headerMetadata?.sequenceNumber,
                chunkMinSequenceNumber: headerMetadata?.minSequenceNumber,
                headerMetadata,
            };
            break;

        default:
            throw new Error(`Unsupported chunk path: ${path} version: ${chunk.version}`);
    }
    return serializer.stringify(targetChuck, bind);
}

export function serializeAsMaxSupportedVersion(
    path: string,
    chunk: VersionedMergeTreeChunk,
    logger: ITelemetryLogger,
    options: PropertySet | undefined,
    serializer: IFluidSerializer,
    bind?: IFluidHandle) {
    const targetChuck = toLatestVersion(path, chunk, logger, options);
    return serializer.stringify(targetChuck, bind);
}

export function toLatestVersion(
    path: string,
    chunk: VersionedMergeTreeChunk,
    logger: ITelemetryLogger,
    options: PropertySet | undefined): MergeTreeChunkV1 {
    switch (chunk.version) {
        case undefined: {
            const chunkLegacy = chunk as MergeTreeChunkLegacy;
            return {
                version: "1",
                length: chunkLegacy.chunkLengthChars,
                segmentCount: chunkLegacy.chunkSegmentCount,
                headerMetadata: buildHeaderMetadataForLegecyChunk(path, chunkLegacy, options),
                segments: chunkLegacy.segmentTexts,
                startIndex: chunkLegacy.chunkStartSegmentIndex,
            };
        }
        case "1":
            return chunk as MergeTreeChunkV1;

        default:
            throw new Error(`Unsupported chunk path: ${path} version: ${chunk.version}`);
    }
}

function buildHeaderMetadataForLegecyChunk(
    path: string, chunk: MergeTreeChunkLegacy, options: PropertySet | undefined): MergeTreeHeaderMetadata | undefined {
    if (path === SnapshotLegacy.header) {
        if (chunk.headerMetadata !== undefined) {
            return chunk.headerMetadata;
        }
        const chunkIds: MergeTreeHeaderChunkMetadata[] = [{ id: SnapshotLegacy.header }];
        if (chunk.chunkLengthChars < chunk.totalLengthChars) {
            chunkIds.push({ id: SnapshotLegacy.body });
        }
        return {
            orderedChunkMetadata: chunkIds,
            minSequenceNumber: chunk.chunkMinSequenceNumber,
            sequenceNumber: chunk.chunkSequenceNumber,
            totalLength: chunk.totalLengthChars,
            totalSegmentCount: chunk.totalSegmentCount,
        };
    }
    return undefined;
}
