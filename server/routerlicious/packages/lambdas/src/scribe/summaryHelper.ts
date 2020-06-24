/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IDocumentAttributes, ISequencedDocumentMessage, IProtocolState } from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
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

export const initializeProtocol = (
    documentId: string,
    protocolState: IProtocolState,
    term: number,
): ProtocolOpHandler => new ProtocolOpHandler(
    documentId,
    protocolState.minimumSequenceNumber,
    protocolState.sequenceNumber,
    term,
    protocolState.members,
    protocolState.proposals,
    protocolState.values,
    () => -1,
    () => { return; },
);
