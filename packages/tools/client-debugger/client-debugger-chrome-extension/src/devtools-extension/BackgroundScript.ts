/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";
import { DevToolsInitMessage, isValidDebuggerMessage, relayMessageToPort } from "./messaging";

/**
 * This module is the extension's Background Script.
 * It runs in a background worker, and has no direct access to the page or any of its resources.
 * It is initialized by the Devtools script when needed.
 *
 * From an implementation perspective, this script strictly relays messages between the page
 * (via the Content Script) to the Devtool Script.
 *
 * TODO link to docs on Background script + Devtools extension flow
 */

// TODOs:
// - Document messaging relationship
// - Perform message source validation?
// - Dedupe logging functionality with other scripts

/**
 * Context string for logging.
 */
const loggingContext = "EXTENSION(BACKGROUND SCRIPT)";

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
 * This listener waits for a connection from DevtoolPanel,
 * connects to the content script which we injected into the inspected tab,
 * and relays messages from the inspected tab back to DevtoolPanel.
 */
chrome.runtime.onConnect.addListener((devToolsConnection: chrome.runtime.Port): void => {
	let tabConnection: chrome.runtime.Port | undefined;

	console.log(formatForLogging("Initializing background script..."));

	/**
	 * Listen for incoming messages from the Devtools script.
	 */
	const devToolsListener = (message: Partial<IDebuggerMessage>): void => {
		if (!isValidDebuggerMessage(message)) {
			return;
		}

		// The original connection event doesn't include the tab ID of the
		// DevTools page, so we need to send it explicitly in an 'init' command.
		if (message.type === "initializeDevtools") {
			console.log(formatForLogging("Init message received from Devtools script..."));

			const { tabId } = (message as DevToolsInitMessage).data;

			// Wait until the tab is loaded.
			chrome.tabs.get(tabId).then(() => {
				console.log(formatForLogging("Connecting to tab:"), tabId);

				tabConnection = chrome.tabs.connect(tabId);

				// Forward incoming messages from the tab (Content script) to the Devtools script
				const tabListener = (tabMessage: Partial<IDebuggerMessage>): void => {
					if (isValidDebuggerMessage(tabMessage)) {
						relayMessageToPort(
							tabMessage,
							"content script",
							devToolsConnection,
							messageLoggingOptions,
						);
					}
				};
				tabConnection.onMessage.addListener(tabListener);

				// On tab disconnect, clean up listeners
				tabConnection.onDisconnect.addListener(() => {
					devToolsConnection.disconnect();
				});
			}, console.error);
		} else {
			// Relay message from the Devtools script to the tab (Content script)
			if (tabConnection !== undefined) {
				relayMessageToPort(
					message,
					"devtools script",
					tabConnection,
					messageLoggingOptions,
				);
			}
		}
	};

	// Relay messages (as appropriate) to the Content script
	devToolsConnection.onMessage.addListener(devToolsListener);

	devToolsConnection.onDisconnect.addListener(() => {
		tabConnection?.disconnect();
	});
});
