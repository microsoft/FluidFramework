/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IBaseDebuggerMessage,
	IDebuggerMessage,
	IMessageRelay,
	IMessageRelayEvents,
	isDebuggerMessage,
} from "@fluid-tools/client-debugger";

import {
	devToolsInitAcknowledgementType,
	DevToolsInitMessage,
	devToolsInitMessageType,
	extensionMessageSource,
	postMessageToPort,
	TypedPortConnection,
} from "../messaging";
import {
	devtoolsScriptMessageLoggingOptions,
	formatDevtoolsScriptMessageForLogging,
} from "./Logging";

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
 * 1. After establishing the connection with the background service, we send the initialization message that informs
 * the background script of the devtools extension / tab relationship. If that message fails to be processed for any
 * reason, subsequent messages sent from the devtools script will not be correctly forwarded. We should utilize a proper
 * handshake mechanism for the initialization process, and any other critical messages.
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
	 * Port connection to the Background Script
	 */
	private readonly backgroundServiceConnection: TypedPortConnection;

	/**
	 * Creates an instance of {@link BackgroundConnection}.
	 *
	 * @param messageSource - All messages sent through the returned instance's {@link BackgroundConnection.postMessage}
	 * method will get this value written to their 'source' property.
	 */
	public constructor(private readonly messageSource: string) {
		super();

		console.log(formatDevtoolsScriptMessageForLogging("Connecting to Background script..."));

		// Create a connection to the background page
		this.backgroundServiceConnection = chrome.runtime.connect({
			name: "Background Script",
		});

		// Relay the tab ID to the background service worker.
		const initMessage: DevToolsInitMessage = {
			source: extensionMessageSource,
			type: devToolsInitMessageType,
			data: {
				tabId: chrome.devtools.inspectedWindow.tabId,
			},
		};
		postMessageToPort(
			initMessage,
			this.backgroundServiceConnection,
			devtoolsScriptMessageLoggingOptions,
		);

		// Bind listeners
		this.backgroundServiceConnection.onMessage.addListener(this.onBackgroundServiceMessage);
		this.backgroundServiceConnection.onDisconnect.addListener(
			this.onBackgroundServiceDisconnect,
		);
	}

	/**
	 * Post message to Background Script.
	 */
	public postMessage(message: IBaseDebuggerMessage): void {
		const sourcedMessage: IDebuggerMessage = {
			...message,
			source: this.messageSource,
		};
		postMessageToPort(
			sourcedMessage,
			this.backgroundServiceConnection,
			devtoolsScriptMessageLoggingOptions,
		);
	}

	/**
	 * Handler for incoming messages from {@link backgroundServiceConnection}.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private readonly onBackgroundServiceMessage = (message: Partial<IDebuggerMessage>): boolean => {
		if (!isDebuggerMessage(message)) {
			return false;
		}

		if (message.type === devToolsInitAcknowledgementType) {
			console.log(
				formatDevtoolsScriptMessageForLogging("Background initialization acknowledged."),
			);
			return true;
		} else {
			// Forward incoming message onto subscribers.
			// TODO: validate source
			console.log(
				formatDevtoolsScriptMessageForLogging(`Relaying message from Background Service:`),
				message,
			);
			return this.emit("message", message);
		}
	};

	/**
	 * Handler for a disconnect event coming from the background service.
	 * Immediately throws, since this type is currently not capable of recovering from this state.
	 */
	private readonly onBackgroundServiceDisconnect = (): void => {
		throw new Error(
			formatDevtoolsScriptMessageForLogging(
				"The Background Script disconnected. Further use of the message relay is not allowed.",
			),
		);
	};
}
