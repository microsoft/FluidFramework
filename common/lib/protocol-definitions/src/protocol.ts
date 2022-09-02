/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum MessageType {
    // Empty operation message. Used to send an updated reference sequence number.
    // Relay service is free to coalesce these messages or fully drop them, if
    // another op was used to update MSN to a number equal or higher than referenced
    // sequence number in Noop.
    NoOp = "noop",

    // System message sent to indicate a new client has joined the collaboration
    ClientJoin = "join",

    // System message sent to indicate a client has left the collaboration
    ClientLeave = "leave",

    // Proposes a new consensus value
    Propose = "propose",

    // Message used to reject a pending proposal
    Reject = "reject",

    // Summary op
    Summarize = "summarize",

    // Summary op written
    SummaryAck = "summaryAck",

    // Summary op write failure
    SummaryNack = "summaryNack",

    // Channel operation.
    Operation = "op",

    // Message to indicate the need of a remote agent for a document.
    RemoteHelp = "remoteHelp",

    // Message to indicate that no active clients are present.
    NoClient = "noClient",

    // Message to indicate successful round trip.
    RoundTrip = "tripComplete",

    // Service specific control messages that are never sequenced.
    Control = "control",
}

/**
 * Messages to track latency trace
 */
export interface ITrace {
    // Service generating the trace.
    service: string;

    // Denotes receiving/sending.
    action: string;

    // Floating point time in milliseconds with up to nanosecond precision
    timestamp: number;
}

export interface INack {
    // The operation that was just nacked
    operation: IDocumentMessage | undefined;

    // The sequence number the client needs to catch up to before retrying
    sequenceNumber: number;

    // Detail info about the nack.
    content: INackContent;
}

/**
 * Document specific message
 */
export interface IDocumentMessage {
    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of document message being sent
    type: string;

    // The contents of the message
    contents: any;

    // App provided metadata about the operation
    metadata?: any;

    // Server provided metadata about the operation
    serverMetadata?: any;

    // Traces related to the packet.
    traces?: ITrace[];
}

/**
 * Document Message with optional system level data field.
 */
export interface IDocumentSystemMessage extends IDocumentMessage {
    data: string;
}

/**
 * Branch origin information
 */
export interface IBranchOrigin {
    // Origin branch of the message
    id: string;

    // Sequence number for the message in branch id
    sequenceNumber: number;

    // Min sequence number for the message in branch id
    minimumSequenceNumber: number;
}

/**
 * Sequenced message for a distributed document
 */
export interface ISequencedDocumentMessage {
    // The client ID that submitted the delta
    clientId: string;

    // The sequenced identifier
    sequenceNumber: number;

    // The term identifier
    term: number | undefined;

    // The minimum sequence number for all connected clients
    minimumSequenceNumber: number;

    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of operation
    type: string;

    // The contents of the message
    contents: any;

    // App provided metadata about the operation
    metadata?: any;

    // Server provided metadata about the operation
    serverMetadata?: any;

    // Origin branch information for the message. Can be marked undefined if the current
    // message is also the origin.
    origin?: IBranchOrigin;

    // Traces related to the packet.
    traces?: ITrace[];

    // Timestamp when the server ticketed the message
    timestamp: number;

    /**
     * Experimental field for storing the rolling hash at sequence number.
     * @alpha
     */
    expHash1?: string;
}

export interface ISequencedDocumentSystemMessage extends ISequencedDocumentMessage {
    data: string;
}

export interface ISequencedDocumentAugmentedMessage extends ISequencedDocumentMessage {
    additionalContent: string;
}

export interface ISignalMessage {
    // TODO: Update this to use undefined instead of null.
    // eslint-disable-next-line @rushstack/no-new-null
    clientId: string | null;

    content: any;

    /**
     * Counts the number of signals sent by the client
     */
    clientConnectionNumber?: number;

    /**
     * Sequence number that indicates when the signal was created in relation to the delta stream
     */
    referenceSequenceNumber?: number;
}

export interface IUploadedSummaryDetails {
    // Indicates whether the uploaded summary contains ".protocol" tree
    includesProtocolTree?: boolean;
}

export interface ISummaryContent {
    // Handle reference to the summary data
    handle: string;

    // Message included as part of the summary
    message: string;

    // Handles to parent summaries of the proposed new summary
    parents: string[];

    // Handle to the current latest summary stored by the service
    head: string;

    // Details of the uploaded summary
    details?: IUploadedSummaryDetails;

    // TODO - need an epoch/reload bit to indicate to clients that the summary has changed and requires a reload
    // This could be encoded in the summary itself as well but then would require the client to download it to check
}

/**
 * General errors returned from the server.
 * May want to add error code or something similar in the future.
 */
export interface IServerError {
    /**
     * Message describing the server error.
     */
    errorMessage: string;
}

/**
 * Data about the original proposed summary op.
 */
export interface ISummaryProposal {
    /**
     * Actual sequence number of the summary op proposal.
     */
    summarySequenceNumber: number;
}

/**
 * Contents of summary ack expected from the server.
 */
export interface ISummaryAck {
    /**
     * Handle of the complete summary.
     */
    handle: string;

    /**
     * Information about the proposed summary op.
     */
    summaryProposal: ISummaryProposal;
}

/**
 * Contents of summary nack expected from the server.
 */
export interface ISummaryNack {
    /**
     * Information about the proposed summary op.
     */
    summaryProposal: ISummaryProposal;

    /**
     * An error code number that represents the error. It will be a valid HTTP error code.
     * 403 errors are non retryable.
     * 400 errors are always immediately retriable.
     * 429 errors are retriable or non retriable (depends on type field).
     */
    code?: number;

    /**
     * A message about the error for debugging/logging/telemetry purposes
     */
    message?: string;

    /**
     * Optional Retry-After time in seconds.
     * If specified, the client should wait this many seconds before retrying.8
     */
    retryAfter?: number;
}

/**
 * Represents a message containing tasks.
 */
export interface IHelpMessage {
    tasks: string[];

    // Temporary version field for back-compat.
    version?: string;
}

/**
 * Represents a message in task queue to be processed.
 */
export interface IQueueMessage {
    message: IHelpMessage;

    tenantId: string;

    documentId: string;

    token: string;
}

/**
 * Interface for nack content.
 */
export interface INackContent {
    /**
     * An error code number that represents the error. It will be a valid HTTP error code.
     * 403 errors are non retryable and client should acquire a new identity before reconnection.
     * 400 errors are always immediately retriable
     * 429 errors are retriable or non retriable (depends on type field).
     */
    code: number;

    /**
     * Type of the Nack.
     */
    type: NackErrorType;

    /**
     * A message about the nack for debugging/logging/telemetry purposes
     */
    message: string;

    /**
     * Optional Retry-After time in seconds
     * If specified, the client should wait this many seconds before retrying
     */
    retryAfter?: number;
}

/**
 * Type of the Nack.
 * InvalidScopeError: Client's token is not valid for the intended op.
 * ThrottlingError: Retryable after retryAfter number.
 * BadRequestError: Clients op is invalid and should retry immediately with a valid op.
 * LimitExceededError: Service is having issues. Client should not retry.
 */
export enum NackErrorType {
    ThrottlingError = "ThrottlingError",
    InvalidScopeError = "InvalidScopeError",
    BadRequestError = "BadRequestError",
    LimitExceededError = "LimitExceededError",
}
