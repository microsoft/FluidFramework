/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, toUtf8 } from "@fluidframework/common-utils";
import { IDocumentAttributes, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { convertWholeFlatSummaryToSnapshotTreeAndBlobs, IGitManager } from "@fluidframework/server-services-client";
import { IDeliState } from "@fluidframework/server-services-core";
import { CommonProperties, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
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
        const summaryReaderMetric = Lumberjack.newLumberMetric(LumberEventName.SummaryReader);
        if (this.enableWholeSummaryUpload) {
            try {
                const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));
                const wholeFlatSummary = await this.summaryStorage.getSummary(existingRef.object.sha);
                const normalizedSummary = convertWholeFlatSummaryToSnapshotTreeAndBlobs(wholeFlatSummary);

                // Obtain IDs of specific fields from the downloaded summary
                const attributesBlobId = normalizedSummary.snapshotTree.trees[".protocol"].blobs.attributes;
                const scribeBlobId = normalizedSummary.snapshotTree.trees[".serviceProtocol"]?.blobs?.scribe;
                const deliBlobId = normalizedSummary.snapshotTree.trees[".serviceProtocol"]?.blobs?.deli;
                const opsBlobId = normalizedSummary.snapshotTree.trees[".logTail"]?.blobs?.logTail;

                // The initial summary uploaded by Alfred has only .protocol. In other words, .serviceProtocol
                // and .logTail would be both missing in that scenario and we should return the default summary
                // state if that is the case.
                if (!scribeBlobId && !deliBlobId && !opsBlobId) {
                    summaryReaderMetric.success(`Returning default summary when trying to read initial whole summary`);
                    return this.getDefaultSummaryState();
                }

                // Parse specific fields from the downloaded summary
                const attributesContent = normalizedSummary.blobs.get(attributesBlobId);
                const scribeContent = normalizedSummary.blobs.get(scribeBlobId);
                const deliContent = normalizedSummary.blobs.get(deliBlobId);
                const opsContent = normalizedSummary.blobs.get(opsBlobId);

                if (!attributesContent || !scribeContent || !deliContent || !opsContent) {
                    throw new Error("Possible data corruption; whole summary data is missing important information");
                }

                const attributes = JSON.parse(bufferToString(attributesContent, "utf8")) as IDocumentAttributes;
                const scribe = bufferToString(scribeContent, "utf8");
                const deli = JSON.parse(bufferToString(deliContent, "utf8")) as IDeliState;
                const term = deli.term;
                const messages = JSON.parse(bufferToString(opsContent, "utf8")) as ISequencedDocumentMessage[];

                summaryReaderMetric.setProperties({
                    [CommonProperties.minLogtailSequenceNumber]: Math.min(...messages.map(
                        (message) => message.sequenceNumber)),
                    [CommonProperties.maxLogtailSequenceNumber]: Math.max(...messages.map(
                        (message) => message.sequenceNumber)),
                    [CommonProperties.lastSummarySequenceNumber]: deli.sequenceNumber,
                    [CommonProperties.clientCount]: deli.clients?.length,
                });

                summaryReaderMetric.success(`Successfully read whole summary`);

                return {
                    term,
                    protocolHead: attributes.sequenceNumber,
                    scribe,
                    messages,
                    fromSummary: true,
                };
            } catch (error: any) {
                summaryReaderMetric.error(`Returning default summary due to error when reading whole summary`, error);
                return this.getDefaultSummaryState();
            }
        } else {
            try {
                const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));
                const [attributesContent, scribeContent, deliContent, opsContent] = await Promise.all([
                    this.summaryStorage.getContent(existingRef.object.sha, ".protocol/attributes"),
                    this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/scribe")
                        .catch(() => undefined),
                    this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/deli")
                        .catch(() => undefined),
                    this.summaryStorage.getContent(existingRef.object.sha, ".logTail/logTail")
                        .catch(() => undefined),
                ]);

                // The initial summary uploaded by Alfred has only .protocol. In other words, .serviceProtocol
                // and .logTail would be both missing in that scenario and we should return the default summary
                // state if that is the case.
                if (!scribeContent && !deliContent && !opsContent) {
                    summaryReaderMetric.success(`Returning default summary when trying to read initial summary`);
                    return this.getDefaultSummaryState();
                }

                // If only part of .serviceProtocol or .logTail are missing, then it means we have an error.
                if (!scribeContent || !deliContent || !opsContent) {
                    throw new Error("Possible data corruption; summary data is missing important information");
                }

                const attributes = JSON.parse(
                    toUtf8(attributesContent.content, attributesContent.encoding)) as IDocumentAttributes;
                const scribe = toUtf8(scribeContent.content, scribeContent.encoding);
                const deli = JSON.parse(toUtf8(deliContent.content, deliContent.encoding)) as IDeliState;
                const term = deli.term;
                const messages = JSON.parse(
                    toUtf8(opsContent.content, opsContent.encoding)) as ISequencedDocumentMessage[];

                summaryReaderMetric.setProperties({
                    [CommonProperties.minLogtailSequenceNumber]: Math.min(...messages.map(
                        (message) => message.sequenceNumber)),
                    [CommonProperties.maxLogtailSequenceNumber]: Math.max(...messages.map(
                        (message) => message.sequenceNumber)),
                    [CommonProperties.lastSummarySequenceNumber]: deli.sequenceNumber,
                    [CommonProperties.clientCount]: deli.clients?.length,
                });

                summaryReaderMetric.success(`Successfully read summary`);

                return {
                    term,
                    protocolHead: attributes.sequenceNumber,
                    scribe,
                    messages,
                    fromSummary: true,
                };
            } catch (error: any) {
                summaryReaderMetric.error(`Returning default summary due to error when reading summary`, error);
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
