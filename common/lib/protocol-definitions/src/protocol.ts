/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
export enum MessageType {
	/**
	 * Empty operation message. Used to send an updated reference sequence number.
	 * Relay service is free to coalesce these messages or fully drop them, if
	 * another message was used to update MSN to a number equal or higher than referenced
	 * sequence number in Noop.
	 */
	NoOp = "noop",

	/**
	 * System message sent to indicate a new client has joined the collaboration.
	 */
	ClientJoin = "join",

	/**
	 * System message sent to indicate a client has left the collaboration.
	 */
	ClientLeave = "leave",

	/**
	 * Proposes a new consensus value.
	 */
	Propose = "propose",

	/**
	 * Message used to reject a pending proposal.
	 */
	Reject = "reject",

	/**
	 * Message sent by client accepting proposal
	 */
	Accept = "accept",

	/**
	 * Summary operation (message).
	 */
	Summarize = "summarize",

	/**
	 * Summary operation (message) written.
	 */
	SummaryAck = "summaryAck",

	/**
	 * Summary operation (message) write failure.
	 */
	SummaryNack = "summaryNack",

	/**
	 * Operation (message) produced by container runtime.
	 */
	Operation = "op",

	/**
	 * Message to indicate that no active clients are present.
	 */
	NoClient = "noClient",

	/**
	 * Message to indicate successful round trip.
	 */
	RoundTrip = "tripComplete",

	/**
	 * Service specific control messages that are never sequenced.
	 */
	Control = "control",
}

/**
 * @internal
 */
export enum SignalType {
	/**
	 * System signal sent to indicate a new client has joined the collaboration.
	 */
	ClientJoin = "join",

	/**
	 * System signal sent to indicate a client has left the collaboration.
	 */
	ClientLeave = "leave",
}

/**
 * Messages to track latency trace.
 * @public
 */
export interface ITrace {
	/**
	 * Service generating the trace.
	 */
	service: string;

	/**
	 * Denotes receiving/sending.
	 */
	action: string;

	/**
	 * Floating point time in milliseconds with up to nanosecond precision.
	 */
	timestamp: number;
}

/**
 * @alpha
 */
export interface INack {
	/**
	 * The operation that was just nacked.
	 */
	operation: IDocumentMessage | undefined;

	/**
	 * The sequence number the client needs to catch up to before retrying.
	 */
	sequenceNumber: number;

	/**
	 * Detail info about the nack.
	 */
	content: INackContent;
}

/**
 * Document-specific message.
 * @public
 */
export interface IDocumentMessage {
	/**
	 * The document's client sequence number.
	 */
	clientSequenceNumber: number;

	/**
	 * The reference sequence number the message was sent relative to.
	 */
	referenceSequenceNumber: number;

	/**
	 * The type of document message being sent.
	 */
	type: string;

	/**
	 * The contents of the message.
	 */
	contents: unknown;

	/**
	 * App provided metadata about the operation.
	 */
	metadata?: unknown;

	/**
	 * Server provided metadata about the operation.
	 */
	serverMetadata?: unknown;

	/**
	 * Traces related to the packet.
	 */
	traces?: ITrace[];

	/**
	 * The compression algorithm that was used to compress contents of this message.
	 * @experimental Not ready for use
	 */
	compression?: string;
}

/**
 * Document Message with optional system level data field.
 * @internal
 */
export interface IDocumentSystemMessage extends IDocumentMessage {
	data: string;
}

/**
 * Branch origin information.
 * @public
 */
export interface IBranchOrigin {
	/**
	 * Origin branch of the message.
	 */
	id: string;

	/**
	 * Sequence number for the message in branch ID.
	 */
	sequenceNumber: number;

	/**
	 * Minimum sequence number for the message in branch ID.
	 */
	minimumSequenceNumber: number;
}

/**
 * Sequenced message for a distributed document.
 * @public
 */
export interface ISequencedDocumentMessage {
	/**
	 * The client ID that submitted the message.
	 * For server generated messages the clientId will be null;
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	clientId: string | null;

	/**
	 * The sequenced identifier.
	 */
	sequenceNumber: number;

	/**
	 * The minimum sequence number for all connected clients.
	 */
	minimumSequenceNumber: number;

	/**
	 * The document's client sequence number.
	 */
	clientSequenceNumber: number;

	/**
	 * The reference sequence number the message was sent relative to.
	 */
	referenceSequenceNumber: number;

	/**
	 * The type of operation.
	 */
	type: string;

	/**
	 * The contents of the message.
	 */
	contents: unknown;

	/**
	 * App provided metadata about the operation.
	 */
	metadata?: unknown;

	/**
	 * Server provided metadata about the operation.
	 */
	serverMetadata?: unknown;

	/**
	 * Origin branch information for the message.
	 *
	 * @remarks Can be marked undefined if the current message is also the origin.
	 */
	origin?: IBranchOrigin;

	/**
	 * Traces related to the packet.
	 */
	traces?: ITrace[];

