/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import {
	type ITestObjectProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils/internal";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("Create data store with group id", "NoCompat", (getTestObjectProvider, apis) => {
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	let provider: ITestObjectProvider;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
	});

	it("Can create loadingGroupId", async () => {
		const container = (await provider.makeTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;
		const mainObject = (await container.getEntryPoint()) as ITestDataObject;
		mainObject._root.set("1", "1");
		mainObject._root.set("2", "2");

		// This is needed to make sure the ops are round tripped
		await provider.ensureSynchronized();

		// This is to disconnect so we can create some pending ops, I don't think this part is technically needed
		container.disconnect();
		mainObject._root.set("3", "3");
		mainObject._root.set("4", "4");

		// Generate pending state
		const pendingState = await container.closeAndGetPendingLocalState?.();

		// Load from the pending state
		const container2 = (await provider.loadTestContainer(
			testContainerConfig,
			undefined,
			pendingState,
		)) as IContainerExperimental;

		// Container2 to have the same initial sequence number as container as they loaded from the same base snapshot
		assert(
			container.deltaManager.initialSequenceNumber ===
				container2.deltaManager.initialSequenceNumber,
			"Initial sequence number should be the same",
		);
	});
});
