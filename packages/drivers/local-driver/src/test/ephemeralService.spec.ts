/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";

import {
	cleanupEphemeralService,
	getDefaultEphemeralService,
	startEphemeralService,
	getSessionService,
	type EphemeralService,
	EphemeralServiceContainer,
} from "../ephemeralService.js";

const options = { oldestSupportedClient: "2.20.0" } as const;
const stubFactory = makeStubDataStoreKind("ephemeral-test-stub");

describe("EphemeralService", () => {
	// Track every service a test starts so failing tests still release their resources here (instead of in
	// each test), preventing timer leaks that would prevent a clean test exit.
	const services: EphemeralService[] = [];
	function newService(isDefault = false): EphemeralService {
		const service = startEphemeralService(isDefault);
		services.push(service);
		return service;
	}
	afterEach(async () => {
		for (const service of services.splice(0)) {
			await service.close();
		}
		// Clear the default service (if any) so the next test can start a fresh one.
		await cleanupEphemeralService();
	});

	it("closing the service closes its open containers", async () => {
		const service = newService();
		const client = service.newClient(options);
		const container = await client.createAttachedContainer(stubFactory);

		// We currently lack public APIs for checking the closed state of a container:
		EphemeralServiceContainer.narrow(container);
		assert.strictEqual(container.container.closed, false);

		await service.close();
		assert.strictEqual(container.container.closed, true);
	});

	describe("LocalServiceClient", () => {
		it("createContainer returns a detached container without an id", async () => {
			const client = newService().newClient(options);
			const detached = await client.createContainer(stubFactory);
			assert.strictEqual(detached.id, undefined);
		});

		it("attach gives the container an id", async () => {
			const client = newService().newClient(options);
			const detached = await client.createContainer(stubFactory);
			const attached = await detached.attach();
			assert.notStrictEqual(attached.id, undefined);
		});

		it("loadContainer returns a container with the same id as the original", async () => {
			const client = newService().newClient(options);
			const detached = await client.createContainer(stubFactory);
			const container1 = await detached.attach();
			const container2 = await client.loadContainer(container1.id, stubFactory);
			assert.strictEqual(container2.id, container1.id);
		});

		it("attach throws UsageError when container is already attached", async () => {
			const client = newService().newClient(options);
			const detached = await client.createContainer(stubFactory);
			await detached.attach();
			// detached is the same object as attached; its id is now set, so attach() should throw.
			await assert.rejects(
				async () => detached.attach(),
				(err: Error) => err.message === "Container already attached",
			);
		});

		it("exposes the service it is connected to", () => {
			const service = newService();
			const client = service.newClient(options);
			assert.strictEqual(client.service, service);
		});

		it("clients from the same service share it, clients from different services do not", () => {
			const serviceA = newService();
			const serviceB = newService();
			assert.strictEqual(serviceA.newClient(options).service, serviceA);
			assert.notStrictEqual(
				serviceA.newClient(options).service,
				serviceB.newClient(options).service,
			);
		});

		it("two containers on the same service share the same in-memory server", async () => {
			const client = newService().newClient(options);
			const container1 = await client.createAttachedContainer(stubFactory);
			const container2 = await client.loadContainer(container1.id, stubFactory);
			await client.service.synchronize();

			// Both containers are connected to the same server, so both should report the same document id.
			assert.strictEqual(container2.id, container1.id);
		});

		it("multiple attach calls each produce unique ids", async () => {
			const client = newService().newClient(options);
			const container1 = await client.createAttachedContainer(stubFactory);
			const container2 = await client.createAttachedContainer(stubFactory);
			assert.notStrictEqual(container1.id, container2.id);
		});
	});

	describe("EphemeralService", () => {
		it("lists and deletes stored documents", async () => {
			const service = newService();
			const client = service.newClient(options);
			const firstContainer = await client.createAttachedContainer(stubFactory);
			const secondContainer = await client.createAttachedContainer(stubFactory);
			const firstId = firstContainer.id;
			const secondId = secondContainer.id;
			await service.synchronize();
			firstContainer.close();
			secondContainer.close();

			assert.deepStrictEqual(
				new Set(await service.listDocumentIds()),
				new Set([firstId, secondId]),
			);

			await service.deleteDocument(firstId);
			assert.deepStrictEqual(await service.listDocumentIds(), [secondId]);
			await assert.rejects(async () => client.loadContainer(firstId, stubFactory));

			const loaded = await client.loadContainer(secondId, stubFactory);
			loaded.close();
			await service.deleteAllDocuments();
			assert.deepStrictEqual(await service.listDocumentIds(), []);
		});

		it("rejects document deletion while a container is open", async () => {
			const service = newService();
			const container = await service.defaultClient.createAttachedContainer(stubFactory);

			await assert.rejects(
				async () => service.deleteDocument(container.id),
				(err: Error) =>
					err.message === "Close all containers before deleting local service documents",
			);
		});

		it("close is idempotent", async () => {
			const service = newService();
			const client = service.newClient(options);
			const detached = await client.createContainer(stubFactory);
			await detached.attach();
			await service.close();
			// Closing again should not throw.
			await service.close();
		});

		it("a document persists across container close while the service stays open", async () => {
			const service = newService();
			const client = service.newClient(options);
			const detached = await client.createContainer(stubFactory);
			const container1 = await detached.attach();
			const { id } = container1;
			await service.synchronize();

			// Close the only container. Since the service is still open, the document is retained.
			container1.close();

			const container2 = await client.loadContainer(id, stubFactory);
			assert.strictEqual(container2.id, id);
		});

		it("cannot create a container on a closed service", async () => {
			const service = newService();
			const client = service.newClient(options);
			await service.close();
			await assert.rejects(async () => client.createContainer(stubFactory));
		});

		it("separate services are isolated from each other", async () => {
			const serviceA = newService();
			const clientA = serviceA.newClient(options);
			const detached = await clientA.createContainer(stubFactory);
			const containerA = await detached.attach();
			await serviceA.synchronize();

			// A different service does not have the document created on serviceA, so loading it fails.
			const serviceB = newService();
			const clientB = serviceB.newClient(options);
			await assert.rejects(async () => clientB.loadContainer(containerA.id, stubFactory));
		});

		it("startEphemeralService registers a default that getDefaultEphemeralService returns", () => {
			const service = newService(true);
			assert.strictEqual(getDefaultEphemeralService(), service);
		});

		it("startEphemeralService throws if a default service is already running", () => {
			newService(true);
			assert.throws(() => startEphemeralService());
			// A non-default service can still be started alongside the default.
			newService(false);
		});

		it("cleanupEphemeralService closes and clears the default service", async () => {
			const service = newService(true);
			const client = service.newClient(options);
			const detached = await client.createContainer(stubFactory);
			await detached.attach();

			await cleanupEphemeralService();

			// The default is now cleared, and its service is closed.
			assert.throws(() => getDefaultEphemeralService());
			await assert.rejects(async () => client.createContainer(stubFactory));
		});

		it("cleanupEphemeralService is safe to call when no default service is running", async () => {
			await cleanupEphemeralService();
			// Calling it again should also not throw.
			await cleanupEphemeralService();
		});
	});

	describe("SessionService", () => {
		const storedValues = new Map<string, string>();
		const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"sessionStorage",
		);

		before(() => {
			Object.defineProperty(globalThis, "sessionStorage", {
				configurable: true,
				value: {
					clear: () => storedValues.clear(),
					getItem: (key: string) => storedValues.get(key) ?? null,
					key: (index: number) => [...storedValues.keys()][index] ?? null,
					get length() {
						return storedValues.size;
					},
					removeItem: (key: string) => storedValues.delete(key),
					setItem: (key: string, value: string) => storedValues.set(key, value),
				} satisfies Storage,
			});
		});

		after(() => {
			if (sessionStorageDescriptor === undefined) {
				Reflect.deleteProperty(globalThis, "sessionStorage");
			} else {
				Object.defineProperty(globalThis, "sessionStorage", sessionStorageDescriptor);
			}
		});

		it("shares one service and manages persisted documents", async () => {
			const firstService = getSessionService();
			const firstClient = firstService.newClient(options);
			assert.strictEqual(firstClient.service, firstService);
			const firstContainer = await firstClient.createAttachedContainer(stubFactory);
			const { id } = firstContainer;
			await firstService.synchronize();
			firstContainer.close();
			assert.deepStrictEqual(await firstService.listDocumentIds(), [id]);

			const secondService = getSessionService();
			assert.strictEqual(secondService, firstService);
			const secondClient = secondService.newClient(options);
			assert.strictEqual(secondClient.service, secondService);
			const secondContainer = await secondClient.loadContainer(id, stubFactory);

			assert.strictEqual(secondContainer.id, id);
			secondContainer.close();
			await secondService.deleteDocument(id);
			assert.deepStrictEqual(await secondService.listDocumentIds(), []);
		});
	});
});
