/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainer,
	IProvideRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	IPresence,
	Latest,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
// eslint-disable-next-line import/no-internal-modules
import { PresenceManagerFactory } from "@fluidframework/presence/internal/datastorePresenceManagerFactory";
import {
	createTestContainerRuntimeFactory,
	type ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

interface IPresenceManagerDataObject {
	presenceManager(): IPresence;
}

describeCompat("Presence", "NoCompat", (getTestObjectProvider, apis) => {
	const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(
		apis.containerRuntime.ContainerRuntime,
	);
	const runtimeFactory: IProvideRuntimeFactory = {
		IRuntimeFactory: new TestContainerRuntimeFactory(
			"@fluidframework/presence",
			new PresenceManagerFactory().factory,
			{},
		),
	};

	let provider: ITestObjectProvider;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(runtimeFactory);
	const loadContainer = async (): Promise<IContainer> =>
		provider.loadContainer(runtimeFactory);

	const getPresence = async (container: IContainer): Promise<IPresence> => {
		const presence =
			await getContainerEntryPointBackCompat<IPresenceManagerDataObject>(container);
		return presence.presenceManager();
	};

	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	describe("Single client", () => {
		let presence: IPresence;

		beforeEach("createPresence", async function () {
			const container = await createContainer();
			presence = await getPresence(container);
		});

		it("can set and get states", () => {
			const testStatesSchema = {
				latest: Latest({}),
			};
			const testStates = presence.getStates("name:test-states", testStatesSchema);
			testStates.props.latest.local = { test: 1 };

			assert.deepEqual(testStates.props.latest.local, { test: 1 });
		});
	});

	describe("Multiple clients", () => {
		let container1: IContainer;
		let container2: IContainer;
		let container3: IContainer;
		let presence1: IPresence;
		let presence2: IPresence;
		let presence3: IPresence;

		beforeEach("create containers and presence", async function () {
			container1 = await createContainer();
			container2 = await loadContainer();
			container3 = await loadContainer();

			presence1 = await getPresence(container1);
			presence2 = await getPresence(container2);
			presence3 = await getPresence(container3);

			// need to be connected to send signals
			if (container1.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container1.once("connected", resolve));
			}
			if (container2.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container2.once("connected", resolve));
			}
			if (container3.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container2.once("connected", resolve));
			}
		});

		it("can set and get states", () => {});
	});
});
