/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IComponentHandleContext } from "@microsoft/fluid-component-core-interfaces";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { Client } from "./client";
import { NonCollabClient, UniversalSequenceNumber } from "./constants";
import { ISegment, MergeTree } from "./mergeTree";
import { hasMergeInfo, IJSONSegment, IJSONSegmentWithMergeInfo, MergeTreeChunk } from "./ops";
import { Snapshot } from "./snapshot";
import { SnapshotLegacy } from "./snapshotlegacy";

export class SnapshotLoader {

    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly client: Client,
        private readonly mergeTree: MergeTree) { }

    public async initialize(
        branchId: string,
        services: IObjectStorageService): Promise<ISequencedDocumentMessage[]> {

        const headerP = services.read(Snapshot.header);
        // If loading from a snapshot load tardis messages
        // kick off loading in parallel to loading "body" chunk.
        const rawMessages = services.read(SnapshotLegacy.tardis);

        const header = await headerP;
        assert(header);
        // Override branch by default which is derived from document id,
        // as document id isn't stable for spo
        // which leads to branch id being in correct
        const branch = this.runtime.options && this.runtime.options.enableBranching
            ? branchId : this.runtime.documentId;

        const chunk1 = this.loadHeader(header, branch);

        // tslint:disable-next-line: no-suspicious-comment
        // TODO we shouldn't need to wait on the body being complete to finish initialization.
        // To fully support this we need to be able to process inbound ops for pending segments.
        await this.loadBody(chunk1, services);

        // tslint:disable-next-line:no-suspicious-comment
        // TODO: The 'Snapshot.tardis' tree entry is purely for backwards compatibility.
        //       (See https://github.com/microsoft/FluidFramework/issues/84)
        return this.loadTardis(rawMessages, branch);
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
        branchId: string): MergeTreeChunk {

        const chunk = Snapshot.processChunk(
            header,
            this.runtime.IComponentSerializer,
            this.runtime[IComponentHandleContext]);
        const segs = chunk.segmentTexts.map(this.specToSegment);
        this.mergeTree.reloadFromSegments(segs);

        // tslint:disable-next-line: no-suspicious-comment
        // TODO currently only assumes two levels of branching
        const branching = branchId === this.runtime.documentId ? 0 : 1;

        this.client.startCollaboration(
            this.runtime.clientId,
            // tslint:disable-next-line:no-suspicious-comment
            // TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
            //       (See https://github.com/microsoft/FluidFramework/issues/84)
            /* minSeq: */ chunk.chunkMinSequenceNumber !== undefined
                ? chunk.chunkMinSequenceNumber
                : chunk.chunkSequenceNumber,
            /* currentSeq: */ chunk.chunkSequenceNumber,
            branching);

        return chunk;
    }

    private async loadBody(chunk1: MergeTreeChunk, services: IObjectStorageService): Promise<void> {
        this.runtime.logger.shipAssert(
            chunk1.chunkLengthChars <= chunk1.totalLengthChars,
            { eventName: "Mismatch in totalLengthChars" });

        this.runtime.logger.shipAssert(
            chunk1.chunkSegmentCount <= chunk1.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        if (chunk1.chunkSegmentCount === chunk1.totalSegmentCount) {
            return;
        }

        const chunk2 = await Snapshot.loadChunk(
            services,
            Snapshot.body,
            this.runtime.IComponentSerializer,
            this.runtime[IComponentHandleContext]);

        this.runtime.logger.shipAssert(
            chunk1.chunkLengthChars + chunk2.chunkLengthChars === chunk1.totalLengthChars,
            { eventName: "Mismatch in totalLengthChars" });

        this.runtime.logger.shipAssert(
            chunk1.chunkSegmentCount + chunk2.chunkSegmentCount === chunk1.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        // Deserialize each chunk segment and append it to the end of the MergeTree.
        const segs = chunk2.segmentTexts.map(this.specToSegment);

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
     * If loading from a snapshot, get the tardis messages.
     * @param rawMessages - The messages in original encoding
     * @param branchId - The document branch
     * @returns The decoded messages, but handles aren't parsed.  Matches the format that will be passed in
     * SharedObject.processCore.
     */
    private async loadTardis(
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
