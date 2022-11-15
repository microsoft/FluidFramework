/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import {
    IDeltaQueue,
    ReadOnlyInfo,
    IConnectionDetails,
    ICriticalContainerError,
    IFluidCodeDetails,
    isFluidPackage,
} from "@fluidframework/container-definitions";
import {
    ConnectionMode,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IClientConfiguration,
    IClientDetails,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";
import { IContainerPackageInfo } from "@fluidframework/driver-definitions";

export enum ReconnectMode {
    Never = "Never",
    Disabled = "Disabled",
    Enabled = "Enabled",
}

/**
 * Connection manager (implements this interface) is responsible for maintaining connection
 * to relay service.
 */
export interface IConnectionManager {
    readonly connected: boolean;

    readonly clientId: string | undefined;

    /** The queue of outbound delta messages */
    readonly outbound: IDeltaQueue<IDocumentMessage[]>;

    /** Details of client */
    readonly clientDetails: IClientDetails;

    /** Protocol version being used to communicate with the service */
    readonly version: string;

    /** Max message size allowed to the delta manager */
    readonly maxMessageSize: number;

    /** Service configuration provided by the service. */
    readonly serviceConfiguration: IClientConfiguration | undefined;

    readonly readOnlyInfo: ReadOnlyInfo;

    // Various connectivity properties for telemetry describing type of current connection
    // Things like connection mode, service info, etc.
    // Called when connection state changes (connect / disconnect)
    readonly connectionProps: ITelemetryProperties;

    // Verbose information about connection logged to telemetry in case of issues with
    // maintaining healthy connection, including op gaps, not receiving join op in time, etc.
    // Contains details information, like sequence numbers at connection time, initial ops info, etc.
    readonly connectionVerboseProps: ITelemetryProperties;

    /**
     * Prepares message to be sent. Fills in clientSequenceNumber.
     * Called only when active connection is present.
     */
    prepareMessageToSend(message: Omit<IDocumentMessage, "clientSequenceNumber">): IDocumentMessage | undefined;

    /**
     * Called before incoming message is processed. Incoming messages can be combing from connection,
     * but also could come from storage.
     * This call allows connection manager to adjust knowledge about acked ops sent on previous connection.
     * Can be called at any time, including when there is no active connection.
     */
    beforeProcessingIncomingOp(message: ISequencedDocumentMessage): void;

    /**
     * Submits signal to relay service.
     * Called only when active connection is present.
     */
    submitSignal(content: any): void;

    /**
     * Submits messages to relay service.
     * Called only when active connection is present.
     */
    sendMessages(messages: IDocumentMessage[]): void;

    /**
     * Initiates connection to relay service (noop if already connected).
     */
    connect(connectionMode?: ConnectionMode): void;

    /**
     * Disposed connection manager
     */
    dispose(error?: ICriticalContainerError): void;

    get connectionMode(): ConnectionMode;
}

/**
 * This interface represents a set of callbacks provided by DeltaManager to IConnectionManager on its creation
 * IConnectionManager instance will use them to communicate to DeltaManager about various events.
 */
export interface IConnectionManagerFactoryArgs {
    /**
     * Called by connection manager for each incoming op. Some ops maybe delivered before
     * connectHandler is called (initial ops on socket connection)
     */
    readonly incomingOpHandler: (messages: ISequencedDocumentMessage[], reason: string) => void;

    /**
     * Called by connection manager for each incoming signals.
     * Maybe called before connectHandler is called (initial signals on socket connection)
     */
    readonly signalHandler: (message: ISignalMessage) => void;

    /**
     * Called when connection manager experiences delay in connecting to relay service.
     * This can happen because client is offline, or service is busy and asks to not connect for some time.
     * Can be called many times while not connected.
     * Situation is considered resolved when connection is established and connectHandler is called.
     */
    readonly reconnectionDelayHandler: (delayMs: number, error: unknown) => void;

    /**
     * Called by connection manager whenever critical error happens and container should be closed.
     * Expects dispose() call in response to this call.
     */
    readonly closeHandler: (error?: any) => void;

    /**
     * Called whenever connection to relay service is lost.
     */
    readonly disconnectHandler: (reason: string) => void;

    /**
     * Called whenever new connection to rely service is established
     */
    readonly connectHandler: (connection: IConnectionDetails) => void;

    /**
     * Called whenever ping/pong messages are roundtripped on connection.
     */
    readonly pongHandler: (latency: number) => void;

    /**
     * Called whenever connection type changes from writable to read-only or vice versa.
     * Connection can be read-only if user has no edit permissions, or if container forced
     * connection to be read-only.
     * This should not be confused with "read" / "write"connection mode which is internal
     * optimization.
     */
    readonly readonlyChangeHandler: (readonly?: boolean) => void;
}

/**
 *
 * @param codeDetails- - Data structure used to describe the code to load on the Fluid document
 * @returns The name of the Fluid package
 */
export const getPackageName = (codeDetails: IFluidCodeDetails | undefined): IContainerPackageInfo => {
    let containerPackageName;
    if (codeDetails && "name" in codeDetails) {
        containerPackageName = codeDetails;
    } else if (isFluidPackage(codeDetails?.package)) {
        containerPackageName = codeDetails?.package.name;
    } else {
        containerPackageName = codeDetails?.package;
    }
    return { name: containerPackageName };
};
