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
				lastRoll: Latest({}),
			};
			const testStates = presence.getStates("name:test-states", testStatesSchema);
			testStates.props.lastRoll.local = { test: 1 };

			assert.deepEqual(testStates.props.lastRoll.local, { test: 1 });
		});
	});
});
