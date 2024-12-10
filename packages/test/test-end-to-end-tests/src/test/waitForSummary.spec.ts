/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	type ITestObjectProvider,
	type ITestContainerConfig,
	createSummarizer,
	summarizeNow,
	type ChannelFactoryRegistry,
	createAndAttachContainer,
	DataObjectFactoryType,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

const waitForSummary = async (
	provider: ITestObjectProvider,
	container: IContainer,
	testContainerConfig: ITestContainerConfig,
	summaryVersion?: string,
) => {
	const { summarizer, container: summarizingContainer } = await createSummarizer(
		provider,
		container,
		testContainerConfig,
		summaryVersion,
	);
	await provider.ensureSynchronized();
	const result = await summarizeNow(summarizer);
	summarizingContainer.close();
	return result.summaryVersion;
};

describeCompat("Wait for summary", "NoCompat", (getTestObjectProvider, apis) => {
	const mapId = "map";
	const { SharedMap } = apis.dds;
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];

	it("Wait for summary", async function () {
		const provider = getTestObjectProvider({ syncSummarizer: true });
		// This test fails on ODSP at least.
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};
		const mainContainerConfig: ITestContainerConfig = {
			...testContainerConfig,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
			},
		};

		const loader = provider.makeTestLoader(mainContainerConfig);
		const container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		map1.set("test op 1", "test op 1");
		const summaryVersion = await waitForSummary(provider, container1, testContainerConfig);

		map1.set("test op 2", "test op 2");
		await waitForSummary(provider, container1, testContainerConfig, summaryVersion);
	});
});
