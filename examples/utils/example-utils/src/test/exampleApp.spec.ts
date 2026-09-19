/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	cleanupEphemeralService,
	type EphemeralService,
	getDefaultEphemeralService,
	getSessionService,
	type LocalServiceClient,
	type SessionService,
} from "@fluidframework/local-driver/alpha";

import { getExampleServiceClient } from "../exampleApp.js";
import { createSeaExampleServiceClient } from "../seaExampleService.js";

describe("getExampleServiceClient", () => {
	afterEach(async () => {
		await cleanupEphemeralService();
	});

	it("defaults to the ephemeral service when browser storage is unavailable", () => {
		const exampleClient = getExampleServiceClient() as LocalServiceClient<EphemeralService>;
		const defaultService = getDefaultEphemeralService();
		assert.equal(exampleClient.service, defaultService);
	});

	it("defaults to the session service when browser storage is available", () => {
		const originalSessionStorage = Object.getOwnPropertyDescriptor(
			globalThis,
			"sessionStorage",
		);
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: {
				clear: () => {},
				getItem: () => undefined,
				key: () => undefined,
				length: 0,
				removeItem: () => {},
				setItem: () => {},
			} as unknown as Storage,
		});

		try {
			const exampleClient = getExampleServiceClient() as LocalServiceClient<SessionService>;
			assert.equal(exampleClient.service, getSessionService());
		} finally {
			if (originalSessionStorage === undefined) {
				Reflect.deleteProperty(globalThis, "sessionStorage");
			} else {
				Object.defineProperty(globalThis, "sessionStorage", originalSessionStorage);
			}
		}
	});

	it("location query parameter can select a different service", () => {
		// Cache location to restore it after the test.
		const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");

		const selectService = (fluidClient?: string): void => {
			const search = fluidClient === undefined ? "" : `?fluidClient=${fluidClient}`;
			Object.defineProperty(globalThis, "location", {
				configurable: true,
				value: new URL(`http://localhost/${search}`),
			});
		};

		try {
			selectService("ephemeral");
			const ephemeralClient =
				getExampleServiceClient() as LocalServiceClient<EphemeralService>;
			const defaultService = getDefaultEphemeralService();
			assert.equal(ephemeralClient.service, defaultService);

			selectService("tinylicious");
			const tinyliciousClient = getExampleServiceClient() as Partial<
				LocalServiceClient<EphemeralService>
			>;
			// We don't have a robust way to narrow or downcast the returned client, but this at least ensures they are different.
			assert.equal("service" in ephemeralClient, true);
			assert.equal("service" in tinyliciousClient, false);

			selectService("sea-ephemeral");
			const seaClient = getExampleServiceClient();
			assert.equal(typeof seaClient.createContainer, "function");
			assert.equal(typeof seaClient.loadContainer, "function");
			selectService("sea-webtransport");
			assert.throws(() => getExampleServiceClient(), /seaEndpoint/u);
			selectService("sea-websocket");
			assert.throws(() => getExampleServiceClient(), /WSS seaEndpoint/u);
			selectService("sea-websocket&seaEndpoint=wss%3A%2F%2Flocalhost%2Fsea%2Fwebsocket");
			assert.equal(typeof getExampleServiceClient().loadContainer, "function");
		} finally {
			if (originalLocation === undefined) {
				Reflect.deleteProperty(globalThis, "location");
			} else {
				Object.defineProperty(globalThis, "location", originalLocation);
			}
		}
	});

	it("validates WebSocket configuration without opening a connection", () => {
		const options = { oldestSupportedClient: "2.100.0" } as const;
		const parameters = new URLSearchParams({ seaEndpoint: "wss://localhost/sea/websocket" });
		assert.equal(
			typeof createSeaExampleServiceClient("sea-websocket", options, parameters).loadContainer,
			"function",
		);
		parameters.set("seaCompression", "true");
		assert.throws(
			() => createSeaExampleServiceClient("sea-websocket", options, parameters),
			/seaCompression/u,
		);
		parameters.delete("seaCompression");
		parameters.set("seaEndpoint", "https://localhost/sea/websocket");
		assert.throws(
			() => createSeaExampleServiceClient("sea-websocket", options, parameters),
			/WSS/u,
		);
	});

	it("validates remote SEA configuration without opening a connection", () => {
		const options = { oldestSupportedClient: "2.100.0" } as const;
		const parameters = new URLSearchParams({
			seaEndpoint: "https://localhost:4433/sea",
			seaCertificateHash: "ab".repeat(32),
			seaCompression: "true",
		});
		const client = createSeaExampleServiceClient("sea-webtransport", options, parameters);
		assert.equal(typeof client.createAttachedContainer, "function");
		parameters.set("seaCertificateHash", "invalid");
		assert.throws(
			() => createSeaExampleServiceClient("sea-webtransport", options, parameters),
			/seaCertificateHash/u,
		);
		parameters.set("seaCertificateHash", "ab".repeat(32));
		parameters.set("seaEndpoint", "http://localhost:4433/sea");
		assert.throws(
			() => createSeaExampleServiceClient("sea-webtransport", options, parameters),
			/HTTPS/u,
		);
		parameters.set("seaCompression", "maybe");
		assert.throws(
			() => createSeaExampleServiceClient("sea-ephemeral", options, parameters),
			/seaCompression/u,
		);
	});
});
