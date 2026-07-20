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
	type EphemeralService,
	EphemeralServiceContainer,
} from "../localService.js";

const options = { minVersionForCollaboration: "2.20.0" } as const;
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
		const container = await client.createContainer(stubFactory);
		const attached = await container.attach();

		// We currently lack public APIs for checking the closed state of a container:
		EphemeralServiceContainer.narrow(attached);
		assert.strictEqual(attached.container.closed, false);

		await service.close();
		assert.strictEqual(attached.container.closed, true);
	});

	describe("EphemeralServiceClient", () => {
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
			const detached = await client.createContainer(stubFactory);
			const container1 = await detached.attach();
			const container2 = await client.loadContainer(container1.id, stubFactory);
			await client.service.synchronize();

			// Both containers are connected to the same server, so both should report the same document id.
			assert.strictEqual(container2.id, container1.id);
		});

		it("multiple attach calls each produce unique ids", async () => {
			const client = newService().newClient(options);
			const detached1 = await client.createContainer(stubFactory);
			const detached2 = await client.createContainer(stubFactory);
			const container1 = await detached1.attach();
			const container2 = await detached2.attach();
			assert.notStrictEqual(container1.id, container2.id);
		});
	});

	describe("EphemeralService", () => {
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
});
