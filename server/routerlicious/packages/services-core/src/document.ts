/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails } from "@fluidframework/gitresources";
import {
	IProtocolState,
	ISummaryTree,
	ICommittedProposal,
} from "@fluidframework/protocol-definitions";
import { IGitCache, ISession } from "@fluidframework/server-services-client";
import { INackMessagesControlMessageContents, NackMessagesType } from "./messages";

/**
 * @internal
 */
export interface IDocumentDetails {
	existing: boolean;
	value: IDocument;
}

/**
 * @internal
 */
export interface IDocumentStaticProperties {
	// Schema version
	version: string;
	createTime: number;
	documentId: string;
	tenantId: string;
	storageName?: string;
	isEphemeralContainer?: boolean;
}

/**
 * @internal
 */
export interface IDocumentStorage {
	// eslint-disable-next-line @rushstack/no-new-null
	getDocument(tenantId: string, documentId: string): Promise<IDocument | null>;

	getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails>;

	getLatestVersion(tenantId: string, documentId: string): Promise<ICommit | null>;

	getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

	getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

	getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: string }>;

	createDocument(
		tenantId: string,
		documentId: string,
		summary: ISummaryTree,
		sequenceNumber: number,
		initialHash: string,
		ordererUrl: string,
		historianUrl: string,
		deltaStreamUrl: string,
		values: [string, ICommittedProposal][],
		enableDiscovery: boolean,
		isEphemeralContainer: boolean,
		messageBrokerId?: string,
	): Promise<IDocumentDetails>;
}

/**
 * @internal
 */
export interface IClientSequenceNumber {
	// Whether or not the client can expire
	canEvict: boolean;
	clientId: string | undefined;
	lastUpdate: number;
	nack: boolean;
	referenceSequenceNumber: number;
	clientSequenceNumber: number;
	scopes: string[];
	serverMetadata?: any;
}

/**
 * @internal
 */
export interface IDeliState {
	// List of connected clients
	clients: IClientSequenceNumber[] | undefined;

	// Durable sequence number at logOffset
	durableSequenceNumber: number;

	// Kafka checkpoint that maps to the below stored data
	logOffset: number;

	// Sequence number at logOffset
	sequenceNumber: number;

	// Signal number for the deli client at logOffset
	signalClientConnectionNumber: number;

	// Rolling hash at sequenceNumber
	expHash1: string;

	// Last sent minimum sequence number
	lastSentMSN: number | undefined;

	// Nack messages state
	nackMessages:
		| [NackMessagesType, INackMessagesControlMessageContents][]
		| INackMessagesControlMessageContents
		| undefined;

	// Checkpoint timestamp in UTC epoch
	checkpointTimestamp: number | undefined;
}

// TODO: We should probably rename this to IScribeState
/**
 * @internal
 */
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

	// Sequence number of the last operation that was part of latest summary
	lastSummarySequenceNumber: number | undefined;

	// Refs of the service summaries generated since the last client generated summary.
	validParentSummaries: string[] | undefined;

	// Is document corrupted?
	isCorrupt: boolean;

	// Last summary sequence number
	protocolHead: number | undefined;

	// Time checkpoint was created
	checkpointTimestamp: number | undefined;
}

/**
 * @alpha
 */
export interface IDocument {
	// Schema version
	version: string;

	createTime: number;

	// Timestamp of the latest document session end
	lastAccessTime?: number;

	documentId: string;

	tenantId: string;

	session: ISession;

	// Scribe state
	scribe: string;

	// Deli state
	deli: string;

	// Timestamp of when this document and related data will be hard deleted.
	// The document is soft deleted if a scheduled deletion timestamp is present.
	scheduledDeletionTime?: string;

	// name of the storage to save the document durable artifacts
	storageName?: string;

	isEphemeralContainer?: boolean;
}

/**
 * @alpha
 */
export interface ICheckpoint {
	_id: string;

	documentId: string;

	tenantId: string;

	scribe: string;

	deli: string;
}
