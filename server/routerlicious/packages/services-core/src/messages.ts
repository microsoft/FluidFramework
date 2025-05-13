/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentMessage,
	INack,
	INackContent,
	ISequencedDocumentMessage,
	ISignalMessage,
	ScopeType,
} from "@fluidframework/protocol-definitions";
import { LambdaName } from "./lambdas";

// String identifying the raw operation message
/**
 * @internal
 */
export const RawOperationType = "RawOperation";

// String identifying the sequenced operation message
/**
 * @internal
 */
export const SequencedOperationType = "SequencedOperation";

// String identifying nack messages
/**
 * @internal
 */
export const NackOperationType = "Nack";

// String identifying signal messages
/**
 * @internal
 */
export const SignalOperationType = "Signal";

/**
 * @internal
 */
export const SystemType: string = "System";

/**
 * @internal
 */
export const BoxcarType = "boxcar";

/**
 * Base class for messages placed on the distributed log
 * @alpha
 */
export interface IMessage {
	// The type of the message
	type: string;
}

/**
 * @internal
 */
export enum SystemOperations {
	// Service joining the cluster
	Join,

	// Service leaving the cluster
	Leave,
}

/**
 * Object that indicates a specific session/document in the system
 * @alpha
 */
export interface IRoutingKey {
	// The tenant id
	tenantId: string;

	// The document id
	documentId: string;
}

/**
 * @internal
 */
export interface ISystemMessage extends IMessage {
	// Id of the service sending the message
	id: string;

	// Group that the service belongs to
	group: string;

	// System operation being performed
	operation: any;
}

/**
 * Message relating to an object
 * @internal
 */
export interface IObjectMessage extends IMessage, IRoutingKey {
	// The client who submitted the message
	// eslint-disable-next-line @rushstack/no-new-null
	clientId: string | null;

	// The time the server received the message, in milliseconds elapsed since
	// 1 January 1970 00:00:00 UTC, with leap seconds ignored.
	timestamp: number;
}

/**
 * Message sent when a client is updating their sequence number directly
 * @internal
 */
export interface IUpdateReferenceSequenceNumberMessage extends IObjectMessage {
	// The sequence number that is being updated
	sequenceNumber: number;
}

/**
 * Raw message inserted into the event hub queue
 * @internal
 */
export interface IRawOperationMessage extends IObjectMessage {
	// The type of the message
	type: typeof RawOperationType;

	// The message that was submitted
	operation: IDocumentMessage;
}

/**
 * A group of IRawOperationMessage objects. Used in receiving batches of ops from Kafka.
 * @internal
 */
export interface IRawOperationMessageBatch extends IRoutingKey {
	// Some ordered index to distinguish different batches. In the Kafka context, it is the Kafka offset.
	index: number;

	contents: IRawOperationMessage[];
}

// Need to change this name - it isn't necessarily ticketed
/**
 * @alpha
 */
export interface ITicketedMessage extends IMessage, IRoutingKey {}

/**
 * Message sent when a raw operation is nacked
 * @internal
 */
export interface INackMessage extends ITicketedMessage {
	// The type of the message
	type: typeof NackOperationType;

	// The client that is being NACKed
	clientId: string;

	// The details of the nack
	operation: INack;

	// The time the server created the message, in milliseconds elapsed since
	// 1 January 1970 00:00:00 UTC, with leap seconds ignored.
	timestamp: number;
}

/**
 * Message sent when a raw operation causes a signal
 * @internal
 */
export interface ITicketedSignalMessage extends ITicketedMessage {
	// The type of the message
	type: typeof SignalOperationType;

	// The details of the nack
	operation: ISignalMessage;

	// The time the server created the message, in milliseconds elapsed since
	// 1 January 1970 00:00:00 UTC, with leap seconds ignored.
	timestamp: number;
}

/**
 * A sequenced operation
 * @alpha
 */
export interface ISequencedOperationMessage extends ITicketedMessage {
	// The type of the message
	type: typeof SequencedOperationType;

	// The sequenced operation
	operation: ISequencedDocumentMessage;
}

/**
 * @internal
 */
export interface IBoxcarMessage extends IMessage, Partial<IRoutingKey> {
	// The type of the message
	type: typeof BoxcarType;

	contents: IMessage[];
}

/**
 * Control messages for service to service communication only
 * @internal
 */
export interface IControlMessage {
	type: string;

	contents: any;
}

/**
 * Control messages types
 * @internal
 */
export enum ControlMessageType {
	// Instruction sent to update Durable sequence number
	UpdateDSN = "updateDSN",

	// Instruction sent to control if deli nacks messages
	NackMessages = "nackMessages",

	// Instruction sent to indicate that the lambda started
	LambdaStartResult = "lambdaStartResult",

	// Instruction sent to indicate a client is still connected
	ExtendClient = "extendClient",
}

/**
 * @internal
 */
export interface IUpdateDSNControlMessageContents {
	durableSequenceNumber: number;
	isClientSummary: boolean;
	clearCache: boolean;
}

/**
 * Nack messages types
 * @internal
 */
export enum NackMessagesType {
	// Used when ops should be nacked because a summary hasn't been made for a while
	SummaryMaxOps = "summaryMaxOps",
}

/**
 * Control message sent to enable a nack message
 * @internal
 */
export interface INackMessagesControlMessageContents {
	/**
	 * Identifier for the type/reason for this nack messages
	 */
	identifier: NackMessagesType;

	/**
	 * The INackContent to send when nacking the message
	 */
	content: INackContent;

	/**
	 * If a client has a scope in this list, there message will be allowed
	 * If undefined, scope will not affect message nacking
	 */
	allowedScopes?: ScopeType[];

	/**
	 * Controls if system messages should be nacked
	 */
	allowSystemMessages?: boolean;
}

/**
 * Control message sent to disable a nack message
 * @internal
 */
export interface IDisableNackMessagesControlMessageContents {
	/**
	 * Identifier for the type/reason for this nack messages
	 */
	identifier: NackMessagesType;

	/**
	 * The INackContent to send when nacking the message
	 */
	content: undefined;
}

/**
 * @internal
 */
export interface ILambdaStartControlMessageContents {
	lambdaName: LambdaName;
	success: boolean;
}

/**
 * @internal
 */
export interface IExtendClientControlMessageContents {
	clientId?: string;
	clientIds?: string[];
}
