/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { Client } from "./client";
import { NonCollabClient, UniversalSequenceNumber } from "./constants";
import { ISegment, MergeTree } from "./mergeTree";
import { IJSONSegment } from "./ops";
import {
    IJSONSegmentWithMergeInfo,
    hasMergeInfo,
    MergeTreeChunkV1,
} from "./snapshotChunks";
import { SnapshotV1 } from "./snapshotV1";
import { SnapshotLegacy } from "./snapshotlegacy";

export class SnapshotLoader {
    private readonly logger: ITelemetryLogger;

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly client: Client,
        private readonly mergeTree: MergeTree,
        logger: ITelemetryLogger) {
        this.logger = ChildLogger.create(logger, "SnapshotLoader");
    }

    public async initialize(
        branchId: string,
        services: IChannelStorageService,
    ): Promise<{ catchupOpsP: Promise<ISequencedDocumentMessage[]> }> {
        // Override branch by default which is derived from document id,
        // as document id isn't stable for spo
        // which leads to branch id being in correct
        const branch = this.runtime.options && this.runtime.options.enableBranching
            ? branchId : this.runtime.documentId;
        const headerLoadedP =
            services.read(SnapshotLegacy.header).then((header) => {
                assert(header);
                return this.loadHeader(header, branch);
            });

        const catchupOpsP =
            this.loadBodyAndCatchupOps(headerLoadedP, services, branch);

        await headerLoadedP;

        return { catchupOpsP };
    }

    private async loadBodyAndCatchupOps(
        headerChunkP: Promise<MergeTreeChunkV1>,
        services: IChannelStorageService,
        branch: string,
    ): Promise<ISequencedDocumentMessage[]> {
        const blobsP = services.list("");
        const headerChunk = await headerChunkP;

        // TODO we shouldn't need to wait on the body being complete to finish initialization.
        // To fully support this we need to be able to process inbound ops for pending segments.
        await this.loadBody(headerChunk, services);

        const blobs = await blobsP;
        if (blobs.length === headerChunk.headerMetadata.orderedChunkMetadata.length + 1) {
            headerChunk.headerMetadata.orderedChunkMetadata.forEach(
                (md) => blobs.splice(blobs.indexOf(md.id), 1));
            assert(blobs.length === 1, `There should be only one blob with catch up ops: ${blobs.length}`);

            // TODO: The 'Snapshot.catchupOps' tree entry is purely for backwards compatibility.
            //       (See https://github.com/microsoft/FluidFramework/issues/84)
            return this.loadCatchupOps(services.read(blobs[0]), branch);
        } else if (blobs.length !== headerChunk.headerMetadata.orderedChunkMetadata.length) {
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
            if (spec.removedClient !== undefined) {
                seg.removedClientId = this.client.getOrAddShortClientId(spec.removedClient);
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

    private loadHeader(
        header: string,
        branchId: string): MergeTreeChunkV1 {
        const chunk = SnapshotV1.processChunk(
            SnapshotLegacy.header,
            header,
            this.logger,
            this.mergeTree.options,
            this.runtime.IFluidSerializer,
            this.runtime.IFluidHandleContext);
        const segs = chunk.segments.map(this.specToSegment);
        this.mergeTree.reloadFromSegments(segs);
        // TODO currently only assumes two levels of branching
        const branching = branchId === this.runtime.documentId ? 0 : 1;

        if (chunk.headerMetadata === undefined) {
            throw new Error("header metadata not available");
        }
        // specify a default client id, "snapshot" here as we
        // should enter collaboration/op sending mode if we load
        // a snapshot in any case (summary or attach message)
        // once we get a client id this will be called with that
        // clientId in the connected event
        // TODO: this won't support rehydrating a detached container
        // we need to think more holistically about the dds state machine
        // now that we differentiate attached vs local
        this.client.startOrUpdateCollaboration(
            this.runtime.clientId ?? "snapshot",

            // TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
            //       (See https://github.com/microsoft/FluidFramework/issues/84)
            /* minSeq: */ chunk.headerMetadata.minSequenceNumber !== undefined
                ? chunk.headerMetadata.minSequenceNumber
                : chunk.headerMetadata.sequenceNumber,
            /* currentSeq: */ chunk.headerMetadata.sequenceNumber,
            branching);

        return chunk;
    }

    private async loadBody(chunk1: MergeTreeChunkV1, services: IChannelStorageService): Promise<void> {
        this.runtime.logger.shipAssert(
            chunk1.length <= chunk1.headerMetadata.totalLength,
            { eventName: "Mismatch in totalLength" });

        this.runtime.logger.shipAssert(
            chunk1.segmentCount <= chunk1.headerMetadata.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        if (chunk1.segmentCount === chunk1.headerMetadata.totalSegmentCount) {
            return;
        }
        const segs: ISegment[] = [];
        let lengthSofar = chunk1.length;
        for (let chunkIndex = 1; chunkIndex < chunk1.headerMetadata.orderedChunkMetadata.length; chunkIndex++) {
            const chunk = await SnapshotV1.loadChunk(
                services,
                chunk1.headerMetadata.orderedChunkMetadata[chunkIndex].id,
                this.logger,
                this.mergeTree.options,
                this.runtime.IFluidSerializer,
                this.runtime.IFluidHandleContext);
            lengthSofar += chunk.length;
            // Deserialize each chunk segment and append it to the end of the MergeTree.
            segs.push(...chunk.segments.map(this.specToSegment));
        }
        this.runtime.logger.shipAssert(
            lengthSofar === chunk1.headerMetadata.totalLength,
            { eventName: "Mismatch in totalLength" });

        this.runtime.logger.shipAssert(
            chunk1.segmentCount + segs.length === chunk1.headerMetadata.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

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
                append([seg], cli, seq);
            }
        }

        flushBatch();
    }

    /**
     * If loading from a snapshot, get the catchup messages.
     * @param rawMessages - The messages in original encoding
     * @param branchId - The document branch
     * @returns The decoded messages, but handles aren't parsed.  Matches the format that will be passed in
     * SharedObject.processCore.
     */
    private async loadCatchupOps(
        rawMessages: Promise<string>,
        branchId: string,
    ): Promise<ISequencedDocumentMessage[]> {
        const utf8 = fromBase64ToUtf8(await rawMessages);
        const messages = JSON.parse(utf8) as ISequencedDocumentMessage[];
        if (branchId !== this.runtime.documentId) {
            for (const message of messages) {
                // Append branch information when transforming for the case of messages stashed with the snapshot
                message.origin = {
                    id: branchId,
                    minimumSequenceNumber: message.minimumSequenceNumber,
                    sequenceNumber: message.sequenceNumber,
                };
            }
        }

        return messages;
    }
}
