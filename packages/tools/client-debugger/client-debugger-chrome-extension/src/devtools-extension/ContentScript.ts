/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	debuggerMessageSource,
	IDebuggerMessage,
	isDebuggerMessage,
} from "@fluid-tools/client-debugger";
import { extensionMessageSource } from "../messaging";
import {
	contentScriptMessageLoggingOptions,
	formatContentScriptMessageForLogging,
} from "./content";

import { relayMessageToPort, relayMessageToWindow } from "./messaging";

/**
 * This module is the extension's Content Script.
 * It lives in the tab context alongside the page being communicated with.
 *
 * From an implementation perspective, this script strictly relays messages between the webpage
 * and the Background Script.
 *
 * TODO link to docs on Content script + Devtools extension flow
 */

// TODOs:
// - What is the lifetime of this? Lifetime of the page?

console.log(formatContentScriptMessageForLogging("Initializing Content Script."));

chrome.runtime.onConnect.addListener((backgroundPort: chrome.runtime.Port) => {
	console.log(formatContentScriptMessageForLogging("Connection added from Background Script."));

	/**
	 * Relay messages if they conform to our expected format.
	 */
	function relayMessageFromPageToBackground(event: MessageEvent): void {
		const message = event.data as Partial<IDebuggerMessage>;
		// Only relay message if it is one of ours, and if the source is the window's debugger
		// (and not a message originating from the extension).
		if (isDebuggerMessage(message) && message.source === debuggerMessageSource) {
			relayMessageToPort(
				message,
				"webpage",
				backgroundPort,
				contentScriptMessageLoggingOptions,
			);
		}
	}

	// Relay messages to the background worker as appropriate.
	globalThis.addEventListener("message", relayMessageFromPageToBackground);

	// Relay messages from the background service worker to the inspected window.
	backgroundPort.onMessage.addListener((message: Partial<IDebuggerMessage>) => {
		// Only relay message if it is one of ours, and if the source is the extension
		// (and not the window).
		if (isDebuggerMessage(message) && message.source === extensionMessageSource) {
			relayMessageToWindow(
				message,
				"background service worker",
				contentScriptMessageLoggingOptions,
			);
		}
	});

	// When the extension disconnects, clean up listeners.
	backgroundPort.onDisconnect.addListener(() => {
		// Unbind window listener
		globalThis.removeEventListener("message", relayMessageFromPageToBackground);
	});
});
