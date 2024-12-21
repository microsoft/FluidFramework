/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	IDeltaQueue,
	ReadOnlyInfo,
	IFluidCodeDetails,
	isFluidPackage,
	IConnectionDetails,
	type DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import { IErrorBase, ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { ConnectionMode, IClientDetails } from "@fluidframework/driver-definitions";
import {
	IContainerPackageInfo,
	IClientConfiguration,
	IDocumentMessage,
	ISignalClient,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions/internal";

export enum ReconnectMode {
	Never = "Never",
	Disabled = "Disabled",
	Enabled = "Enabled",
}

export interface IConnectionStateChangeReason<T extends IErrorBase = IErrorBase> {
	text: string;
	error?: T;
	disconnectReason?: DisconnectReason;
}

/**
 * Internal version of IConnectionDetails with props are only exposed internally
 */
export interface IConnectionDetailsInternal extends IConnectionDetails {
	mode: ConnectionMode;
	version: string;
	initialClients: ISignalClient[];
	reason: IConnectionStateChangeReason;
}

/**
 * Connection manager (implements this interface) is responsible for maintaining connection
 * to relay service.
 */
export interface IConnectionManager {
	readonly connected: boolean;

	readonly clientId: string | undefined;

	/**
	 * The queue of outbound delta messages
	 */
	readonly outbound: IDeltaQueue<IDocumentMessage[]>;

	/**
	 * Details of client
	 */
	readonly clientDetails: IClientDetails;

	/**
	 * Protocol version being used to communicate with the service
	 */
	readonly version: string;

	/**
	 * Max message size allowed to the delta manager
	 */
	readonly maxMessageSize: number;

	/**
	 * Service configuration provided by the service.
	 */
	readonly serviceConfiguration: IClientConfiguration | undefined;

	readonly readOnlyInfo: ReadOnlyInfo;

	// Various connectivity properties for telemetry describing type of current connection
	// Things like connection mode, service info, etc.
	// Called when connection state changes (connect / disconnect)
	readonly connectionProps: ITelemetryBaseProperties;

	// Verbose information about connection logged to telemetry in case of issues with
	// maintaining healthy connection, including op gaps, not receiving join op in time, etc.
	// Contains details information, like sequence numbers at connection time, initial ops info, etc.
	readonly connectionVerboseProps: ITelemetryBaseProperties;

	/**
	 * Prepares message to be sent. Fills in clientSequenceNumber.
	 * Called only when active connection is present.
	 */
	prepareMessageToSend(
		message: Omit<IDocumentMessage, "clientSequenceNumber">,
	): IDocumentMessage | undefined;

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
	submitSignal: (content: string, targetClientId?: string) => void;

	/**
	 * Submits messages to relay service.
	 * Called only when active connection is present.
	 */
	sendMessages(messages: IDocumentMessage[]): void;

	/**
	 * Initiates connection to relay service (noop if already connected).
	 */
	connect(reason: IConnectionStateChangeReason, connectionMode?: ConnectionMode): void;

	/**
	 * Disposed connection manager
	 */
	dispose(
		disconnectReason: DisconnectReason,
		error?: ICriticalContainerError,
		switchToReadonly?: boolean,
	): void;
	dispose(error?: ICriticalContainerError, switchToReadonly?: boolean): void;

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
	 * Called by connection manager for each incoming signal.
	 * May be called before connectHandler is called (due to initial signals on socket connection)
	 */
	readonly signalHandler: (signals: ISignalMessage[]) => void;

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
	readonly closeHandler: (error?: IErrorBase) => void;

	/**
	 * Called whenever connection to relay service is lost.
	 */
	readonly disconnectHandler: (reason: IConnectionStateChangeReason) => void;

	/**
	 * Called whenever new connection to rely service is established
	 */
	readonly connectHandler: (connection: IConnectionDetailsInternal) => void;

	/**
	 * Called whenever ping/pong messages are roundtripped on connection.
	 */
	readonly pongHandler: (latency: number) => void;

	/**
	 * Called whenever connection type changes from writable to read-only or vice versa.
	 *
	 * @remarks
	 *
	 * Connection can be read-only if user has no edit permissions, or if container forced
	 * connection to be read-only.
	 * This should not be confused with "read" / "write"connection mode which is internal
	 * optimization.
	 *
	 * @param readonly - Whether or not the container is now read-only.
	 * `undefined` indicates that user permissions are not yet known.
	 * @param readonlyConnectionReason - reason/error if any for the change
	 */
	readonly readonlyChangeHandler: (
		readonly?: boolean,
		readonlyConnectionReason?: IConnectionStateChangeReason,
	) => void;

	/**
	 * Called whenever we try to start establishing a new connection.
	 */
	readonly establishConnectionHandler: (reason: IConnectionStateChangeReason) => void;

	/**
	 * Called whenever we cancel the connection in progress.
	 */
	readonly cancelConnectionHandler: (reason: IConnectionStateChangeReason) => void;
}

/**
 * Gets the name of the Fluid package.
 * @param codeDetails- - Data structure used to describe the code to load on the Fluid document
 */
export const getPackageName = (
	codeDetails: IFluidCodeDetails | undefined,
): IContainerPackageInfo => {
	// TODO: use a real type
	// This is the normal path that any modern customer would hit
	const containerPackageName: string | undefined = isFluidPackage(codeDetails?.package)
		? codeDetails?.package.name
		: codeDetails?.package;
	return { name: containerPackageName as string };
};