	/**
	 * Timestamp when the server ticketed the message.
	 */
	timestamp: number;

	/**
	 * Data provided by service. Only present in service generated messages.
	 */
	data?: string;

	/**
	 * Experimental field for storing the rolling hash at sequence number.
	 *
	 * @deprecated Use {@link ISequencedDocumentMessageExperimental} instead.
	 */
	expHash1?: string;

	/**
	 * The compression algorithm that was used to compress contents of this message.
	 *
	 * @deprecated Use {@link ISequencedDocumentMessageExperimental} instead.
	 */
	compression?: string;
}

/**
 * {@link ISequencedDocumentAugmentedMessage} with experimental properties.
 * @internal
 */
export type ISequencedDocumentMessageExperimental = Omit<
	ISequencedDocumentMessage,
	"expHash1" | "compression"
> & {
	/**
	 * Stores the rolling hash at sequence number.
	 */
	expHash1?: string;

	/**
	 * The compression algorithm that was used to compress contents of this message.
	 */
	compression?: string;
};

/**
 * @internal
 */
export interface ISequencedDocumentSystemMessage extends ISequencedDocumentMessage {
	data: string;
}

/**
 * @internal
 */
export interface ISequencedDocumentAugmentedMessage extends ISequencedDocumentMessage {
	additionalContent: string;
}

/**
 * Common interface between incoming and outgoing signals.
 * @public
 */
export interface ISignalMessageBase {
	/**
	 * Signal content
	 */
	content: unknown;

	/**
	 * Signal type
	 */
	type?: string;

	/**
	 * Counts the number of signals sent by the client
	 */
	clientConnectionNumber?: number;

	/**
	 * Sequence number that indicates when the signal was created in relation to the delta stream
	 */
	referenceSequenceNumber?: number;
}

/**
 * Interface for signals sent by the server to clients.
 * @public
 */
export interface ISignalMessage extends ISignalMessageBase {
	/**
	 * The client ID that submitted the message.
	 * For server generated messages the clientId will be null.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	clientId: string | null;
}

/**
 * Interface for signals sent by clients to the server when submit_signals_v2 is enabled.
 * @internal
 */
export interface ISentSignalMessage extends ISignalMessageBase {
	/**
	 * When specified, the signal is only sent to the provided client id
	 */
	targetClientId?: string;
}

/**
 * @alpha
 */
export interface IUploadedSummaryDetails {
	/**
	 * Indicates whether the uploaded summary contains ".protocol" tree.
	 */
	includesProtocolTree?: boolean;
}

/**
 * @alpha
 */
export interface ISummaryContent {
	/**
	 * Handle reference to the summary data.
	 */
	handle: string;

	/**
	 * Message included as part of the summary.
	 */
	message: string;

	/**
	 * Handles to parent summaries of the proposed new summary.
	 */
	parents: string[];

	/**
	 * Handle to the current latest summary stored by the service
	 */
	head: string;

	/**
	 * Details of the uploaded summary.
	 */
	details?: IUploadedSummaryDetails;

	// TODO - need an epoch/reload bit to indicate to clients that the summary has changed and requires a reload
	// This could be encoded in the summary itself as well but then would require the client to download it to check
}

/**
 * General errors returned from the server.
 * May want to add error code or something similar in the future.
 * @internal
 */
export interface IServerError {
	/**
	 * Message describing the server error.
	 */
	errorMessage: string;
}

/**
 * Data about the original proposed summary message.
 * @alpha
 */
export interface ISummaryProposal {
	/**
	 * Actual sequence number of the summary message proposal.
	 */
	summarySequenceNumber: number;
}

/**
 * Contents of summary ack expected from the server.
 * @alpha
 */
export interface ISummaryAck {
	/**
	 * Handle of the complete summary.
	 */
	handle: string;

	/**
	 * Information about the proposed summary message.
	 */
	summaryProposal: ISummaryProposal;
}

/**
 * Contents of summary nack expected from the server.
 * @alpha
 */
export interface ISummaryNack {
	/**
	 * Information about the proposed summary message.
	 */
	summaryProposal: ISummaryProposal;

	/**
	 * An error code number that represents the error. It will be a valid HTTP error code.
	 * 403 errors are non retriable.
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
 * Interface for nack content.
 * @alpha
 */
export interface INackContent {
	/**
	 * An error code number that represents the error. It will be a valid HTTP error code.
	 * 403 errors are non retriable and client should acquire a new identity before reconnection.
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
 * Type of the nack.
 * @alpha
 */
export enum NackErrorType {
	/**
	 * Retriable after {@link ISummaryNack.retryAfter} seconds.
	 */
	ThrottlingError = "ThrottlingError",

	/**
	 * Client's token is not valid for the intended message.
	 */
	InvalidScopeError = "InvalidScopeError",

	/**
	 * Clients message is invalid and should retry immediately with a valid message.
	 */
	BadRequestError = "BadRequestError",

	/**
	 * Service is having issues. Client should not retry.
	 */
	LimitExceededError = "LimitExceededError",
}
