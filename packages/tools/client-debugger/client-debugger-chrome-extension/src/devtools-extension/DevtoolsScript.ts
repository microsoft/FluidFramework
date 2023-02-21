/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";
import {
	DevToolsInitMessage,
	devtoolsMessageSource,
	isValidDebuggerMessage,
	relayMessageToPort,
} from "./messaging";

// TODOs:
// - Document messaging relationships

const loggingContext = "EXTENSION(DEVTOOLS)";

const messageLoggingOptions: MessageLoggingOptions = {
	context: loggingContext,
};

function formatForLogging(text: string): string {
	return `${loggingContext}: ${text}`;
}

console.log("DEVTOOLS HOST: Initializing background script...");

// Create a connection to the background service worker.
const backgroundPageConnection = chrome.runtime.connect({
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

backgroundPageConnection.postMessage(initMessage);

console.log("DEVTOOLS HOST: Initializing devtools panel view...");

// When our extension view is launched, open the root visualization view.
chrome.devtools.panels.create(
	"Fluid Client Debugger",
	"images/icon.png",
	"rootView.html",
	(panel) => {
		// When the panel is first shown, register to relay messages from its window to the background worker
		panel.onShown.addListener((panelWindow) => {
			/**
			 * Relay messages from the background service worker to the panel window
			 */
			function relayMessageFromBackgroundToPanel(event: MessageEvent): void {
				const message = event.data as Partial<IDebuggerMessage>;
				if (!isValidDebuggerMessage(message)) {
					console.error(
						formatForLogging("Received malformed message from Devtools script:"),
						message,
					);
					return;
				}
				console.log(
					`${loggingContext}: Posting message to devtools panel window:`,
					message,
				); // TODO: console.debug
				panelWindow.postMessage(message);
			}

			/**
			 * Relay messages from the panel window to the background service worker
			 */
			function relayMessageFromPanelToBackground(event: MessageEvent): void {
				const message = event.data as Partial<IDebuggerMessage>;
				if (!isValidDebuggerMessage(message)) {
					console.error(
						formatForLogging("Received malformed message from Devtools script:"),
						message,
					);
					return;
				}
				relayMessageToPort(
					message,
					"devtools panel",
					backgroundPageConnection,
					messageLoggingOptions,
				);
			}

			// Relay messages from the background service worker to the as appropriate
			backgroundPageConnection.onMessage.addListener(relayMessageFromBackgroundToPanel);

			// Relay messages from the devtools panel window to the background worker as appropriate
			panelWindow.addEventListener("message", relayMessageFromPanelToBackground);
		});

		// TODO: do we need to remove listeners when panel is hidden?
	},
);

backgroundPageConnection.onDisconnect.addListener((port) => {
	// TODO: do we need to do anything here? Or
});
