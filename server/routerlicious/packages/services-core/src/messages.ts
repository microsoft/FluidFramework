/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentMessage,
    INack,
    INackContent,
    ISequencedDocumentMessage,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import { LambdaName } from "./lambdas";

// String identifying the raw operation message
export const RawOperationType = "RawOperation";

// String identifying the sequenced operation message
export const SequencedOperationType = "SequencedOperation";

// String identifying nack messages
export const NackOperationType = "Nack";

export const SystemType: string = "System";

export const BoxcarType = "boxcar";

/**
 * Base class for messages placed on the distributed log
 */
export interface IMessage {
    // The type of the message
    type: string;
}

export enum SystemOperations {
    // Service joining the cluster
    Join,

    // Service leaving the cluster
    Leave,
}

/**
 * Object that indicates a specific session/document in the system
 */
export interface IRoutingKey {
    // The tenant id
    tenantId: string;

    // The document id
    documentId: string;
}

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
 */
export interface IObjectMessage extends IMessage, IRoutingKey {
    // The client who submitted the message
    clientId: string | null;

    // The time the server received the message, in milliseconds elapsed since
    // 1 January 1970 00:00:00 UTC, with leap seconds ignored.
    timestamp: number;
}

/**
 * Message sent when a client is updating their sequence number directly
 */
export interface IUpdateReferenceSequenceNumberMessage extends IObjectMessage {
    // The sequence number that is being updated
    sequenceNumber: number;
}

/**
 * Raw message inserted into the event hub queue
 */
export interface IRawOperationMessage extends IObjectMessage {
    // The type of the message
    type: typeof RawOperationType;

    // The message that was submitted
    operation: IDocumentMessage;
}

/**
 * A group of IRawOperationMessage objects. Used in receiving batches of ops from Kafka.
 */
export interface IRawOperationMessageBatch extends IRoutingKey {
    // Some ordered index to distinguish different batches. In the Kafka context, it is the Kafka offset.
    index: number;

    contents: IRawOperationMessage[];
}

// Need to change this name - it isn't necessarily ticketed
export interface ITicketedMessage extends IMessage, IRoutingKey {
}

/**
 * Message sent when a raw operation is nacked
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
 * A sequenced operation
 */
export interface ISequencedOperationMessage extends ITicketedMessage {
    // The type of the message
    type: typeof SequencedOperationType;

    // The sequenced operation
    operation: ISequencedDocumentMessage;
}

export interface IBoxcarMessage extends ITicketedMessage {
    // The type of the message
    type: typeof BoxcarType;

    contents: IMessage[];
}

/**
 * Control messages for service to service communication only
 */
export interface IControlMessage {
    type: string;

    contents: any;
}

/**
 * Control messages types
 */
export enum ControlMessageType {
    // Instruction sent to update Durable sequence number
    UpdateDSN = "updateDSN",

    // Instruction sent to control if deli nacks messages
    NackMessages = "nackMessages",

    // Instruction sent to indicate that the lambda started
    LambdaStartResult = "lambdaStartResult",
}

export interface IUpdateDSNControlMessageContents {
    durableSequenceNumber: number;
    isClientSummary: boolean;
    clearCache: boolean;
}

/**
 * Nack messages types
 */
export enum NackMessagesType {
    // Used when ops should be nacked because a summary hasn't been made for a while
    SummaryMaxOps = "summaryMaxOps",
}

/**
 * Control message sent to enable a nack message
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

export interface ILambdaStartControlMessageContents {
    lambdaName: LambdaName;
    success: boolean;
}
