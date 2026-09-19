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
import { createElement } from "react";
// eslint-disable-next-line import-x/no-internal-modules -- React exposes server rendering through this entry point.
import { renderToStaticMarkup } from "react-dom/server";

import {
	ExampleErrorView,
	ExampleLoadingView,
	getExampleServiceClient,
} from "../exampleApp.js";

describe("example startup views", () => {
	let originalLocation: PropertyDescriptor | undefined;

	beforeEach(() => {
		originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
	});

	afterEach(() => {
		if (originalLocation === undefined) {
			Reflect.deleteProperty(globalThis, "location");
		} else {
			Object.defineProperty(globalThis, "location", originalLocation);
		}
	});

	for (const service of ["", "session", "ephemeral", "tinylicious", "unknown-service"]) {
		it(`renders guidance for ${service || "default"} service`, () => {
			Object.defineProperty(globalThis, "location", {
				configurable: true,
				value: new URL(`http://localhost/?fluidClient=${service}`),
			});
			const errorHtml = renderToStaticMarkup(
				createElement(ExampleErrorView, { error: new Error("Startup failed") }),
			);
			const loadingHtml = renderToStaticMarkup(createElement(ExampleLoadingView));
			assert.match(errorHtml, /role="alert"/);
			assert.match(errorHtml, /Startup failed/);
			assert.match(loadingHtml, /role="status"/);
			assert.match(loadingHtml, /Connecting to document/);
			for (const html of [errorHtml, loadingHtml]) {
				if (service === "tinylicious") {
					assert.match(html, /pnpm tinylicious/);
					assert.match(html, /forward port 7070/);
					assert.match(html, /<strong>Public<\/strong>/);
					assert.match(html, /#sharing-a-port/);
				} else {
					assert.doesNotMatch(html, /Tinylicious troubleshooting|7070/);
				}
			}
		});
	}

	it("renders without a browser location and escapes error text", () => {
		Reflect.deleteProperty(globalThis, "location");
		for (const error of [new Error("<script>bad</script>"), "<script>bad</script>"]) {
			const html = renderToStaticMarkup(createElement(ExampleErrorView, { error }));
			assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
			assert.doesNotMatch(html, /<script>/);
		}
	});
});

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
		} finally {
			if (originalLocation === undefined) {
				Reflect.deleteProperty(globalThis, "location");
			} else {
				Object.defineProperty(globalThis, "location", originalLocation);
			}
		}
	});
});
