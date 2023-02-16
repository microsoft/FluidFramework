/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";
import { relayMessageToWindow, relayMessageToPort, isValidDebuggerMessage } from "./messaging";

// TODOs:
// - Document messaging relationship
// - Perform event source validation?

const loggingContext = "EXTENSION(CONTENT)";

const messageLoggingOptions: MessageLoggingOptions = {
	context: loggingContext,
};

function formatForLogging(text: string): string {
	return `${loggingContext}: ${text}`;
}

/**
 * This script is injected into the inspected window and receives any messages from the window.
 * This script relays messages between the inspected window and the background worker.
 */
chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
	/**
	 * Relay messages if they conform to our expected format.
	 */
	function relayMessageFromPageToBackground(event: MessageEvent): void {
		const message = event.data as Partial<IDebuggerMessage>;
		if (!isValidDebuggerMessage(message)) {
			console.error(
				formatForLogging("Received malformed message from Devtools script:"),
				message,
			);
			return;
		}
		relayMessageToPort(message, "page", port, messageLoggingOptions);
	}

	// Relay messages to the background worker as appropriate.
	window.addEventListener("message", relayMessageFromPageToBackground, {
		capture: false,
		once: false,
		passive: true,
	});

	// Relay messages from the background service worker to the inspected window.
	port.onMessage.addListener((message: IDebuggerMessage) => {
		// Note: validation of the message should not be needed here since we're listening on the specific port.
		relayMessageToWindow(message, "background service worker", messageLoggingOptions);
	});

	// When the extension disconnects, clean up listeners.
	port.onDisconnect.addListener(() => {
		window.removeEventListener("message", relayMessageFromPageToBackground);
	});
});
