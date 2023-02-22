/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { DebuggerPanel } from "../shared-components";
import { IMessageReceiverEvents, IMessageRelay, TypedPortConnection } from "../messaging";
import { DevToolsInitMessage, devtoolsMessageSource } from "./messaging";
import {
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	MessageLoggingOptions,
} from "@fluid-tools/client-debugger";

// TODOs:
// - Dedupe logging infra
// - Move types into devtools folder

const panelElement = document.createElement("div");
panelElement.id = "fluid-client-debugger-root";
panelElement.style.height = "100%";
panelElement.style.width = "100%";

ReactDOM.render(React.createElement(DebuggerPanel), panelElement, () => {
	document.body.append(panelElement);
	console.log("DEVTOOLS PANEL: Rendered debug view!");
});

/**
 * Context string for logging.
 */
const loggingContext = "EXTENSION(DEVTOOLS)";

/**
 * Configuration for console logging.
 */
const messageLoggingOptions: MessageLoggingOptions = {
	context: loggingContext,
};

/**
 * Formats the provided log message with the appropriate context information.
 */
function formatForLogging(text: string): string {
	return `${loggingContext}: ${text}`;
}

/**
 * Message relay for communicating with the Background Script.
 */
class BackgroundConnection
	extends TypedEventEmitter<IMessageReceiverEvents>
	implements IMessageRelay
{
	/**
	 * Port connection to the Background Script
	 */
	private readonly backgroundScriptConnection: TypedPortConnection;

	public constructor() {
		super();

		// Create a connection to the background page
		this.backgroundScriptConnection = chrome.runtime.connect({
			name: "devtools-page",
		});

		// Relay the tab ID to the background service worker.
		const initMessage: DevToolsInitMessage = {
			source: devtoolsMessageSource,
			type: "initializeDevtools",
			data: {
				tabId: chrome.devtools.inspectedWindow.tabId,
			},
		};
		this.backgroundScriptConnection.postMessage(initMessage);

		// Bind listeners
		this.backgroundScriptConnection.onMessage.addListener(
			(message: MessageEvent<Partial<IDebuggerMessage>>) => {
				handleIncomingMessage(message, handlers, messageLoggingOptions);
			},
		);
		this.backgroundScriptConnection.onDisconnect.addListener((port) => {
			// TODO: dispose listeners?
		});
	}
}
