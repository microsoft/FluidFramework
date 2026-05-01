/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	closeEphemeralContainers,
	createEphemeralServiceClient,
	synchronizeLocalService,
} from "@fluidframework/local-driver/internal";
import type { FluidContainerAttached } from "@fluidframework/runtime-definitions/internal";
import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";

import { getPresenceFromContainer } from "@fluid-internal/presence-runtime/extension";
import { StateFactory } from "@fluid-internal/presence-runtime/states";

describe("getPresenceFromContainer", () => {
	const stubFactory = makeStubDataStoreKind("presence-test-stub");

	afterEach(async () => {
		// Doing the close here instead of in each test ensues that failing tests will still have their containers closed,
		// timer leaks preventing clean test exit.
		await closeEphemeralContainers();
	});

	it("returns PresenceWithNotifications from an attached container", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const container = await detached.attach();

		const presence = getPresenceFromContainer(container);
		assert.ok(presence !== undefined, "Expected presence to be defined");
	});

	it("throws TypeError when container is not a ServiceContainerBase", () => {
		assert.throws(
			() => getPresenceFromContainer({} as unknown as FluidContainerAttached),
			TypeError,
		);
	});

	it("returns same presence instance on repeated calls for the same container", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const container = await detached.attach();

		const presence1 = getPresenceFromContainer(container);
		const presence2 = getPresenceFromContainer(container);
		assert.strictEqual(presence1, presence2, "Expected same presence instance");
	});

	it("shares presence state between two containers in the same session", async () => {
		const service = createEphemeralServiceClient({ minVersionForCollab: "2.20.0" });
		const detached = await service.createContainer(stubFactory);
		const container1 = await detached.attach();
		const container2 = await service.loadContainer(container1.id, stubFactory);
		await synchronizeLocalService();

		const presence1 = getPresenceFromContainer(container1);
		const presence2 = getPresenceFromContainer(container2);

		const workspace1 = presence1.states.getWorkspace("name:cursors", {
			cursor: StateFactory.latest({ local: { x: 0, y: 0 } }),
		});
		const workspace2 = presence2.states.getWorkspace("name:cursors", {
			cursor: StateFactory.latest({ local: { x: 0, y: 0 } }),
		});

		const receivedOnContainer2 = new Promise<void>((resolve) => {
			workspace2.states.cursor.events.on("remoteUpdated", ({ value }) => {
				assert.deepEqual(value, { x: 42, y: 7 });
				resolve();
			});
		});

		workspace1.states.cursor.local = { x: 42, y: 7 };
		await synchronizeLocalService();

		await receivedOnContainer2;
	});
});
