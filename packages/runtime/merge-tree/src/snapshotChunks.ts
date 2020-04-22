import {
    IComponentSerializer,
    IComponentHandleContext,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { IJSONSegment } from ".";

export interface VersionedMergeTreeChunk {
    version: undefined | "0to1" | "1";
}

export const headerChunkName = "header";
export const bodyChunkName = "body";
export const tardisChunkName = "tardis";

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
}

export interface MergeTreeHeaderChunkMetadata{
    id: string,
}

export interface MergeTreeHeaderMetadata {
    totalLength: number,
    totalSegmentCount: number,
    orderedChunkMetadata: MergeTreeHeaderChunkMetadata[],
    sequenceNumber: number,
    minSequenceNumber: number,
    hasTardis: boolean,
}

// tslint:disable-next-line:interface-name
export interface MergeTreeChunkV0 extends VersionedMergeTreeChunk, Omit<MergeTreeChunkLegacy, "version"> {
    version: "0to1",
    headerMetadata: MergeTreeHeaderMetadata | undefined;
}

export interface MergeTreeChunkV1 extends VersionedMergeTreeChunk{
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
    serializer?: IComponentSerializer,
    context?: IComponentHandleContext,
    bind?: IComponentHandle) {
    let targetChuck: MergeTreeChunkV0;

    if (chunk.version !== "0to1") {
        logger.send({
            eventName:"MergeTreeChunk:serializeAsMinSupportedVersion",
            category: "generic",
            fromChunkVersion: chunk.version,
            toChunkVersion: "0to1",
        });
    }

    switch (chunk.version) {
        case undefined:
            const chunkLegacy = chunk as MergeTreeChunkLegacy;
            targetChuck = {
                ... chunkLegacy,
                headerMetadata: buildHeaderMetadata(path, chunkLegacy),
            };
            break;

        case "0to1":
            targetChuck = chunk as MergeTreeChunkV0;
            break;

        case "1":
            const chunkV1 = chunk as MergeTreeChunkV1;
            targetChuck = {
                version: "0to1",
                chunkStartSegmentIndex: chunkV1.startIndex,
                chunkLengthChars: chunkV1.length,
                chunkSegmentCount: chunkV1.segmentCount,
                segmentTexts: chunkV1.segments,
                totalLengthChars: chunkV1.headerMetadata?.totalLength,
                totalSegmentCount: chunkV1.headerMetadata?.totalSegmentCount,
                chunkSequenceNumber: chunkV1.headerMetadata?.sequenceNumber,
                chunkMinSequenceNumber: chunkV1.headerMetadata?.minSequenceNumber,
                headerMetadata: path === headerChunkName ? chunkV1.headerMetadata : undefined,
            };
            break;

        default:
            throw new Error(`Unsupported chunk path: ${path} version: ${chunk.version}`);
    }
    return serializer !== undefined ? serializer.stringify(targetChuck, context, bind) : JSON.stringify(targetChuck);
}

export function toLatestVersion(
    path: string,
    chunk: VersionedMergeTreeChunk,
    logger: ITelemetryLogger): MergeTreeChunkV1 {
    if (chunk.version !== "1") {
        logger.send({
            eventName:"MergeTreeChunk:toLatestVersion",
            category: "generic",
            fromChunkVersion: chunk.version,
            toChunkVersion: "1",
        });
    }
    switch (chunk.version) {
        case undefined: {
            const chunkLegacy = chunk as MergeTreeChunkLegacy;
            return {
                version: "1",
                length: chunkLegacy.chunkLengthChars,
                segmentCount: chunkLegacy.chunkSegmentCount,
                headerMetadata: buildHeaderMetadata(path, chunkLegacy),
                segments: chunkLegacy.segmentTexts,
                startIndex: chunkLegacy.chunkStartSegmentIndex,
            };
        }

        case "0to1": {
            const chunkV0 = chunk as MergeTreeChunkV0;
            return {
                version: "1",
                length: chunkV0.chunkLengthChars,
                segmentCount: chunkV0.chunkSegmentCount,
                headerMetadata: chunkV0.headerMetadata,
                segments: chunkV0.segmentTexts,
                startIndex: chunkV0.chunkStartSegmentIndex,
            };
        }

        case "1":
            return chunk as MergeTreeChunkV1;

        default:
            throw new Error(`Unsupported chunk path: ${path} version: ${chunk.version}`);
    }
}

function buildHeaderMetadata(
    path: string, chunk: MergeTreeChunkLegacy | MergeTreeChunkV0): MergeTreeHeaderMetadata | undefined {
    if (path === headerChunkName) {
        const maybe0to1 = chunk as MergeTreeChunkV0;
        if (maybe0to1?.version !== undefined && maybe0to1.headerMetadata !== undefined) {
            return maybe0to1.headerMetadata;
        }
        const chunkIds: MergeTreeHeaderChunkMetadata[] = [ { id: headerChunkName } ];
        if (chunk.chunkLengthChars < chunk.totalLengthChars) {
            chunkIds.push({ id: bodyChunkName });
        }
        return {
            orderedChunkMetadata: chunkIds,
            minSequenceNumber: chunk.chunkMinSequenceNumber,
            sequenceNumber: chunk.chunkSequenceNumber,
            totalLength: chunk.totalLengthChars,
            totalSegmentCount: chunk.totalSegmentCount,
            hasTardis: true,
        };
    }
    return undefined;
}
