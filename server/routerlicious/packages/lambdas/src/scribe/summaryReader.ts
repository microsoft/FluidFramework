/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import { IDeliCheckpoint } from "../deli";
import { ILatestSummaryState, ISummaryReader } from "./interfaces";

/**
 * Git specific implementation of ISummaryReader
 */
export class SummaryReader implements ISummaryReader {
    constructor(
        private readonly documentId: string,
        private readonly summaryStorage: IGitManager,
    ) {
    }

    /**
    * Reads the most recent version of summary for a document. In case the storage is having trouble processing the
    * request, returns a set of defaults with fromSummary flag set to false.
    */
    public async readLastSummary(): Promise<ILatestSummaryState> {
        try {
            const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));
            const [attributesContent, scribeContent, deliContent, opsContent] = await Promise.all([
                this.summaryStorage.getContent(existingRef.object.sha, ".protocol/attributes"),
                this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/scribe"),
                this.summaryStorage.getContent(existingRef.object.sha, ".serviceProtocol/deli"),
                this.summaryStorage.getContent(existingRef.object.sha, ".logTail/logTail"),
            ]);
            const attributes =
                JSON.parse(Buffer.from(attributesContent.content, attributesContent.encoding)
                    .toString()) as IDocumentAttributes;
            const scribe = Buffer.from(scribeContent.content, scribeContent.encoding).toString();
            const deli = JSON.parse(
                Buffer.from(deliContent.content, deliContent.encoding).toString()) as IDeliCheckpoint;
            const term = deli.term;
            const messages = JSON.parse(
                Buffer.from(opsContent.content, opsContent.encoding).toString()) as ISequencedDocumentMessage[];

            return {
                term,
                protocolHead: attributes.sequenceNumber,
                scribe,
                messages,
                fromSummary: true,
            };
        } catch (exception) {
            return {
                term: 1,
                protocolHead: 0,
                scribe: "",
                messages: [],
                fromSummary: false,
            };
        }
    }
}
