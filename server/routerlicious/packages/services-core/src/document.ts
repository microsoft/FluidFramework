/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRangeTrackerSnapshot } from "@fluidframework/common-utils";
import { ICommit, ICommitDetails } from "@fluidframework/gitresources";
import { IProtocolState, ISummaryTree, ICommittedProposal } from "@fluidframework/protocol-definitions";
import { IGitCache } from "@fluidframework/server-services-client";

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

    getForks(tenantId: string, documentId: string): Promise<string[]>;

    createFork(tenantId: string, id: string): Promise<string>;

    createDocument(
        tenantId: string,
        documentId: string,
        summary: ISummaryTree,
        sequenceNumber: number,
        term: number,
        values: [string, ICommittedProposal][]): Promise<IDocumentDetails>;
}

export interface IFork {
    // The id of the fork
    documentId: string;

    // Tenant for the fork
    tenantId: string;

    // The sequence number where the fork originated
    sequenceNumber: number;

    // The last forwarded sequence number
    lastForwardedSequenceNumber: number;
}

export interface IClientSequenceNumber {
    // Whether or not the client can expire
    canEvict: boolean;
    clientId: string;
    lastUpdate: number;
    nack: boolean;
    referenceSequenceNumber: number;
    clientSequenceNumber: number;
    scopes: string[];
}

export interface IDeliState {
    // Branch related mapping
    branchMap: IRangeTrackerSnapshot;

    // List of connected clients
    clients: IClientSequenceNumber[];

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
    lastClientSummaryHead: string;
}

export interface IDocument {

    // Schema version
    version: string;

    createTime: number;

    documentId: string;

    tenantId: string;

    forks: IFork[];

    /**
     * Parent references the point from which the document was branched
     */
    parent: {
        documentId: string,

        sequenceNumber: number,

        tenantId: string;

        minimumSequenceNumber: number;
    };

    // Scribe state
    scribe: string;

    // Deli state
    deli: string;
}
