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

	// it("Retries injecting the content script if it fails.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 7;

	// 	let first = true;

	// 	browser.tabs.executeScript = ((
	// 		tabId: number,
	// 		details: chrome.tabs.InjectDetails,
	// 		callback?: (result: any[]) => void,
	// 	) => {
	// 		setTimeout(() => {
	// 			if (first) {
	// 				first = false;
	// 				callback!([]); // Callback with empty array on first try to simulate failure.
	// 			} else {
	// 				callback!([{}]); // Callback with array containing an object to simulate success.
	// 			}
	// 		}, 0);
	// 	}) as any;

	// 	const executeScriptSpy = sandbox.spy(browser.tabs, "executeScript");
	// 	const injectContentScript = prepareContentScriptInjection(sandbox, browser);

	// 	loadBackgroundScript(globals);

	// 	await injectContentScript(tabId);

	// 	t.true(executeScriptSpy.calledOnce);
	// 	t.is(executeScriptSpy.firstCall.args[0], tabId);
	// 	t.is(executeScriptSpy.firstCall.args[1].file, contentScriptPath);
	// 	t.is(executeScriptSpy.firstCall.args[1].runAt, "document_start");

	// 	sandbox.restore();
	// });

	// it("Passes provided configuration to the content script.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 7;
	// 	const config: Config = {
	// 		browserslist: "default",
	// 		disabledCategories: ["accessibility"],
	// 		ignoredUrls: "google-analytics.com",
	// 	};

	// 	const sendMessageSpy = sandbox.spy(browser.tabs, "sendMessage");
	// 	const onMessagePromise = awaitListener(sandbox, browser.runtime.onMessage);

	// 	loadBackgroundScript(globals);

	// 	const onMessage = await onMessagePromise;

	// 	// Simulate receiving `Events.enable` from the devtools panel.
	// 	onMessage({ enable: { config }, tabId } as Events, {} as any, () => {});

	// 	// Simulate receiving `Events.requestConfig` from the content script.
	// 	onMessage({ requestConfig: true }, { tab: { id: tabId } } as any, () => {});

	// 	t.true(sendMessageSpy.calledOnce);
	// 	t.is(sendMessageSpy.firstCall.args[0], tabId);
	// 	t.is((sendMessageSpy.firstCall.args[1] as any).config, config);

	// 	sandbox.restore();
	// });

	// it("Forwards `fetch::*` events from the devtools panel.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 7;
	// 	const fetchStart = {} as FetchStart;
	// 	const fetchEnd = {} as FetchEnd;

	// 	const sendMessageSpy = sandbox.spy(browser.tabs, "sendMessage");
	// 	const onMessagePromise = awaitListener(sandbox, browser.runtime.onMessage);

	// 	loadBackgroundScript(globals);

	// 	const onMessage = await onMessagePromise;

	// 	// Simulate receiving `Events.ready` from the content script to ensure events are NOT queued.
	// 	onMessage({ ready: true }, { tab: { id: tabId } } as any, () => {});

	// 	// Simulate receiving `Events.fetchStart` from the devtools panel.
	// 	onMessage({ fetchStart, tabId }, {} as any, () => {});

	// 	// Simulate receiving `Events.fetchEnd` from the devtools panel.
	// 	onMessage({ fetchEnd, tabId }, {} as any, () => {});

	// 	t.true(sendMessageSpy.calledTwice);
	// 	t.is(sendMessageSpy.firstCall.args[0], tabId);
	// 	t.is((sendMessageSpy.firstCall.args[1] as any).fetchStart, fetchStart);
	// 	t.is(sendMessageSpy.secondCall.args[0], tabId);
	// 	t.is((sendMessageSpy.secondCall.args[1] as any).fetchEnd, fetchEnd);

	// 	sandbox.restore();
	// });

	// it("Sends queued events in response to `ready`.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 9;
	// 	const fetchStart = {} as FetchStart;

	// 	const sendMessageSpy = sandbox.spy(browser.tabs, "sendMessage");
	// 	const onMessagePromise = awaitListener(sandbox, browser.runtime.onMessage);

	// 	loadBackgroundScript(globals);

	// 	const onMessage = await onMessagePromise;

	// 	// Simulate receiving `Events.fetchStart` from the devtools panel.
	// 	onMessage({ fetchStart, tabId }, {} as any, () => {});

	// 	t.true(sendMessageSpy.notCalled, "Events were not queued");

	// 	// Simulate receiving `Events.ready` to trigger receiving queued events.
	// 	onMessage({ ready: true }, { tab: { id: tabId } } as any, () => {});

	// 	t.true(sendMessageSpy.calledOnce, "Queued events were not sent");
	// 	t.is(sendMessageSpy.firstCall.args[0], tabId);
	// 	t.is((sendMessageSpy.firstCall.args[1] as any).fetchStart, fetchStart);

	// 	sandbox.restore();
	// });

	// it("Forwards results to the devtools panel.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 3;
	// 	const results: Results = { categories: [], url: "" };

	// 	const port: chrome.runtime.Port = {
	// 		name: `${tabId}`,
	// 		onMessage: stubEvent(),
	// 		postMessage: () => {},
	// 	} as any;

	// 	const postMessageSpy = sandbox.spy(port, "postMessage");

	// 	const onConnectPromise = awaitListener(sandbox, browser.runtime.onConnect);
	// 	const onMessagePromise = awaitListener(sandbox, browser.runtime.onMessage);

	// 	loadBackgroundScript(globals);

	// 	const [onConnect, onMessage] = await Promise.all([onConnectPromise, onMessagePromise]);

	// 	// Simulate receiving `runtime.onConnect` from the devtools panel.
	// 	onConnect(port);

	// 	// Simulate receiving `Events.results` from the content script.
	// 	onMessage({ results }, { tab: { id: tabId } } as any, () => {});

	// 	t.true(postMessageSpy.calledOnce);
	// 	t.is((postMessageSpy.firstCall.args[0] as any).results, results);

	// 	sandbox.restore();
	// });

	// it("Ignores results without a devtools panel.", async () => {
	// 	const sandbox = createSandbox();
	// 	const globals = stubGlobals();
	// 	const { browser } = globals;
	// 	const tabId = 1;
	// 	const results: Results = { categories: [], url: "" };

	// 	const port: chrome.runtime.Port = {
	// 		name: `${tabId + 1}`, // Chose a different tabId so we should NOT receive results.
	// 		onMessage: stubEvent(),
	// 		postMessage: () => {},
	// 	} as any;

	// 	const postMessageSpy = sandbox.spy(port, "postMessage");

	// 	const onConnectPromise = awaitListener(sandbox, browser.runtime.onConnect);
	// 	const onMessagePromise = awaitListener(sandbox, browser.runtime.onMessage);

	// 	loadBackgroundScript(globals);

	// 	const [onConnect, onMessage] = await Promise.all([onConnectPromise, onMessagePromise]);

	// 	// Simulate receiving `runtime.onConnect` from the devtools panel.
	// 	onConnect(port);

	// 	// Simulate receiving `Events.results` from the content script.
	// 	onMessage({ results }, { tab: { id: tabId } } as any, () => {});

	// 	t.true(postMessageSpy.notCalled);

	// 	sandbox.restore();
	// });
});
