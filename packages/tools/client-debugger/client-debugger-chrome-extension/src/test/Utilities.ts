/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JSDOM } from "jsdom";
import { SinonSandbox } from "sinon";

import { Globals } from "../utilities";

/**
 * Wait for a listener for the specified event to be registered.
 *
 * @remarks
 *
 * Note: This must be called *before* loading the background script
 * because listeners are registered during initialization.
 *
 * Note: The returned `Promise` must NOT be `await`ed until *after*
 * loading the background script otherwise it won't resolve.
 *
 * @returns `Promise` that resolves with the registered listener.
 */
export async function awaitListener<T>(
	sandbox: SinonSandbox,
	event: { addListener: (fn: T) => void },
): Promise<T> {
	return new Promise((resolve) => {
		console.log("Stubbing...");
		sandbox.stub(event, "addListener").get(() => {
			return (fn: T): void => {
				console.log("returning...");
				resolve(fn);
			};
		});
	});
}

/**
 * Create and return a newly stubbed `chrome.events.Event` registration type.
 * Gives each `chrome.events.Event` it's own set of registration stubs so
 * event registrations can be individually watched by tests.
 */
export function stubEvent(): chrome.events.Event<() => void> {
	return {
		addListener: () => {},
		removeListener: () => {},
	} as unknown as chrome.events.Event<() => void>;
}

/**
 * Stubs a Port for use in tests.
 */
export function stubPort(name: string): chrome.runtime.Port {
	return {
		name,
		postMessage: (): void => {},
		disconnect: (): void => {},
		onDisconnect: stubEvent(),
		onMessage: stubEvent(),
	};
}

/**
 * Create and return a newly stubbed global `browser` and `fetch` instances.
 * Gives each test it's own set of stubs for parallel execution.
 */
export function stubGlobals(dom?: JSDOM): Globals {
	const stubbedBrowser = {
		browserAction: { onClicked: stubEvent() },
		runtime: {
			onConnect: stubEvent(),
			onMessage: stubEvent(),
			sendMessage: (): void => {},
		},
		tabs: {
			executeScript: (): void => {},
			reload: (): void => {},
			sendMessage: (): void => {},
		},
		webNavigation: { onCommitted: stubEvent() },
	} as unknown as typeof chrome;

	return {
		browser: stubbedBrowser,
		document: dom ? dom.window.document : undefined,
		eval: dom ? dom.window.eval : undefined,
		fetch: (): void => {},
		location: dom ? dom.window.location : undefined,
		window: dom ? (dom.window as unknown as Window & typeof globalThis) : undefined,
	};
}
