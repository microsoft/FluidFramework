/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
// eslint-disable-next-line import/no-internal-modules
import { IPresence } from "@fluidframework/presence/alpha";
import { createTestContainerRuntimeFactory, type ITestObjectProvider, getContainerEntryPointBackCompat } from "@fluidframework/test-utils/internal";


interface IPresenceManagerDataObject {
	presenceManager(): IPresence;
}

describeCompat("Presence", "NoCompat", (getTestObjectProvider, apis) => {
	const getContainerRuntimeFactory = (forLoad: boolean) => {
		const runtime =
			forLoad && apis.containerRuntimeForLoading !== undefined
				? apis.containerRuntimeForLoading.ContainerRuntime
				: apis.containerRuntime.ContainerRuntime;
		const presenceManagerFactory =
			forLoad && apis.dataRuntimeForLoading !== undefined
				? apis.dataRuntimeForLoading?.packages.presence.PresenceManagerFactory
				: apis.dataRuntime.packages.presence.PresenceManagerFactory;
		const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(runtime);
		return {
			IRuntimeFactory: new TestContainerRuntimeFactory(
				"@fluidframework/presence",
				new presenceManagerFactory().factory,
			),
		};
	};

	let provider: ITestObjectProvider;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(getContainerRuntimeFactory(false));
	const loadContainer = async (): Promise<IContainer> =>
		provider.loadContainer(getContainerRuntimeFactory(true));


	const getPresence = async (container: IContainer): Promise<IPresence> => {
		const presence = await getContainerEntryPointBackCompat<IPresenceManagerDataObject>(container);
		return presence.presenceManager();
	};

	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	describe("Single client", () => {
		let presence: IPresence;

		beforeEach("createScheduler", async function () {
			const container = await createContainer();
			presence = await getPresence(container);
		});
	});
});
