/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";

import {
	closeEphemeralContainers,
	createEphemeralServiceClient,
	synchronizeLocalService,
} from "../localService.js";

describe("EphemeralServiceClient", () => {
	const stubFactory = makeStubDataStoreKind("ephemeral-test-stub");

	afterEach(async () => {
		// Doing the close here instead of in each test ensures that failing tests will still have their containers closed,
		// preventing timer leaks that would prevent a clean test exit.
		await closeEphemeralContainers();
	});

	it("createContainer returns a detached container without an id", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		assert.strictEqual(detached.id, undefined);
	});

	it("attach gives the container an id", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const attached = await detached.attach();
		assert.notStrictEqual(attached.id, undefined);
	});

	it("loadContainer returns a container with the same id as the original", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const container1 = await detached.attach();
		const container2 = await service.loadContainer(container1.id, stubFactory);
		assert.strictEqual(container2.id, container1.id);
	});

	it("attach throws UsageError when container is already attached", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		await detached.attach();
		// detached is the same object as attached; its id is now set, so attach() should throw.
		await assert.rejects(
			async () => detached.attach(),
			(err: Error) => err.message === "Container already attached",
		);
	});

	it("closeEphemeralContainers closes all open containers without throwing", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		await detached.attach();
		await closeEphemeralContainers();
		// Closing is idempotent — calling it again should not throw.
		await closeEphemeralContainers();
	});

	it("two containers in the same session share the same in-memory server", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const container1 = await detached.attach();
		const container2 = await service.loadContainer(container1.id, stubFactory);
		await synchronizeLocalService();

		// Both containers are connected to the same server, so both should report the same document id.
		assert.strictEqual(container2.id, container1.id);
	});

	it("multiple attach calls each produce unique ids", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached1 = await service.createContainer(stubFactory);
		const detached2 = await service.createContainer(stubFactory);
		const container1 = await detached1.attach();
		const container2 = await detached2.attach();
		assert.notStrictEqual(container1.id, container2.id);
	});
});
