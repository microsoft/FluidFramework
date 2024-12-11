/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/core-utils/internal";
import {
	CloseContainer,
	TelemetryEvent,
	devtoolsMessageSource,
} from "@fluidframework/devtools-core/internal";
import { expect } from "chai";
import { createSandbox } from "sinon";

import type { Globals } from "../Globals.js";
// eslint-disable-next-line import/no-internal-modules
import { runContentScript } from "../content/ContentScriptContent.js";
import { extensionViewMessageSource } from "../messaging/index.js";

import { awaitListener, stubGlobals, stubPort } from "./Utilities.js";

type Port = chrome.runtime.Port;

describe("Content Script unit tests", () => {
	const sandbox = createSandbox();
	let globals: Globals = stubGlobals();

	afterEach(() => {
		sandbox.reset();
		globals = stubGlobals(); // Reset globals to ensure test-local modifications are cleared
	});

	it("Registers `onConnect` listener on load", async () => {
		const { browser } = globals;

		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		runContentScript(browser, globals.window);

		const onConnectListener = await onConnectListenerPromise;

		expect(typeof onConnectListener).to.equal("function");
	});

	it("Binds Background Script and Window message listeners on connect.", async () => {
		const { browser } = globals;

		const backgroundPort = stubPort("background-port");

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the Content script (with stubbed `onConnect`)
		runContentScript(browser, globals.window);

		// Wait for onConnect handler to be registered by Content script
		const onConnectListener = await onConnectListenerPromise;

		// Inject our stubbed `onMessage` into the Background Script port we will pass to the Content script
		const onMessageListenerPromise = awaitListener(sandbox, backgroundPort.onMessage);

		// Simulate connection from Background Script.
		onConnectListener(backgroundPort);

		const onMessageListener = await onMessageListenerPromise;
		expect(typeof onMessageListener).to.equal("function");
	});

	interface StubbedConnection {
		backgroundPort: Port;
	}

	/**
	 * Initializes the Content script with a stubbed window and a stubbed Background script port.
	 * Returns the stubbed Background script port for interaction in tests.
	 */
	async function initializeContentScript(): Promise<StubbedConnection> {
		const { browser } = globals;

		const backgroundPort = stubPort("background-port");

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the Content script (with stubbed `onConnect`)
		runContentScript(browser, globals.window);

		// Wait for onConnect handler to be registered by Content script
		const connectFromBackground = await onConnectListenerPromise;
		expect(typeof connectFromBackground).to.equal("function");

		// Wait for the Content script to register `onMessage`  listener with the Background port.
		const backgroundOnMessageListenerPromise = awaitListener(
			sandbox,
			backgroundPort.onMessage,
		);

		// Simulate background script connection init from the devtools
		connectFromBackground(backgroundPort);

		const backgroundOnMessageListener = await backgroundOnMessageListenerPromise;
		expect(typeof backgroundOnMessageListener).to.equal("function");

		// Update our port stubs to correctly send messages to the Content script
		backgroundPort.postMessage = (message): void => {
			backgroundOnMessageListener(message, backgroundPort);
		};

		return { backgroundPort };
	}

	it("Forwards Devtools message from Window to Background script", async () => {
		const { window } = globals;

		const { backgroundPort } = await initializeContentScript();

		// Spy on the Background port's `postMessage` so we can later verify it was called.
		const backgroundPostMessageSpy = sandbox.spy(backgroundPort, "postMessage");

		// Post message from the Background script
		const windowMessage = {
			...TelemetryEvent.createMessage({} as unknown as TelemetryEvent.MessageData),
			source: devtoolsMessageSource,
		};
		window.postMessage(windowMessage, "*");

		// The window's `postMessage` method has async components, so we have to wait for the associated
		// continuations to run before we can verify the message was forwarded.
		await delay(500);

		// Verify that the message was forwarded to the Devtools port
		expect(backgroundPostMessageSpy.calledWith(windowMessage)).to.be.true;
	});

	it("Does not forward message with unrecognized source from Window to Background script", async () => {
		const { window } = globals;

		const { backgroundPort } = await initializeContentScript();

		// Spy on the Background port's `postMessage` so we can later verify it was called.
		const backgroundPostMessageSpy = sandbox.spy(backgroundPort, "postMessage");

		// Post message from the Tab
		const windowMessage = {
			data: "some-data",
			source: "unrecognized-source",
		};
		window.postMessage(windowMessage, "*");

		// The window's `postMessage` method has async components, so we have to wait for the associated
		// continuations to run before we can verify the message was forwarded.
		await delay(500);

		// Verify that the message was forwarded to the Devtools port
		expect(backgroundPostMessageSpy.called).to.be.false;
	});

	it("Forwards Devtools message from Background script to Window", async () => {
		const { window } = globals;

		const { backgroundPort } = await initializeContentScript();

		// Spy on the Window's `postMessage` so we can later verify it was called.
		const windowPostMessageSpy = sandbox.spy(window, "postMessage");

		// Post message from the Tab
		const backgroundMessage = {
			...CloseContainer.createMessage({} as unknown as CloseContainer.MessageData),
			source: extensionViewMessageSource,
		};
		backgroundPort.postMessage(backgroundMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(windowPostMessageSpy.calledWith(backgroundMessage)).to.be.true;
	});

	it("Does not forward message with unrecognized source from Background script to Window", async () => {
		const { window } = globals;

		const { backgroundPort } = await initializeContentScript();

		// Spy on the Window's `postMessage` so we can later verify it was called.
		const windowPostMessageSpy = sandbox.spy(window, "postMessage");

		// Post message from the Tab
		const backgroundMessage = {
			data: "some-data",
			source: "unrecognized-source",
		};
		backgroundPort.postMessage(backgroundMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(windowPostMessageSpy.called).to.be.false;
	});
});
