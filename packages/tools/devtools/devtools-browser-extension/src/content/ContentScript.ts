/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	devtoolsMessageSource,
	type ISourcedDevtoolsMessage,
	isDevtoolsMessage,
} from "@fluid-experimental/devtools-core";

import { browser, window } from "../Globals";
import { extensionMessageSource, relayMessageToPort } from "../messaging";
import {
	contentScriptMessageLoggingOptions,
	formatContentScriptMessageForLogging,
} from "./Logging";

type Port = chrome.runtime.Port;

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

// `window` should always be defined in the Content script context.
if (window === undefined) {
	throw new Error("Window object is not defined.");
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Only establish messaging when activated by the Background Worker.
browser.runtime.onConnect.addListener((backgroundPort: Port) => {
	console.log(formatContentScriptMessageForLogging("Connection added from Background Worker."));

	/**
	 * Relay messages if they conform to our expected format.
	 */
	function relayMessageFromPageToBackground(
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void {
		const message = event.data;

		// Only relay message if it is one of ours, and if the source is the window's Devtools instance
		// (and not a message originating from the extension).
		if (isDevtoolsMessage(message) && message.source === devtoolsMessageSource) {
			relayMessageToPort(
				message,
				"webpage",
				backgroundPort,
				contentScriptMessageLoggingOptions,
			);
		}
	}

	// Relay messages to the Background Worker as appropriate.
	window!.addEventListener("message", relayMessageFromPageToBackground);

	// Relay messages from the Background Worker to the inspected window.
	backgroundPort.onMessage.addListener((message: Partial<ISourcedDevtoolsMessage>) => {
		// Only relay message if it is one of ours, and if the source is the extension
		// (and not the window).
		if (isDevtoolsMessage(message) && message.source === extensionMessageSource) {
			console.debug(
				formatContentScriptMessageForLogging(
					`Relaying message from Background Script to the window:`,
				),
				message,
			);
			window!.postMessage(message, "*");
		}
	});

	// When the extension disconnects, clean up listeners.
	backgroundPort.onDisconnect.addListener(() => {
		// Unbind window listener
		window!.removeEventListener("message", relayMessageFromPageToBackground);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
