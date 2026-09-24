/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { CdpClient, navigateToPage } from "./chromium.mjs";

/** Supplies controlled CDP responses without a browser or navigation timing assumptions. */
async function fixture(context, timeoutMilliseconds = 1000) {
	const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
	const commands = [];
	let socket;
	class Socket extends EventTarget {
		static OPEN = 1;
		readyState = Socket.OPEN;

		constructor() {
			super();
			socket = this;
			queueMicrotask(() => this.dispatchEvent(new Event("open")));
		}

		send(data) {
			const command = JSON.parse(data);
			commands.push(command);
			if (command.method !== "Page.navigate") {
				this.message({ id: command.id, result: {} });
			}
		}

		message(value) {
			this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
		}

		close() {
			this.readyState = 3;
			this.dispatchEvent(new Event("close"));
		}
	}
	Object.defineProperty(globalThis, "WebSocket", { value: Socket, configurable: true });
	const client = new CdpClient("ws://fixture.invalid", timeoutMilliseconds);
	context.after(() => {
		client.close();
		Object.defineProperty(globalThis, "WebSocket", original);
	});
	await client.ready();
	const ready = (loaderId = "new-loader", frameId = "main-frame") =>
		socket.message({
			method: "Page.lifecycleEvent",
			params: { name: "DOMContentLoaded", frameId, loaderId },
		});
	const respondToNavigation = (result = { frameId: "main-frame", loaderId: "new-loader" }) => {
		const command = commands.find(({ method }) => method === "Page.navigate");
		assert.ok(command, "navigation must be sent before its response");
		socket.message({ id: command.id, result });
	};
	return { client, commands, socket, ready, respondToNavigation };
}

test("evaluation waits for the requested document, not old or unrelated contexts", async (context) => {
	const { client, commands, ready, respondToNavigation } = await fixture(context);
	await client.send("Profiler.start");
	ready("old-loader");
	const evaluation = navigateToPage(client, "https://fixture.invalid/new").then(() =>
		client.send("Runtime.evaluate", { expression: "document.title" }),
	);
	await setImmediate();
	assert.deepEqual(
		commands.map(({ method }) => method),
		["Profiler.start", "Page.enable", "Page.setLifecycleEventsEnabled", "Page.navigate"],
	);
	respondToNavigation();
	await setImmediate();
	assert.equal(
		commands.some(({ method }) => method === "Runtime.evaluate"),
		false,
	);
	ready("old-loader");
	ready("new-loader", "unrelated-frame");
	await setImmediate();
	assert.equal(
		commands.some(({ method }) => method === "Runtime.evaluate"),
		false,
	);
	ready();
	await evaluation;
	assert.equal(commands.at(-1).method, "Runtime.evaluate");
	assert.equal(client.eventWaiters.size, 0);
});

test("document readiness arriving before the navigation response is retained", async (context) => {
	const { client, ready, respondToNavigation } = await fixture(context);
	const navigation = navigateToPage(client, "https://fixture.invalid/new");
	await setImmediate();
	ready();
	respondToNavigation();
	await navigation;
	assert.equal(client.eventWaiters.size, 0);
});

test("missing document readiness times out and clears its waiter", async (context) => {
	const { client, respondToNavigation } = await fixture(context, 500);
	const rejected = assert.rejects(
		navigateToPage(client, "https://fixture.invalid/new"),
		/timed out awaiting CDP event Page.lifecycleEvent/,
	);
	await setImmediate();
	respondToNavigation();
	await rejected;
	assert.equal(client.eventWaiters.size, 0);
});

test("closing CDP rejects a pending document wait and clears its timer", async (context) => {
	const { client, respondToNavigation } = await fixture(context);
	const rejected = assert.rejects(
		navigateToPage(client, "https://fixture.invalid/new"),
		/CDP client closed/,
	);
	await setImmediate();
	respondToNavigation();
	await setImmediate();
	assert.equal(client.eventWaiters.size, 1);
	client.close();
	await rejected;
	assert.equal(client.eventWaiters.size, 0);
});

test("failed navigation rejects before evaluation", async (context) => {
	const { client, commands, respondToNavigation } = await fixture(context);
	const rejected = assert.rejects(
		navigateToPage(client, "https://fixture.invalid/new").then(() =>
			client.send("Runtime.evaluate"),
		),
		/Chromium navigation failed: net::ERR_CONNECTION_REFUSED/,
	);
	await setImmediate();
	respondToNavigation({ errorText: "net::ERR_CONNECTION_REFUSED" });
	await rejected;
	assert.equal(
		commands.some(({ method }) => method === "Runtime.evaluate"),
		false,
	);
	assert.equal(client.eventWaiters.size, 0);
});
