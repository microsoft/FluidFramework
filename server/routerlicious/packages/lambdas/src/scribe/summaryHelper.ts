/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@microsoft/fluid-protocol-base";
import { IDocumentAttributes, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IGitManager } from "@microsoft/fluid-server-services-client";
import { IScribe } from "@microsoft/fluid-server-services-core";
import { IDeliCheckpoint } from "../deli";

export interface ILatestSummaryState {
    term: number;
    protocolHead: number;
    scribe: string;
    messages: ISequencedDocumentMessage[];
    fromSummary: boolean;
}

export async function fetchLatestSummaryState(
    gitManager: IGitManager,
    documentId: string): Promise<ILatestSummaryState> {
    const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
    if (!existingRef) {
        return {
            term: 1,
            protocolHead: 0,
            scribe: "",
            messages: [],
            fromSummary: false,
        };
    }

    try {
        const [attributesContent, scribeContent, deliContent, opsContent] = await Promise.all([
            gitManager.getContent(existingRef.object.sha, ".protocol/attributes"),
            gitManager.getContent(existingRef.object.sha, ".serviceProtocol/scribe"),
            gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli"),
            gitManager.getContent(existingRef.object.sha, ".logTail/logTail"),
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
        throw Error("Summary cannot be fetched");
    }
}

export const initializeProtocol = (documentId: string, scribe: IScribe, term: number): ProtocolOpHandler => {
    return new ProtocolOpHandler(
        documentId,
        scribe.protocolState.minimumSequenceNumber,
        scribe.protocolState.sequenceNumber,
        term,
        scribe.protocolState.members,
        scribe.protocolState.proposals,
        scribe.protocolState.values,
        () => -1,
        () => { return; },
    );
};
