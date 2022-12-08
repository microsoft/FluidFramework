/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert, bufferToString } from "@fluidframework/common-utils";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { Client } from "./client";
import { NonCollabClient, UniversalSequenceNumber } from "./constants";
import { ISegment } from "./mergeTreeNodes";
import { IJSONSegment } from "./ops";
import {
    IJSONSegmentWithMergeInfo,
    hasMergeInfo,
    MergeTreeChunkV1,
} from "./snapshotChunks";
import { SnapshotV1 } from "./snapshotV1";
import { SnapshotLegacy } from "./snapshotlegacy";
import { MergeTree } from "./mergeTree";

export class SnapshotLoader {
    private readonly logger: ITelemetryLogger;

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly client: Client,
        private readonly mergeTree: MergeTree,
        logger: ITelemetryLogger,
        private readonly serializer: IFluidSerializer) {
        this.logger = ChildLogger.create(logger, "SnapshotLoader");
    }

    public async initialize(
        services: IChannelStorageService,
    ): Promise<{ catchupOpsP: Promise<ISequencedDocumentMessage[]>; }> {
        const headerLoadedP =
            services.readBlob(SnapshotLegacy.header).then((header) => {
                assert(!!header, 0x05f /* "Missing blob header on legacy snapshot!" */);
                return this.loadHeader(bufferToString(header, "utf8"));
            });

        const catchupOpsP =
            this.loadBodyAndCatchupOps(headerLoadedP, services);

        catchupOpsP.catch(
            (err) => this.logger.sendErrorEvent({ eventName: "CatchupOpsLoadFailure" }, err));

        await headerLoadedP;

        return { catchupOpsP };
    }

    private async loadBodyAndCatchupOps(
        headerChunkP: Promise<MergeTreeChunkV1>,
        services: IChannelStorageService,
    ): Promise<ISequencedDocumentMessage[]> {
        const blobsP = services.list("");
        const headerChunk = await headerChunkP;

        // TODO we shouldn't need to wait on the body being complete to finish initialization.
        // To fully support this we need to be able to process inbound ops for pending segments.
        await this.loadBody(headerChunk, services);

        const blobs = await blobsP;
        if (blobs.length === headerChunk.headerMetadata!.orderedChunkMetadata.length + 1) {
            headerChunk.headerMetadata!.orderedChunkMetadata.forEach(
                (md) => blobs.splice(blobs.indexOf(md.id), 1));
            assert(blobs.length === 1, 0x060 /* There should be only one blob with catch up ops */);

            // TODO: The 'Snapshot.catchupOps' tree entry is purely for backwards compatibility.
            //       (See https://github.com/microsoft/FluidFramework/issues/84)

            return this.loadCatchupOps(services.readBlob(blobs[0]));
        } else if (blobs.length !== headerChunk.headerMetadata!.orderedChunkMetadata.length) {
            throw new Error("Unexpected blobs in snapshot");
        }
        return [];
    }

    private readonly specToSegment = (spec: IJSONSegment | IJSONSegmentWithMergeInfo) => {
        let seg: ISegment;

        if (hasMergeInfo(spec)) {
            seg = this.client.specToSegment(spec.json);

            // `specToSegment()` initializes `seg` with the LocalClientId.  Overwrite this with
            // the `spec` client (if specified).  Otherwise overwrite with `NonCollabClient`.
            seg.clientId = spec.client !== undefined
                ? this.client.getOrAddShortClientId(spec.client)
                : NonCollabClient;

            seg.seq = spec.seq !== undefined
                ? spec.seq
                : UniversalSequenceNumber;

            if (spec.removedSeq !== undefined) {
                seg.removedSeq = spec.removedSeq;
            }
            // this format had a bug where it didn't store all the overlap clients
            // this is for back compat, so we change the singular id to an array
            // this will only cause problems if there is an overlapping delete
            // spanning the snapshot, which should be rare
            if (spec.removedClient !== undefined) {
                seg.removedClientIds = [this.client.getOrAddShortClientId(spec.removedClient)];
            }
            if (spec.removedClientIds !== undefined) {
                seg.removedClientIds = spec.removedClientIds?.map(
                    (sid) => this.client.getOrAddShortClientId(sid));
            }
        } else {
            seg = this.client.specToSegment(spec);
            seg.seq = UniversalSequenceNumber;

            // `specToSegment()` initializes `seg` with the LocalClientId.  We must overwrite this with
            // `NonCollabClient`.
            seg.clientId = NonCollabClient;
        }

        return seg;
    };

    private loadHeader(header: string): MergeTreeChunkV1 {
        const chunk = SnapshotV1.processChunk(
            SnapshotLegacy.header,
            header,
            this.logger,
            this.mergeTree.options,
            this.serializer);
        const segs = chunk.segments.map(this.specToSegment);
        this.mergeTree.reloadFromSegments(segs);

        if (chunk.headerMetadata === undefined) {
            throw new Error("header metadata not available");
        }
        // If we load a detached container from snapshot, then we don't supply a default clientId
        // because we don't want to start collaboration.
        if (this.runtime.attachState !== AttachState.Detached) {
            // specify a default client id, "snapshot" here as we
            // should enter collaboration/op sending mode if we load
            // a snapshot in any case (summary or attach message)
            // once we get a client id this will be called with that
            // clientId in the connected event
            this.client.startOrUpdateCollaboration(
                this.runtime.clientId ?? "snapshot",

                // TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
                //       (See https://github.com/microsoft/FluidFramework/issues/84)
                /* minSeq: */ chunk.headerMetadata.minSequenceNumber !== undefined
                    ? chunk.headerMetadata.minSequenceNumber
                    : chunk.headerMetadata.sequenceNumber,
                /* currentSeq: */ chunk.headerMetadata.sequenceNumber,
            );
        }

        return chunk;
    }

    private async loadBody(chunk1: MergeTreeChunkV1, services: IChannelStorageService): Promise<void> {
        assert(
            chunk1.length <= chunk1.headerMetadata!.totalLength,
            0x061 /* "Mismatch in totalLength" */);

        assert(
            chunk1.segmentCount <= chunk1.headerMetadata!.totalSegmentCount,
            0x062 /* "Mismatch in totalSegmentCount" */);

        if (chunk1.segmentCount === chunk1.headerMetadata!.totalSegmentCount) {
            return;
        }
        const segs: ISegment[] = [];
        let lengthSofar = chunk1.length;
        for (let chunkIndex = 1; chunkIndex < chunk1.headerMetadata!.orderedChunkMetadata.length; chunkIndex++) {
            const chunk = await SnapshotV1.loadChunk(
                services,
                chunk1.headerMetadata!.orderedChunkMetadata[chunkIndex].id,
                this.logger,
                this.mergeTree.options,
                this.serializer);
            lengthSofar += chunk.length;
            // Deserialize each chunk segment and append it to the end of the MergeTree.
            segs.push(...chunk.segments.map(this.specToSegment));
        }
        assert(
            lengthSofar === chunk1.headerMetadata!.totalLength,
            0x063 /* "Mismatch in totalLength" */);

        assert(
            chunk1.segmentCount + segs.length === chunk1.headerMetadata!.totalSegmentCount,
            0x064 /* "Mismatch in totalSegmentCount" */);

        // Helper to insert segments at the end of the MergeTree.
        const mergeTree = this.mergeTree;
        const append = (segments: ISegment[], cli: number, seq: number) => {
            mergeTree.insertSegments(
                mergeTree.root.cachedLength,
                segments,
                /* refSeq: */ UniversalSequenceNumber,
                cli,
                seq,
                undefined);
        };

        // Helpers to batch-insert segments that are below the min seq
        const batch: ISegment[] = [];
        const flushBatch = () => {
            if (batch.length > 0) { append(batch, NonCollabClient, UniversalSequenceNumber); }
        };

        for (const seg of segs) {
            const cli = seg.clientId;
            const seq = seg.seq;

            // If the segment can be batch inserted, add it to the 'batch' array.  Otherwise, flush
            // any batched segments and then insert the current segment individually.
            if (cli === NonCollabClient && seq === UniversalSequenceNumber) {
                batch.push(seg);
            } else {
                flushBatch();
                append([seg], cli, seq!);
            }
        }

        flushBatch();
    }

    /**
     * If loading from a snapshot, get the catchup messages.
     * @param rawMessages - The messages in original encoding
     * @returns The decoded messages, but handles aren't parsed.  Matches the format that will be passed in
     * SharedObject.processCore.
     */
    private async loadCatchupOps(rawMessages: Promise<ArrayBufferLike>): Promise<ISequencedDocumentMessage[]> {
        return JSON.parse(bufferToString(await rawMessages, "utf8")) as ISequencedDocumentMessage[];
    }
}
