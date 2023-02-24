/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, isDebuggerMessage } from "@fluid-tools/client-debugger";
import {
	backgroundScriptMessageLoggingOptions,
	formatBackgroundScriptMessageForLogging,
} from "./background";
import {
	DevToolsInitAcknowledgement,
	devToolsInitAcknowledgementType,
	DevToolsInitMessage,
	devToolsInitMessageType,
	devtoolsMessageSource,
	postMessageToPort,
	relayMessageToPort,
} from "./messaging";

/**
 * This module is the extension's Background Script.
 * It runs in a background worker, and has no direct access to the page or any of its resources.
 * It runs automatically in the background, and may correspond to any number of running Devtools
 * script instances.
 *
 * From an implementation perspective, this script strictly relays messages between the page
 * (via the Content Script) and the Devtools Script.
 *
 * TODO link to docs on Background script + Devtools extension flow
 */

console.log(formatBackgroundScriptMessageForLogging("Initializing Background Script."));

/**
 * This listener waits for a connection from DevtoolPanel,
 * connects to the content script which we injected into the inspected tab,
 * and relays messages from the inspected tab back to DevtoolPanel.
 */
chrome.runtime.onConnect.addListener((devtoolsPort: chrome.runtime.Port): void => {
	// Note: this is captured by the devtoolsMessageListener lambda below.
	let tabConnection: chrome.runtime.Port | undefined;

	/**
	 * Listen for init messages from the Devtools script, and instantiate tab (Content Script)
	 * connections as needed.
	 */
	const devtoolsMessageListener = (message: Partial<IDebuggerMessage>): void => {
		if (!isDebuggerMessage(message)) {
			// Since this handler is attached strictly to our Devtools Script port,
			// we should *only* see our own messages.
			console.error(
				formatBackgroundScriptMessageForLogging(
					`Received unexpected message format from Devtools Script:`,
				),
				message,
			);
			return;
		}

		// The original connection event doesn't include the tab ID of the
		// DevTools page, so we need to send it explicitly in an 'init' command.
		if (message.type === devToolsInitMessageType) {
			console.log(
				formatBackgroundScriptMessageForLogging(
					"Init message received from DEVTOOLS_SCRIPT...",
				),
			);

			const { tabId } = (message as DevToolsInitMessage).data;

			console.log(formatBackgroundScriptMessageForLogging(`Connecting to tab: ${tabId}.`));

			// Wait until the tab is loaded.
			chrome.tabs.get(tabId).then(
				(tab) => {
					if (tab.id !== tabId) {
						throw new Error(
							"Tab connection reported a different ID than the one we used to connect to it. This is unexpected.",
						);
					}

					tabConnection = chrome.tabs.connect(tabId, { name: "Content Script" });

					console.log(
						formatBackgroundScriptMessageForLogging(`Connected to tab: ${tabId}.`),
					);

					// Forward incoming messages from the tab (Content script) to the Devtools script

					tabConnection.onMessage.addListener(
						(tabMessage: Partial<IDebuggerMessage>): void => {
							if (isDebuggerMessage(tabMessage)) {
								relayMessageToPort(
									tabMessage,
									"CONTENT_SCRIPT",
									devtoolsPort,
									backgroundScriptMessageLoggingOptions,
								);
							}
						},
					);

					// On tab disconnect, clean up listeners
					tabConnection.onDisconnect.addListener(() => {
						console.log(
							formatBackgroundScriptMessageForLogging(
								"Tab (Content Script) has disconnected. Closing associated Devtools connections.",
							),
						);
						devtoolsPort.disconnect();
						tabConnection = undefined;
					});
				},
				(error) => {
					console.error(
						formatBackgroundScriptMessageForLogging(
							"An error occurred while connecting to tab (CONTENT_SCRIPT):",
						),
						error,
					);
				},
			);

			// Bind disconnect listener so we can clean up our mapping appropriately
			devtoolsPort.onDisconnect.addListener(() => {
				console.log(
					formatBackgroundScriptMessageForLogging("Devtools Script has disconnected."),
				);
				tabConnection?.disconnect();
			});

			// Send acknowledgement to Devtools Script
			const ackMessage: DevToolsInitAcknowledgement = {
				source: devtoolsMessageSource,
				type: devToolsInitAcknowledgementType,
				data: undefined,
			};
			postMessageToPort(ackMessage, devtoolsPort, backgroundScriptMessageLoggingOptions);
		} else {
			// Relay message from the Devtools Script to the tab (Content script)
			if (tabConnection === undefined) {
				console.warn(
					formatBackgroundScriptMessageForLogging(
						`Tab connection has not been initialized. Cannot relay "${message.type}" message:`,
					),
					message,
				);
			} else {
				relayMessageToPort(
					message,
					"Background Script",
					tabConnection,
					backgroundScriptMessageLoggingOptions,
				);
			}
		}
	};

	devtoolsPort.onMessage.addListener(devtoolsMessageListener);
});
