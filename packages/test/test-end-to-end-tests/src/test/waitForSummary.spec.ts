/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { CompressionAlgorithms } from "@fluidframework/container-runtime/internal";
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
) => {
	const testConfig = {
		...testContainerConfig,
		runtimeOptions: { ...testContainerConfig.runtimeOptions, summaryOptions: undefined },
	};
	const { summarizer, container: summarizingContainer } = await createSummarizer(
		provider,
		container,
		testConfig,
	);
	await summarizeNow(summarizer);
	summarizingContainer.close();
};

describeCompat("Wait for summary", "NoCompat", (getTestObjectProvider, apis) => {
	const mapId = "map";
	const { SharedMap } = apis.dds;
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];

	it("Wait for summary", async function () {
		const provider = getTestObjectProvider();
		// This test fails on ODSP.
		if (provider.driver.type === "odsp") {
			this.skip();
		}
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions: {
				chunkSizeInBytes: Number.POSITIVE_INFINITY, // disable
				compressionOptions: {
					minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
				enableRuntimeIdCompressor: "on",
			},
		};

		const loader = provider.makeTestLoader(testContainerConfig);
		const container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		map1.set("test op 1", "test op 1");
		await waitForSummary(provider, container1, testContainerConfig);

		map1.set("test op 2", "test op 2");
		await waitForSummary(provider, container1, testContainerConfig);
	});
});
