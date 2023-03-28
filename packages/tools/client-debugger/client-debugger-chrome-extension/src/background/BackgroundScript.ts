/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISourcedDebuggerMessage, isDebuggerMessage } from "@fluid-tools/client-debugger";

import {
	DevToolsInitAcknowledgement,
	devToolsInitAcknowledgementType,
	DevToolsInitMessage,
	devToolsInitMessageType,
	extensionMessageSource,
	postMessageToPort,
	relayMessageToPort,
} from "../messaging";
import {
	backgroundScriptMessageLoggingOptions,
	formatBackgroundScriptMessageForLogging,
} from "./Logging";

/**
 * This script runs as the extension's Background Worker.
 * It has no direct access to the page or any of its resources.
 * It runs automatically in the background, and only a single instance is run by the browser, regardless of how
 * many open tabs are running the extension (i.e. how many instances of the extension's DevtoolsScript are running).
 *
 * While the script itself runs as soon as the Browser is launched (post installation), it will not begin relaying
 * any messages until the Devtools Script sends it a connection request. After connecting, the Devtools Script
 * is required to provide the `tabID` of the webpage it is inspecting. From that point forward, this script
 * relays messages between the webpage (via our injected Content Script), and the Devtools Script.
 *
 * For an overview of how the various scripts communicate in the Devtools extension model,
 * see {@link https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools | here}.
 */

console.log(formatBackgroundScriptMessageForLogging("Initializing Background Worker."));

// Only establish messaging when activated by the Devtools Script.
chrome.runtime.onConnect.addListener((devtoolsPort: chrome.runtime.Port): void => {
	// Note: this is captured by the devtoolsMessageListener lambda below.
	let tabConnection: chrome.runtime.Port | undefined;

	/**
	 * Listen for init messages from the Devtools Script, and instantiate tab (Content Script)
	 * connections as needed.
	 */
	const devtoolsMessageListener = (message: Partial<ISourcedDebuggerMessage>): void => {
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
						(tabMessage: Partial<ISourcedDebuggerMessage>): void => {
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
				source: extensionMessageSource,
				type: devToolsInitAcknowledgementType,
				data: undefined,
			};
			postMessageToPort(ackMessage, devtoolsPort, backgroundScriptMessageLoggingOptions);
		} else {
			// Relay message from the Devtools Script to the tab (Content script)
			if (tabConnection === undefined) {
				console.warn(
					formatBackgroundScriptMessageForLogging(
						`Tab connection has not been initialized. Cannot relay message:`,
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
