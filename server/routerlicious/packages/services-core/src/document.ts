/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRangeTrackerSnapshot } from "@fluidframework/common-utils";
import { ICommit, ICommitDetails } from "@fluidframework/gitresources";
import { IProtocolState, ISummaryTree, ICommittedProposal } from "@fluidframework/protocol-definitions";
import { IGitCache } from "@fluidframework/server-services-client";
import { INackMessagesControlMessageContents } from "./messages";

export interface IDocumentDetails {
    existing: boolean;
    value: IDocument;
}

export interface IDocumentStorage {
    getDocument(tenantId: string, documentId: string): Promise<any>;

    getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails>;

    getLatestVersion(tenantId: string, documentId: string): Promise<ICommit>;

    getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

    getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

    getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }>;

    createDocument(
        tenantId: string,
        documentId: string,
        summary: ISummaryTree,
        sequenceNumber: number,
        term: number,
        values: [string, ICommittedProposal][]): Promise<IDocumentDetails>;
}

export interface IClientSequenceNumber {
    // Whether or not the client can expire
    canEvict: boolean;
    clientId: string | undefined;
    lastUpdate: number;
    nack: boolean;
    referenceSequenceNumber: number;
    clientSequenceNumber: number;
    scopes: string[];
}

export interface IDeliState {
    // Branch related mapping
    branchMap: IRangeTrackerSnapshot | undefined;

    // List of connected clients
    clients: IClientSequenceNumber[] | undefined;

    // Durable sequence number at logOffset
    durableSequenceNumber: number;

    // Kafka checkpoint that maps to the below stored data
    logOffset: number;

    // Sequence number at logOffset
    sequenceNumber: number;

    // Epoch of stream provider
    epoch: number;

    // Term at logOffset
    term: number;

    // Last sent minimum sequence number
    lastSentMSN: number | undefined;

    // Nack messages state
    nackMessages: INackMessagesControlMessageContents | undefined;
}

// TODO: We should probably rename this to IScribeState
export interface IScribe {
    // Kafka checkpoint that maps to the below stored data
    logOffset: number;

    // Min sequence number at logOffset
    minimumSequenceNumber: number;

    // Sequence number at logOffset
    sequenceNumber: number;

    // Stored protocol state within the window. This is either the state at the MSN or the state at the
    // sequence number of the head summary.
    protocolState: IProtocolState;

    // Ref of the last client generated summary
    lastClientSummaryHead: string | undefined;
}

export interface IDocument {

    // Schema version
    version: string;

    createTime: number;

    documentId: string;

    tenantId: string;

    // Scribe state
    scribe: string;

    // Deli state
    deli: string;
}
