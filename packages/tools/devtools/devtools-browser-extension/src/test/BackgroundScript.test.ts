/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import Proxyquire from "proxyquire";
import { createSandbox } from "sinon";

import { delay } from "@fluidframework/core-utils";
import {
	CloseContainer,
	TelemetryEvent,
	devtoolsMessageSource,
} from "@fluid-experimental/devtools-core";

import { type Globals } from "../Globals";
import { type DevToolsInitMessage, extensionMessageSource } from "../messaging";
import { awaitListener, stubGlobals, stubPort } from "./Utilities";

type Port = chrome.runtime.Port;

const proxyquire = Proxyquire.noCallThru();

const backgroundScriptPath = "../background/BackgroundScript"; // Relative to this file
const globalsModulePath = "../Globals"; // Relative to this file

/**
 * Require the background script using the provided `browser` APIs.
 */
const loadBackgroundScript = (globals: Globals): void => {
	proxyquire(backgroundScriptPath, {
		[globalsModulePath]: {
			...globals,
		} as unknown,
	});
};

describe("Background Script unit tests", () => {
	const sandbox = createSandbox();

	let globals: Globals = stubGlobals();

	afterEach(() => {
		sandbox.reset();
		globals = stubGlobals(); // Reset globals to ensure test-local modifications are cleared
	});

	it("Registers `onConnect` listener on load", async () => {
		const { browser } = globals;

		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		loadBackgroundScript(globals);

		const onConnectListener = await onConnectListenerPromise;

		expect(typeof onConnectListener).to.equal("function");
	});

	it("Injects connects to the Content script upon initialization from Devtools script.", async () => {
		const { browser } = globals;
		const tabId = 37;

		const devtoolsPort = stubPort("devtools-port");
		const tabPort = stubPort("tab-port");

		// Stub out necessary `tabs` calls for the Background script
		let getCalled = false;
		browser.tabs.get = async (_tabId: number): Promise<chrome.tabs.Tab> => {
			getCalled = true;
			expect(_tabId).to.equal(tabId);
			return {
				id: tabId,
			} as unknown as chrome.tabs.Tab;
		};

		let connectCalled = false;
		browser.tabs.connect = (
			_tabId: number,
			connectionInfo: chrome.tabs.ConnectInfo | undefined,
		): Port => {
			connectCalled = true;
			expect(_tabId).to.equal(tabId);
			expect(connectionInfo).to.deep.equal({ name: "Content Script" });
			return tabPort;
		};

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the background script (with stubbed `onConnect`)
		loadBackgroundScript(globals);

		// Wait for onConnect handler to be registered by background script
		const onConnectListener = await onConnectListenerPromise;

		// Inject our stubbed `onMessage` into the Port we will pass to the Background script
		const onMessageListenerPromise = awaitListener(sandbox, devtoolsPort.onMessage);

		// Simulate background script connection init from the devtools
		onConnectListener(devtoolsPort);

		const onMessageListener = await onMessageListenerPromise;

		// Simulate sending the init message from the devtools panel to the background script
		const devtoolsInitMessage: DevToolsInitMessage = {
			type: "initialize-devtools",
			data: {
				tabId,
			},
			source: extensionMessageSource,
		};
		onMessageListener(devtoolsInitMessage, devtoolsPort);

		expect(getCalled).to.be.true;

		// The background script calls `connect` in the continuation of a promise, so we need to delay to ensure
		// that continuation runs before we check if the stub was called.
		await delay(500);
		expect(connectCalled).to.be.true;
	});

	interface StubbedConnection {
		devtoolsPort: Port;
		tabPort: Port;
	}

	/**
	 * Initializes the Background script with stubbed Content and Devtools script ports.
	 * Returns the stubbed ports for interaction in tests.
	 */
	async function initializeBackgroundScript(): Promise<StubbedConnection> {
		const { browser } = globals;

		const tabId = 37;
		const tabPort = stubPort("tab-port");

		const devtoolsPort = stubPort("devtools-port");

		// Stub out necessary `tabs` calls for the Background script
		browser.tabs.get = async (_tabId: number): Promise<chrome.tabs.Tab> => {
			return {
				id: tabId,
			} as unknown as chrome.tabs.Tab;
		};

		browser.tabs.connect = (_tabId: number): Port => {
			return tabPort;
		};

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the background script (with stubbed `onConnect`)
		loadBackgroundScript(globals);

		// Wait for onConnect handler to be registered by background script
		const connectFromDevtools = await onConnectListenerPromise;
		expect(typeof connectFromDevtools).to.equal("function");

		// Wait for the Background script to register `onMessage`  listener with the Devtools port.
		const onMessageFromDevtoolsListenerPromise = awaitListener(sandbox, devtoolsPort.onMessage);

		// Simulate background script connection init from the devtools
		connectFromDevtools(devtoolsPort);

		const sendMessageFromDevtools = await onMessageFromDevtoolsListenerPromise;
		expect(typeof sendMessageFromDevtools).to.equal("function");

		// Wait for the Background script to register `onMessage`  listener with the Tab port.
		const onMessageFromTabListenerPromise = awaitListener(sandbox, tabPort.onMessage);

		// Simulate sending the init message from the devtools panel to the background script.
		const devtoolsInitMessage: DevToolsInitMessage = {
			type: "initialize-devtools",
			data: {
				tabId,
			},
			source: extensionMessageSource,
		};
		sendMessageFromDevtools(devtoolsInitMessage, devtoolsPort);

		const sendMessageFromTab = await onMessageFromTabListenerPromise;
		expect(typeof sendMessageFromTab).to.equal("function");

		// Update our port stubs to correctly send messages to the Background script
		devtoolsPort.postMessage = (message): void => {
			sendMessageFromDevtools(message, devtoolsPort);
		};
		tabPort.postMessage = (message): void => {
			sendMessageFromTab(message, tabPort);
		};

		return {
			devtoolsPort,
			tabPort,
		};
	}

	it("Forwards Devtools message from Tab to Devtools script", async () => {
		const { devtoolsPort, tabPort } = await initializeBackgroundScript();

		// Spy on the Devtools port's `postMessage` so we can later verify it was called.
		const devtoolsPostMessageSpy = sandbox.spy(devtoolsPort, "postMessage");

		// Post message from the Tab
		const tabMessage = {
			...TelemetryEvent.createMessage({} as unknown as TelemetryEvent.MessageData),
			source: devtoolsMessageSource,
		};
		tabPort.postMessage(tabMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(devtoolsPostMessageSpy.calledWith(tabMessage)).to.be.true;
	});

	it("Does not forward message with unrecognized source from Tab to Devtools script", async () => {
		const { devtoolsPort, tabPort } = await initializeBackgroundScript();

		// Spy on the Devtools port's `postMessage` so we can later verify if it was called.
		const devtoolsPostMessageSpy = sandbox.spy(devtoolsPort, "postMessage");

		// Post message from the Tab
		const tabMessage = {
			data: "some-data",
			source: "unrecognized-source",
		};
		tabPort.postMessage(tabMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(devtoolsPostMessageSpy.called).to.be.false;
	});

	it("Forwards Devtools message from Devtools script to Tab", async () => {
		const { devtoolsPort, tabPort } = await initializeBackgroundScript();

		// Spy on the Devtools port's `postMessage` so we can later verify it was called.
		const tabPostMessageSpy = sandbox.spy(tabPort, "postMessage");

		// Post message from the Tab
		const devtoolsMessage = {
			...CloseContainer.createMessage({} as unknown as CloseContainer.MessageData),
			source: extensionMessageSource,
		};
		devtoolsPort.postMessage(devtoolsMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(tabPostMessageSpy.calledWith(devtoolsMessage)).to.be.true;
	});

	it("Does not forward message with unrecognized source from Devtools script to Tab", async () => {
		const { devtoolsPort, tabPort } = await initializeBackgroundScript();

		// Spy on the Devtools port's `postMessage` so we can later verify if it was called.
		const tabPostMessageSpy = sandbox.spy(tabPort, "postMessage");

		// Post message from the Tab
		const devtoolsMessage = {
			data: "some-data",
			source: "unrecognized-source",
		};
		devtoolsPort.postMessage(devtoolsMessage);

		// Verify that the message was forwarded to the Devtools port
		expect(tabPostMessageSpy.called).to.be.false;
	});
});
