/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import Proxyquire from "proxyquire";
import { createSandbox } from "sinon";

import { delay } from "@fluidframework/common-utils";

import { Globals } from "../utilities";
import { DevToolsInitMessage, extensionMessageSource } from "../messaging";
import { awaitListener, stubGlobals, stubPort } from "./Utilities";

const proxyquire = Proxyquire.noCallThru();

const backgroundScriptPath = "../background/BackgroundScript"; // Relative to this file

/**
 * Require the background script using the provided `browser` APIs.
 */
const loadBackgroundScript = (globals: Globals): void => {
	proxyquire(backgroundScriptPath, {
		"../utilities/Globals": {
			...globals,
		} as unknown,
	});
};

describe("Background script unit tests", () => {
	const globals = stubGlobals();
	const sandbox = createSandbox();

	afterEach(() => {
		sandbox.restore(); // TODO: reset?
	});

	it("Registers `onConnect` listener on load", async () => {
		const { browser } = globals;

		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		loadBackgroundScript(globals);

		const onConnect = await onConnectListenerPromise;

		expect(typeof onConnect).to.equal("function");
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
		): chrome.runtime.Port => {
			connectCalled = true;
			expect(_tabId).to.equal(tabId);
			expect(connectionInfo).to.deep.equal({ name: "Content Script" });
			return tabPort;
		};

		// Spy on script execution so we can detect when the Content script is connected to
		// const tabConnectScriptSpy = sandbox.spy(browser.tabs, "connect");

		// Inject our stubbed `onConnect`
		const onConnectListenerPromise = awaitListener(sandbox, browser.runtime.onConnect);

		// Load the background script (with stubbed `onConnect`)
		loadBackgroundScript(globals);

		// Wait for onConnect handler to be registered by background script
		const onConnect = await onConnectListenerPromise;

		// Inject our stubbed `onMessage` into the Port we will pass to the Background script
		const onMessageListenerPromise = awaitListener(sandbox, devtoolsPort.onMessage);

		// Simulate background script connection init from the devtools
		onConnect(devtoolsPort);

		const onMessage = await onMessageListenerPromise;

		// Simulate sending the init message from the devtools panel to the background script
		const devtoolsInitMessage: DevToolsInitMessage = {
			type: "initialize-devtools",
			data: {
				tabId,
			},
			source: extensionMessageSource,
		};
		onMessage(devtoolsInitMessage, devtoolsPort);

		expect(getCalled).to.be.true;

		// The background script calls `connect` in the continuation of a promise, so we need to delay to ensure
		// that continuation runs before we check if the stub was called.
		await delay(500);
		expect(connectCalled).to.be.true;
	});
});
