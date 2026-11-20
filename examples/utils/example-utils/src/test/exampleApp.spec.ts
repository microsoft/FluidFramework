/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mock } from "node:test";

// eslint-disable-next-line import-x/no-internal-modules -- These are the types consumed by the example helper.
import type { DataStoreKind } from "@fluidframework/driver-definitions/internal";

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
	createOrLoadExampleContainer,
} from "../exampleApp.js";

describe("example startup views", () => {
	let originalLocation: PropertyDescriptor | undefined;

	beforeEach(() => {
		originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
	});

	describe("createOrLoadExampleContainer initialization", () => {
		// Factory calls are mocked; this key is only used to verify forwarding.
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The mocked client does not instantiate this nominal key.
		const kind = {} as DataStoreKind<{ initialized: boolean }>;

		beforeEach(() => {
			Object.defineProperty(globalThis, "location", {
				configurable: true,
				value: new URL("http://localhost/?fluidClient=ephemeral"),
			});
		});

		afterEach(async () => {
			mock.restoreAll();
			await cleanupEphemeralService();
		});

		it("awaits initialization before attachment and publishing the document ID", async () => {
			const client = getExampleServiceClient();
			const data = { initialized: false };
			const attached = { id: "created", data };
			const calls: string[] = [];
			mock.method(client, "createContainer", async (root) => {
				assert.equal(root, kind);
				return {
					data,
					close: () => assert.fail("Successful initialization should not close the container"),
					attach: async () => {
						assert(data.initialized);
						calls.push("attach");
						return attached;
					},
				};
			});
			const result = await createOrLoadExampleContainer(client, kind, async (root) => {
				await Promise.resolve();
				assert.equal(location.hash, "");
				root.initialized = true;
				calls.push("initialize");
			});
			assert.equal(result, attached);
			assert.deepEqual(calls, ["initialize", "attach"]);
			assert.equal(location.hash, "#created");
		});

		it("does not initialize a loaded document", async () => {
			location.hash = "existing";
			const client = getExampleServiceClient();
			const loaded = { id: "existing", data: { initialized: true } };
			mock.method(client, "loadContainer", async (id, root) => {
				assert.equal(id, "existing");
				assert.equal(root, kind);
				return loaded;
			});
			const result = await createOrLoadExampleContainer(client, kind, () =>
				assert.fail("Loading must not initialize the root again"),
			);
			assert.equal(result, loaded);
		});

		it("attaches without an initializer", async () => {
			const client = getExampleServiceClient();
			const attached = { id: "created", data: { initialized: false } };
			mock.method(client, "createContainer", async () => ({
				data: attached.data,
				close: () => assert.fail("Successful attachment should not close the container"),
				attach: async () => attached,
			}));
			assert.equal(await createOrLoadExampleContainer(client, kind), attached);
			assert.equal(location.hash, "#created");
		});

		for (const phase of ["initialize", "attach"] as const) {
			it(`closes after ${phase} fails without publishing the document ID`, async () => {
				const client = getExampleServiceClient();
				const error = new Error(`${phase} failed`);
				let closed = false;
				mock.method(client, "createContainer", async () => ({
					data: { initialized: false },
					close: () => {
						closed = true;
					},
					attach: async () => {
						assert.equal(phase, "attach", "Failed initialization must not attach");
						throw error;
					},
				}));
				await assert.rejects(
					createOrLoadExampleContainer(client, kind, async () => {
						if (phase === "initialize") {
							throw error;
						}
					}),
					(failure) => failure === error,
				);
				assert(closed);
				assert.equal(location.hash, "");
			});
		}
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
