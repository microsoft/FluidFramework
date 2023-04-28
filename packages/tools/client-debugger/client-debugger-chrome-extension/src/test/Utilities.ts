/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SinonSandbox } from "sinon";

import { Globals } from "../utilities";

/**
 * Wait for a listener to be registered for the specified event.
 *
 * @remarks
 *
 * Notes:
 *
 * * This must be called **before** running the logic that is expected to register the listener.
 * Otherwise, the opportunity to intercept the registration is missed.
 *
 * * The returned promise must be awaited **after** running the logic that is expected to register the listener.
 *
 * The returned promise will only resolve if and when a listener is registered for the specified event.
 * If awaited in a test, the test will time out if no listener is registered.
 *
 * @returns `Promise` that resolves when a listener is registered, returning that listener callback.
 */
export async function awaitListener<T>(
	sandbox: SinonSandbox,
	event: { addListener: (fn: T) => void },
): Promise<T> {
	return new Promise((resolve) => {
		sandbox.stub(event, "addListener").get(() => {
			return (fn: T): void => {
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
export function stubGlobals(): Globals {
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
			connect: (): void => {},
			get: async (): Promise<void> => {},
		},
		webNavigation: { onCommitted: stubEvent() },
	} as unknown as typeof chrome;

	return {
		browser: stubbedBrowser,
	};
}
