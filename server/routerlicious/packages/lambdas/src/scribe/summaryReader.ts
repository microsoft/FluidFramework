/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, toUtf8 } from "@fluidframework/common-utils";
import { IDocumentAttributes, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { convertWholeFlatSummaryToSnapshotTreeAndBlobs, IGitManager } from "@fluidframework/server-services-client";
import { IDeliState } from "@fluidframework/server-services-core";
import { ILatestSummaryState, ISummaryReader } from "./interfaces";

/**
 * Git specific implementation of ISummaryReader
 */
export class SummaryReader implements ISummaryReader {
    constructor(
        private readonly documentId: string,
        private readonly summaryStorage: IGitManager,
        private readonly enableWholeSummaryUpload: boolean,
    ) {
    }

    /**
    * Reads the most recent version of summary for a document. In case the storage is having trouble processing the
    * request, returns a set of defaults with fromSummary flag set to false.
    */
    public async readLastSummary(): Promise<ILatestSummaryState> {
        if (this.enableWholeSummaryUpload) {
            try {
                const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));
                const wholeFlatSummary = await this.summaryStorage.getSummary(existingRef.object.sha);
                const normalizedSummary = convertWholeFlatSummaryToSnapshotTreeAndBlobs(wholeFlatSummary);

                // Parse specific fields from the downloaded summary
                const attributesBlobId = normalizedSummary.snapshotTree.trees[".protocol"].blobs.attributes;
                const attributesContent = normalizedSummary.blobs[attributesBlobId];
                const scribeBlobId = normalizedSummary.snapshotTree.trees[".serviceProtocol"].blobs.scribe;
                const scribeContent = normalizedSummary.blobs[scribeBlobId];
                const deliBlobId = normalizedSummary.snapshotTree.trees[".serviceProtocol"].blobs.deli;
                const deliContent = normalizedSummary.blobs[deliBlobId];
                const opsBlobId = normalizedSummary.snapshotTree.trees[".logTail"].blobs.logTail;
                const opsContent = normalizedSummary.blobs[opsBlobId];

                const attributes = JSON.parse(bufferToString(attributesContent, "utf8")) as IDocumentAttributes;
                const scribe = bufferToString(scribeContent, "utf8");
                const deli = JSON.parse(bufferToString(deliContent, "utf8")) as IDeliState;
                const term = deli.term;
                const messages = JSON.parse(bufferToString(opsContent, "utf8")) as ISequencedDocumentMessage[];

                return {
                    term,
                    protocolHead: attributes.sequenceNumber,
                    scribe,
                    messages,
                    fromSummary: true,
                };
            } catch {
                return this.getDefaultSummaryState();
            }
        } else {
            try {
                const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));
                const [attributesContent, scribeContent, deliContent, opsContent] = await Promise.all([
                    this.summaryStorage.getContent(existingRef.object.sha, ".protocol/attributes"),
                    this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/scribe"),
                    this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/deli"),
                    this.summaryStorage.getContent(existingRef.object.sha, ".logTail/logTail"),
                ]);
                const attributes = JSON.parse(
                    toUtf8(attributesContent.content, attributesContent.encoding)) as IDocumentAttributes;
                const scribe = toUtf8(scribeContent.content, scribeContent.encoding);
                const deli = JSON.parse(toUtf8(deliContent.content, deliContent.encoding)) as IDeliState;
                const term = deli.term;
                const messages = JSON.parse(
                    toUtf8(opsContent.content, opsContent.encoding)) as ISequencedDocumentMessage[];

                return {
                    term,
                    protocolHead: attributes.sequenceNumber,
                    scribe,
                    messages,
                    fromSummary: true,
                };
            } catch {
                return this.getDefaultSummaryState();
            }
        }
    }

    private getDefaultSummaryState(): ILatestSummaryState {
        return {
            term: 1,
            protocolHead: 0,
            scribe: "",
            messages: [],
            fromSummary: false,
        };
    }
}
