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
} from "@fluidframework/container-definitions";
import {
    ConnectionMode,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IClientConfiguration,
    IClientDetails,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";

export interface IConnectionArgs {
    mode?: ConnectionMode;
    fetchOpsFromStorage?: boolean;
    reason: string;
}

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

    // Various connectivity propetries for telemetry describing type of current connection
    // Things like connection mode, service info, etc.
    // Called when connection state changes (connect / disconnect)
    readonly connectionProps: ITelemetryProperties;

    // Verbose information about connection logged to telemetry in case of issues with
    // maintaining healphy connection, including op gaps, not receiving join op in time, etc.
    // Contains details information, like sequence numbers at connection time, initial ops info, etc.
    readonly connectionVerboseProps: ITelemetryProperties;

    setAutoReconnect(mode: ReconnectMode): void;
    forceReadonly(readonly: boolean): void;
    prepareMesage(message: Omit<IDocumentMessage, "clientSequenceNumber">): IDocumentMessage | undefined;
    beforeProcessingOp(message: ISequencedDocumentMessage): void;
    submitSignal(content: any): void;
    sendMessages(messages: IDocumentMessage[]): void;
    connect(args: IConnectionArgs): void;
    dispose(error: any): void;
}

/**
 * Tis interface represents a set of callbacks provided by DeltaManager to IConnectionManager on its creation
 * IConnectionManager instance will use them to communicate to DeltaManager abour various events.
 */
export interface IConnectionManagereFactoryArgs {
    readonly enqueueMessages: (messages: ISequencedDocumentMessage[], reason: string) => void,
    readonly signalHandler: (message: ISignalMessage) => void,
    readonly emitDelayInfo: (delayMs: number, error: unknown) => void,
    readonly refreshDelayInfo: () => void,
    readonly closeHandler: (error: any) => void,
    readonly disconnectHandler: (reason: string) => void,
    readonly connectHandler: (connection: IConnectionDetails) => void,
    readonly pongHandler: (latency: number) => void,
    readonly readonlyChangeHandler: (readonly?: boolean) => void,
}
