/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import Proxyquire from "proxyquire";
import { createSandbox } from "sinon";

import { delay } from "@fluidframework/common-utils";
import { TelemetryEvent, devtoolsMessageSource } from "@fluid-experimental/devtools-core";

import { Globals } from "../utilities";
import { awaitListener, stubGlobals, stubPort } from "./Utilities";

type Port = chrome.runtime.Port;

const proxyquire = Proxyquire.noCallThru();

const contentScriptPath = "../content/ContentScript"; // Relative to this file
const globalsModulePath = "../utilities/Globals"; // Relative to this file

/**
 * Require the background script using the provided `browser` APIs.
 */
const loadContentScript = (globals: Globals): void => {
	proxyquire(contentScriptPath, {
		[globalsModulePath]: {
			...globals,
		} as unknown,
	});
};

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

		loadContentScript(globals);

		const onConnectListener = await onConnectListenerPromise;

		expect(typeof onConnectListener).to.equal("function");
	});

	// TODO: verify window.addMessageListener
	it("Binds `onMessage` listener to Background Script port on connect.", async () => {
		const { browser } = globals;

		const backgroundPort = stubPort("background-port");

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the Content script (with stubbed `onConnect`)
		loadContentScript(globals);

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
		loadContentScript(globals);

		// Wait for onConnect handler to be registered by Content script
		const connectFromBackground = await onConnectListenerPromise;
		expect(typeof connectFromBackground).to.equal("function");

		// Wait for the Content script to register `onMessage`  listener with the Background port.
		const onMessageFromBackgroundListenerPromise = awaitListener(
			sandbox,
			backgroundPort.onMessage,
		);

		// Simulate background script connection init from the devtools
		connectFromBackground(backgroundPort);

		const sendMessageFromBackground = await onMessageFromBackgroundListenerPromise;
		expect(typeof sendMessageFromBackground).to.equal("function");

		// Update our port stubs to correctly send messages to the Content script
		backgroundPort.postMessage = (message): void => {
			console.log("I was called! Yay!");
			sendMessageFromBackground(message, backgroundPort);
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

	it("Does not forward message with unrecognized source from Tab to Devtools script", async () => {
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

	// it("Forwards Devtools message from Devtools script to Tab", async () => {
	// 	const { backgroundPort } = await initializeContentScript();

	// 	// Spy on the Devtools port's `postMessage` so we can later verify it was called.
	// 	const tabPostMessageSpy = sandbox.spy(tabPort, "postMessage");

	// 	// Post message from the Tab
	// 	const devtoolsMessage = {
	// 		...CloseContainer.createMessage({} as unknown as CloseContainer.MessageData),
	// 		source: extensionMessageSource,
	// 	};
	// 	devtoolsPort.postMessage(devtoolsMessage);

	// 	// Verify that the message was forwarded to the Devtools port
	// 	expect(tabPostMessageSpy.calledWith(devtoolsMessage)).to.be.true;
	// });

	// it("Does not forward message with unrecognized source from Devtools script to Tab", async () => {
	// 	const { backgroundPort } = await initializeContentScript();

	// 	// Spy on the Devtools port's `postMessage` so we can later verify if it was called.
	// 	const tabPostMessageSpy = sandbox.spy(tabPort, "postMessage");

	// 	// Post message from the Tab
	// 	const devtoolsMessage = {
	// 		data: "some-data",
	// 		source: "unrecognized-source",
	// 	};
	// 	devtoolsPort.postMessage(devtoolsMessage);

	// 	// Verify that the message was forwarded to the Devtools port
	// 	expect(tabPostMessageSpy.called).to.be.false;
	// });

	// TODO: test teardown
});
