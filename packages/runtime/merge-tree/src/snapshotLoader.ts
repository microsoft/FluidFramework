/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage } from "@prague/protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";
import * as assert from "assert";
import { Client } from "./client";
import { MergeTree, NonCollabClient, UniversalSequenceNumber } from "./mergeTree";
import { MergeTreeChunk } from "./ops";
import { Snapshot } from "./snapshot";

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
        const rawMessages = services.read(Snapshot.tardis);

        const header = await headerP;
        assert(header);
        // override branch by default which is derived from document id,
        // as document id isn't stable for spo
        // which leads to branch id being in correct
        // tslint:disable-next-line: no-unsafe-any
        const branch = this.runtime.options && this.runtime.options.enableBranching
            ? branchId : this.runtime.documentId;

        const chunk1 = this.loadHeader(header, branch);

        // tslint:disable-next-line: no-suspicious-comment
        // TODO we shouldn't need to wait on the body being complete to finish initialization.
        // To fully support this we need to be able to process inbound ops for pending segments.
        // And storing 'blue' segments rather than using Tardis'd ops may be of help.
        await this.loadBody(chunk1, services);
        return this.loadTardis(rawMessages, branch);
    }

    private loadHeader(
        header: string,
        branchId: string): MergeTreeChunk {

        const chunk = Snapshot.processChunk(header);
        const segs = chunk.segmentTexts.map((spec) => {
            const seg = this.client.specToSegment(spec);
            seg.seq = UniversalSequenceNumber;
            return seg;
        });
        this.mergeTree.reloadFromSegments(segs);

        // tslint:disable-next-line: no-suspicious-comment
        // TODO currently only assumes two levels of branching
        const branching = branchId === this.runtime.documentId ? 0 : 1;

        this.client.startCollaboration(
            this.runtime.clientId, chunk.chunkSequenceNumber, branching);

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

        const chunk2 = await Snapshot.loadChunk(services, Snapshot.body);

        this.runtime.logger.shipAssert(
            chunk1.chunkLengthChars + chunk2.chunkLengthChars === chunk1.totalLengthChars,
            { eventName: "Mismatch in totalLengthChars" });

        this.runtime.logger.shipAssert(
            chunk1.chunkSegmentCount + chunk2.chunkSegmentCount === chunk1.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        // Deserialize each chunk segment and append it to the end of the MergeTree.
        this.mergeTree.insertSegments(
            this.mergeTree.root.cachedLength,
            chunk2.segmentTexts.map((s) => this.client.specToSegment(s)),
            UniversalSequenceNumber,
            NonCollabClient,
            UniversalSequenceNumber,
            undefined);
   }

    // If loading from a snapshot load tardis messages
    private async loadTardis(
        rawMessages: Promise<string>,
        branchId: string,
    ): Promise<ISequencedDocumentMessage[]> {
        const messages = JSON.parse(Buffer.from(await rawMessages, "base64").toString()) as ISequencedDocumentMessage[];
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
