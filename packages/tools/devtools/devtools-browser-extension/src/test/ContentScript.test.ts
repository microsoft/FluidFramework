/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import Proxyquire from "proxyquire";
import { createSandbox } from "sinon";

import { Globals } from "../utilities";
import { awaitListener, stubGlobals, stubPort } from "./Utilities";

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
});
