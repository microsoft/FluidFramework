/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type IDevtoolsMessage,
	type ISourcedDevtoolsMessage,
	type IMessageRelay,
	type IMessageRelayEvents,
	isDevtoolsMessage,
	devtoolsMessageSource,
} from "@fluidframework/devtools-core";

import { browser } from "./Globals";
import {
	devToolsInitAcknowledgementType,
	type DevToolsInitMessage,
	devToolsInitMessageType,
	extensionMessageSource,
	type TypedPortConnection,
} from "./messaging";

/**
 * {@link BackgroundConnection} input parameters.
 */
export interface BackgroundConnectionParameters {
	/**
	 * This value will get written to the {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage.source} property
	 * of all messages sent via {@link BackgroundConnection.postMessage}.
	 *
	 * It will also be used as context metadata for console debug logging.
	 *
	 * @see {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage}
	 */
	messageSource: string;

	/**
	 * The ID of the tab being connected to through the background service worker.
	 */
	tabId: number;
}

/**
 * Message relay for communicating with the Background Script.
 *
 * @remarks
 *
 * We use this class to manage our connection from the Devtools Script to the Background Script, such that we can
 * provide it to our internal library of shared React components and allow them to communicate with external services
 * without needing to be aware of what endpoint they're communicating with.
 *
 * @privateRemarks
 *
 * TODO: This implementation is brittle in a number of ways, which should be addressed before we publish the extension:
 *
 * 1. There's no timeout or fallback logic if the initial handshake with the Background Service does not succeed; the
 * call to BackgroundConnection.Initialize() will just hang forever. This at least ensures that the DevTools script
 * won't be able to send messages that would fail to be relayed to the Content Script, but results in bad UX in the case
 * where the Background Service fails to connect with the application tab for some reason.
 *
 * 2. We don't currently recover if the background service is disconnected for any reason. Generally speaking, the
 * background script's lifetime should outlive the devtools script, but there may be cases where the connection is
 * broken and we could theoretically recover from it. We'll want to see how problematic this really is before attempting
 * to solve it, but it may require something like a message queue so we can queue up messages while we attempt to
 * reconnect, and send them (*in order*, as ordering may be important in some cases) once we have reconnected. For now,
 * we simply throw if the background service disconnects (fail-fast).
 */
export class BackgroundConnection
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	/**
	 * {@inheritDoc BackgroundConnectionParameters.messageSource}
	 */
	public readonly messageSource: string;

	/**
	 * {@inheritDoc BackgroundConnectionParameters.tabId}
	 */
	public readonly tabId: number;

	/**
	 * Port connection to the Background Script
	 */
	private backgroundServiceConnection!: TypedPortConnection;

	/**
	 * Creates a new {@link BackgroundConnection}.
	 */
	public static async Initialize(
		props: BackgroundConnectionParameters,
	): Promise<BackgroundConnection> {
		const connection = new BackgroundConnection(props);
		await new Promise((resolve) => {
			connection.once("tabConnected", resolve);
		});
		return connection;
	}

	/**
	 * Creates an instance of {@link BackgroundConnection}.
	 */
	private constructor(props: BackgroundConnectionParameters) {
		super();

		this.messageSource = props.messageSource;
		this.tabId = props.tabId;

		this.connectToBackgroundService();
	}

	/**
	 * Post a message to the Background Script.
	 *
	 * @remarks These messages are mostly for the devtools library, but some are for the Background Script
	 * itself (for initialization).
	 */
	public postMessage(message: IDevtoolsMessage): void {
		const sourcedMessage: ISourcedDevtoolsMessage = {
			...message,
			source: this.messageSource,
		};

		this.logDebugMessage(`Posting message to background service:`, sourcedMessage);
		this.backgroundServiceConnection.postMessage(sourcedMessage);
	}

	/**
	 * Handler for incoming messages from {@link backgroundServiceConnection}.
	 * Messages are forwarded on to subscribers for valid {@link ISourcedDevtoolsMessage}s from the expected source.
	 */
	private readonly onBackgroundServiceMessage = (
		message: Partial<ISourcedDevtoolsMessage>,
	): boolean => {
		if (!isDevtoolsMessage(message)) {
			return false;
		}

		// Ignore messages from unexpected sources.
		// We receive at least one message directly from the Background script so we need to include
		// extensionMessageSource as a valid source.
		if (message.source !== extensionMessageSource && message.source !== devtoolsMessageSource) {
			return false;
		}

		// Handle init-acknowledgment message from background service
		if (message.type === devToolsInitAcknowledgementType) {
			this.logDebugMessage("Background initialization complete.");
			return this.emit("tabConnected");
		}

		// Forward incoming message onto subscribers.
		return this.emitMessage(message);
	};

	/**
	 * Emits the provided message to subscribers of the `message` event.
	 */
	private emitMessage(message: ISourcedDevtoolsMessage): boolean {
		this.logDebugMessage(`Relaying message from Background Service:`, message);
		return this.emit("message", message);
	}

	/**
	 * Handler for a disconnect event coming from the background service.
	 * Log the disconnection and re-establish the connection.
	 */
	private readonly onBackgroundServiceDisconnect = (): void => {
		this.logDebugMessage("Disconnected from Background script. Attempting to reconnect...");

		//  No need to clean up the disconnected event listener here since if the event emitter is not accessible,
		// even if it has listeners attached to it, it will be garbage collected.
		this.connectToBackgroundService();
	};

	/**
	 * Connects to the Background Script.
	 */
	private readonly connectToBackgroundService = (): void => {
		this.logDebugMessage("Connecting to Background script...");

		// Create a connection to the background page
		this.backgroundServiceConnection = browser.runtime.connect({
			name: "Devtools-Background-Port",
		});

		// Relay the tab ID to the background service worker.
		const initMessage: DevToolsInitMessage = {
			source: this.messageSource,
			type: devToolsInitMessageType,
			data: {
				tabId: this.tabId,
			},
		};
		this.postMessage(initMessage);

		// Bind listeners
		this.backgroundServiceConnection.onMessage.addListener(this.onBackgroundServiceMessage);
		this.backgroundServiceConnection.onDisconnect.addListener(
			this.onBackgroundServiceDisconnect,
		);
	};

	private logDebugMessage(text: string, ...args: unknown[]): void {
		console.debug(`FLUID_DEVTOOLS(${this.messageSource}):${text}`, args);
	}
}
