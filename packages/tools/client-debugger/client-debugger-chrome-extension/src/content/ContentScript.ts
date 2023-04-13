/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	devtoolsMessageSource,
	ISourcedDevtoolsMessage,
	isDebuggerMessage,
} from "@fluid-tools/client-debugger";

import { extensionMessageSource, relayMessageToPort, relayMessageToWindow } from "../messaging";
import {
	contentScriptMessageLoggingOptions,
	formatContentScriptMessageForLogging,
} from "./Logging";

/**
 * This module is the extension's Content Script.
 * It lives in the tab context, alongside the page being communicated with.
 *
 * The lifetime of the script itself is roughly the same as the lifetime of the tab, but in our case it
 * doesn't do anything until it is activated by the Background Worker.
 *
 * Once initialized, this script relays messages between the tab and the Background Worker, which in turn communicates
 * with the Devtools extension.
 *
 * For an overview of how the various scripts communicate in the Devtools extension model,
 * see {@link https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools | here}.
 */

console.log(formatContentScriptMessageForLogging("Initializing Content Script."));

// Only establish messaging when activated by the Background Worker.
chrome.runtime.onConnect.addListener((backgroundPort: chrome.runtime.Port) => {
	console.log(formatContentScriptMessageForLogging("Connection added from Background Worker."));

	/**
	 * Relay messages if they conform to our expected format.
	 */
	function relayMessageFromPageToBackground(
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void {
		const message = event.data;

		// Only relay message if it is one of ours, and if the source is the window's debugger
		// (and not a message originating from the extension).
		if (isDebuggerMessage(message) && message.source === devtoolsMessageSource) {
			relayMessageToPort(
				message,
				"webpage",
				backgroundPort,
				contentScriptMessageLoggingOptions,
			);
		}
	}

	// Relay messages to the Background Worker as appropriate.
	globalThis.addEventListener("message", relayMessageFromPageToBackground);

	// Relay messages from the Background Worker to the inspected window.
	backgroundPort.onMessage.addListener((message: Partial<ISourcedDevtoolsMessage>) => {
		// Only relay message if it is one of ours, and if the source is the extension
		// (and not the window).
		if (isDebuggerMessage(message) && message.source === extensionMessageSource) {
			relayMessageToWindow(
				message,
				"Background Worker worker",
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
