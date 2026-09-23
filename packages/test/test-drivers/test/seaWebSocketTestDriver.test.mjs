/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createFluidTestDriver, DriverApi } from "../lib/factory.js";
import { SeaWebSocketTestDriver } from "../lib/seaWebSocketTestDriver.js";

test("default selection remains local and does not initialize SEA WASM", async () => {
	const instantiate = WebAssembly.instantiate;
	const compile = WebAssembly.compile;
	WebAssembly.instantiate = async () => {
		throw new Error("unexpected WASM initialization");
	};
	WebAssembly.compile = async () => {
		throw new Error("unexpected WASM compilation");
	};
	let driver;
	try {
		driver = await createFluidTestDriver();
		assert.equal(driver.type, "local");
	} finally {
		driver?.dispose();
		WebAssembly.instantiate = instantiate;
		WebAssembly.compile = compile;
	}
});

test("SEA refuses a historical driver API instead of silently using the current one", async () => {
	await assert.rejects(
		createFluidTestDriver("sea-websocket", undefined, {
			...DriverApi,
			LocalDriverApi: { ...DriverApi.LocalDriverApi, version: "0.0.0" },
		}),
		/require the current driver version/,
	);
});

test("SEA selection requires an explicit endpoint and never falls back", async () => {
	const previous = process.env.SEA_TEST_WEBSOCKET_URL;
	delete process.env.SEA_TEST_WEBSOCKET_URL;
	try {
		await assert.rejects(
			createFluidTestDriver("sea-websocket"),
			/SEA_TEST_WEBSOCKET_URL is required/,
		);
	} finally {
		if (previous !== undefined) process.env.SEA_TEST_WEBSOCKET_URL = previous;
	}
});

test("SEA resolver retains assigned identities and relative paths", async () => {
	const driver = new SeaWebSocketTestDriver("ws://127.0.0.1:12345/sea/websocket");
	const resolver = driver.createUrlResolver();
	assert.deepEqual(
		driver.createCreateNewRequest("same"),
		driver.createCreateNewRequest("same"),
	);
	const resolved = await resolver.resolve({ url: await driver.createContainerUrl("abcd") });
	assert.equal(resolved.id, "abcd");
	assert.equal(
		await resolver.getAbsoluteUrl(resolved, "data/store"),
		"fluid://sea-test/tests/abcd/data/store",
	);
	assert.equal(
		await driver.createContainerUrl("old", resolved),
		"fluid://sea-test/tests/abcd",
	);
	driver.dispose();
	driver.dispose();
	const service = await driver.createDocumentServiceFactory().createDocumentService(resolved);
	await assert.rejects(service.connectToStorage(), /disposed/);
});

test("SEA refuses non-loopback or ambiguous endpoints before opening a session", () => {
	for (const endpoint of [
		"wss://example.com/sea/websocket",
		"ws://localhost/sea/websocket",
		"ws://127.0.0.1/other",
		"ws://127.0.0.1/sea/websocket?mode=fallback",
	]) {
		assert.throws(() => new SeaWebSocketTestDriver(endpoint), /SEA tests require/);
	}
});
