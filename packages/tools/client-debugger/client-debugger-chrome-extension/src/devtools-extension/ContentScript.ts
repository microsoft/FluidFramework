/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";
import { relayMessageToWindow, relayMessageToPort, isValidDebuggerMessage } from "./messaging";

/**
 * This module is the extension's Content Script.
 * It lives in the tab context alongside the page being communicated with.
 *
 * From an implementation perspective, this script strictly relays messages between the page and the Background Script.
 * The Background Script is then responsible for relaying messages between this script and the Devtools script.
 * We do not do any rendering to the page, nor do we directly analyze any page contents.
 * All interaction with the page is done via message passing.
 *
 * TODO link to docs on Content script + Devtools extension flow
 */

// TODOs:
// - Document messaging relationship
// - Perform event source validation?
// - Dedupe logging functionality with other scripts

/**
 * Context string for logging.
 */
const loggingContext = "EXTENSION(CONTENT)";

/**
 * Configuration for console logging.
 */
const messageLoggingOptions: MessageLoggingOptions = {
	context: loggingContext,
};

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
		if (isValidDebuggerMessage(message)) {
			relayMessageToPort(message, "page", port, messageLoggingOptions);
		}
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
