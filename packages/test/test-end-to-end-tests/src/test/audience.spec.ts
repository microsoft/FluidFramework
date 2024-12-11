/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer, DisconnectReason } from "@fluidframework/container-definitions/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../packageVersion.js";

describeCompat("Audience correctness", "FullCompat", (getTestObjectProvider, apis) => {
	class TestDataObject extends apis.dataRuntime.DataObject {
		public get _root() {
			return this.root;
		}

		public get _context() {
			return this.context;
		}
	}

	let provider: ITestObjectProvider;
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
	};
	const createContainer = async (): Promise<IContainer> =>
		provider.makeTestContainer(testContainerConfig);
	const loadContainer = async (): Promise<IContainer> =>
		provider.loadTestContainer(testContainerConfig);

	/** Function to wait for a client with the given clientId to be added to the audience of the given container. */
	async function waitForClientAdd(container: IContainer, clientId: string, errorMsg: string) {
		if (container.audience.getMember(clientId) === undefined) {
			return timeoutPromise(
				(resolve) => {
					const listener = (newClientId: string) => {
						if (newClientId === clientId) {
							container.audience.off("addMember", listener);
							resolve();
						}
					};
					container.audience.on("addMember", (newClientId: string) => listener(newClientId));
				},
				// Wait for 2 seconds to get the client in audience. This wait is needed for a client to get added to its
				// own audience and 2 seconds should be enough time. It it takes longer than this, we might need to
				// reevaluate our assumptions around audience.
				// Also see - https://github.com/microsoft/FluidFramework/issues/7275.
				{ durationMs: 2000, errorMsg },
			);
		}
	}

	/** Function to wait for a client with the given clientId to be remove from the audience of the given container. */
	async function waitForClientRemove(
		container: IContainer,
		clientId: string,
		errorMsg: string,
	) {
		if (container.audience.getMember(clientId) !== undefined) {
			return timeoutPromise(
				(resolve) => {
					const listener = (newClientId: string) => {
						if (newClientId === clientId) {
							container.audience.off("removeMember", listener);
							resolve();
						}
					};
					container.audience.on("removeMember", (newClientId: string) =>
						listener(newClientId),
					);
				},
				{ durationMs: 2000, errorMsg },
			);
		}
	}

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
	});

	/**
	 * These tests wait for a client to get connected and then wait for them to be added to the audience. Ideally,
	 * by the time a client moves to connected state, its audience should have itself and all previous clients.
	 * This is tracked here - https://github.com/microsoft/FluidFramework/issues/7275. Once this is fixed, the tests
	 * should be updated as per the new expectations.
	 */
	it("should add clients in audience as expected", async () => {
		// Create a client - client1 and wait for it to be connected.
		const client1Container = await createContainer();
		await waitForContainerConnection(client1Container);

		// Validate that client1 is added to its own audience.
		assert(client1Container.clientId !== undefined, "client1 does not have clientId");
		await waitForClientAdd(
			client1Container,
			client1Container.clientId,
			"client1's audience doesn't have self",
		);

		// Load a second client - client2 and wait for it to be connected.
		const client2Container = await loadContainer();
		await waitForContainerConnection(client2Container);

		// Validate that client2 is added to its own audience.
		assert(client2Container.clientId !== undefined, "client2 does not have clientId");
		await waitForClientAdd(
			client2Container,
			client2Container.clientId,
			"client2's audience doesn't have self",
		);

		// Validate that client2 is added to client1's audience.
		await waitForClientAdd(
			client1Container,
			client2Container.clientId,
			"client1's audience doesn't have client2",
		);

		// Validate that client1 is added to client2's audience.
		await waitForClientAdd(
			client2Container,
			client1Container.clientId,
			"client2's audience doesn't have client1",
		);
	});

	it("should add clients in audience as expected in write mode", async function () {
		// Create a client - client1.
		const client1Container = await createContainer();
		const client1DataStore =
			await getContainerEntryPointBackCompat<TestDataObject>(client1Container);

		// Load a second client - client2.
		const client2Container = await loadContainer();
		const client2DataStore =
			await getContainerEntryPointBackCompat<TestDataObject>(client2Container);

		// Perform operations to move the clients to "write" mode (if not already in write mode).
		client1DataStore._root.set("testKey1", "testValue1");
		client2DataStore._root.set("testKey2", "testValue2");

		// Ensure that the clients are connected and synchronized.
		await waitForContainerConnection(client1Container);
		await waitForContainerConnection(client2Container);
		await provider.ensureSynchronized();

		assert(client1Container.clientId !== undefined, "client1 does not have clientId");
		assert(client2Container.clientId !== undefined, "client2 does not have clientId");

		// Validate that both the clients are added to client1's audience.
		await waitForClientAdd(
			client1Container,
			client1Container.clientId,
			"client1's audience doesn't have self",
		);
		await waitForClientAdd(
			client1Container,
			client2Container.clientId,
			"client1's audience doesn't have client2",
		);

		// Validate that both the clients are added to client2's audience.
		await waitForClientAdd(
			client2Container,
			client1Container.clientId,
			"client2's audience doesn't have client1",
		);
		await waitForClientAdd(
			client2Container,
			client2Container.clientId,
			"client2's audience doesn't have self",
		);
	});

	it("should remove clients in audience as expected", async () => {
		// Create a client - client1 and wait for it to be connected.
		const client1Container = await createContainer();
		await waitForContainerConnection(client1Container);

		// Load a second client - client2 and wait for it to be connected.
		const client2Container = await loadContainer();
		await waitForContainerConnection(client2Container);

		assert(client1Container.clientId !== undefined, "client1 does not have clientId");
		assert(client2Container.clientId !== undefined, "client2 does not have clientId");

		// Validate that client2 is in both client's audiences.
		await waitForClientAdd(
			client1Container,
			client2Container.clientId,
			"client1's audience doesn't have client2",
		);
		await waitForClientAdd(
			client2Container,
			client2Container.clientId,
			"client2's audience doesn't have self",
		);

		// Close client2. It should be removed from the audience.
		client2Container.close(DisconnectReason.Expected);
		await provider.ensureSynchronized();

		// Validate that client2 is removed from client1's audience.
		await waitForClientRemove(
			client1Container,
			client2Container.clientId,
			"client2's audience should be removed",
		);
	});

	it("getSelf() & 'selfChanged' event", async function () {
		assert(apis.containerRuntime !== undefined);
		if (apis.containerRuntime.version !== pkgVersion) {
			// Only verify latest version of runtime - this functionality did not exist prior to RC3.
			// Given that every version (from now on) tests this functionality, there is no reason to test old versions.
			// This test does not use second container, so there is no need for cross-version tests.
			this.skip();
			return;
		}

		const container = await provider.makeTestContainer();
		const entry = await getContainerEntryPointBackCompat<TestDataObject>(container);
		await waitForContainerConnection(container);
		const audience = entry._context.containerRuntime.getAudience();

		container.disconnect();
		const oldId = audience.getSelf()?.clientId;
		assert(oldId !== undefined);
		assert(oldId === container.clientId);

		let newClientId: string | undefined;
		audience.on("selfChanged", (_old, newValue) => {
			newClientId = newValue.clientId;
			assert(newClientId !== undefined);
			assert(newValue.client === audience.getMember(newClientId));
			// This assert could fire if one "Fluid.Container.DisableJoinSignalWait" feature gate is triggered.
			// Code should not rely on such behavior while IAudience.getSelf() is experimental
			// It also will fire if new runtime is used with old loader (that has exactly same effect as previous case)
			// assert(newValue.client !== undefined);
		});

		container.connect();
		await waitForContainerConnection(container);

		assert(newClientId !== undefined);
		assert(newClientId === container.clientId);
		assert(audience.getSelf()?.clientId === container.clientId);
	});
});
