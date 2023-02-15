/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { ContainerRuntime, DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	// LocalCodeLoader,
	// TestFluidObjectFactory,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { bufferToString, TelemetryNullLogger } from "@fluidframework/common-utils";
import { SharedMap } from "@fluidframework/map";
import { IRequest } from "@fluidframework/core-interfaces";
// import { Container, ILoaderProps, Loader } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { createLogger } from "./FileLogger";

const defaultDataStoreId = "default";
const mapId = "mapId";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];

const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
	runtimeOptions: {
		summaryOptions: {
			initialSummarizerDelayMs: 0, // back-compat - Old runtime takes 5 seconds to start summarizer without this
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{ maxOps: 10, initialSummarizerDelayMs: 0, minIdleTime: 10, maxIdleTime: 10 },
			},
		},
	},
};
const chunkingBatchesConfig: ITestContainerConfig = {
	...testContainerConfig,
	runtimeOptions: {
		compressionOptions: {
			minimumBatchSizeInBytes: 1024 * 1024,
			compressionAlgorithm: "lz4" as any,
		},
		chunkSizeInBytes: 600 * 1024,
		//		summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
	},
};

function readBlobContent(content: ISummaryBlob["content"]): unknown {
	const json = typeof content === "string" ? content : bufferToString(content, "utf8");
	return JSON.parse(json);
}

describeNoCompat("Summarization Larger Document - runtime benchmarks", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let fileName: string;
	let containerUrl: IResolvedUrl;
	let logger: ITelemetryLogger | undefined;
	let testConfig: ITestContainerConfig;
	let dataObject1: ITestFluidObject;
	let dataObject1map: SharedMap;
	let dataObject2: ITestFluidObject;
	let dataObject2map: SharedMap;
	let loader: IHostLoader;

	const maxMessageSizeInBytes = 1 * 1024 * 1024; // 1MB
	const messageCount = 2; // Will result in a 2 MB payload

	const generateRandomStringOfSize = (sizeInBytes: number): string =>
		crypto.randomBytes(sizeInBytes / 2).toString("hex");

	const setMapKeys = (map: SharedMap, count: number, item: string): void => {
		for (let i = 0; i < count; i++) {
			map.set(`key${i}`, item);
		}
	};

	const validateMapKeys = (map: SharedMap, count: number, expectedSize: number): void => {
		for (let i = 0; i < count; i++) {
			const key = map.get(`key${i}`);
			assert(key !== undefined);
			assert(key.length === expectedSize);
		}
	};

	before(async () => {
		provider = getTestObjectProvider();
		// runId will be populated on the logger.
		logger =
			process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined
				? await createLogger({
						runId: undefined,
						driverType: provider.driver.type,
						driverEndpointName: provider.driver.endpointName,
						profile: "",
				  })
				: undefined;

		testConfig = {
			...chunkingBatchesConfig,
			runtimeOptions: {
				compressionOptions: {
					minimumBatchSizeInBytes: 1,
					compressionAlgorithm: "lz4" as any,
				},
			},
		};
		if (logger !== undefined) {
			testConfig = {
				...testConfig,
				loaderProps: { logger },
			};
		}

		loader = provider.makeTestLoader(testConfig);
		mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

		dataObject1 = await requestFluidObject<ITestFluidObject>(mainContainer, "default");
		dataObject1map = await dataObject1.getSharedObject<SharedMap>(mapId);
		const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
		setMapKeys(dataObject1map, messageCount, largeString);
		fileName = uuid();
		await mainContainer.attach(provider.driver.createCreateNewRequest(fileName));
		assert(mainContainer.resolvedUrl);
		containerUrl = mainContainer.resolvedUrl;
		await waitForContainerConnection(mainContainer, true);
		await provider.ensureSynchronized();

		const containerRuntime = dataObject1.context.containerRuntime as ContainerRuntime;
		const { stats, summary } = await containerRuntime.summarize({
			runGC: true,
			fullTree: false,
			trackState: false,
			summaryLogger: logger ?? new TelemetryNullLogger(),
		});

		// Validate stats
		assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
		assert(!summary.unreferenced, "Root summary should be referenced.");
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Generate summary tree 2Mb document";
			maxBenchmarkDurationSeconds = 360000;
			async run() {
				const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
				const testRequest: IRequest = { url: requestUrl };
				await loader.resolve(testRequest);

				dataObject2 = await requestFluidObject<ITestFluidObject>(
					mainContainer,
					defaultDataStoreId,
				);
				dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);
				dataObject2map.set("setup", "done");
				validateMapKeys(dataObject2map, messageCount, maxMessageSizeInBytes);
				await provider.ensureSynchronized();

				const containerRuntime = dataObject2.context.containerRuntime as ContainerRuntime;

				await provider.ensureSynchronized();

				const { stats, summary } = await containerRuntime.summarize({
					runGC: false,
					fullTree: false,
					trackState: false,
					summaryLogger: logger ?? new TelemetryNullLogger(),
				});

				// Validate stats
				assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
				// .metadata, .component, and .attributes blobs
				assert(
					stats.blobNodeCount >= 3,
					`Stats expected at least 3 blob nodes, but had ${stats.blobNodeCount}.`,
				);
				// root node, data store .channels, default data store, dds .channels, and default root dds
				assert(
					stats.treeNodeCount >= 5,
					`Stats expected at least 5 tree nodes, but had ${stats.treeNodeCount}.`,
				);

				// Validate summary
				assert(!summary.unreferenced, "Root summary should be referenced.");

				assert(
					summary.tree[".metadata"]?.type === SummaryType.Blob,
					"Expected .metadata blob in summary root.",
				);
				const metadata = readBlobContent(summary.tree[".metadata"].content) as Record<
					string,
					unknown
				>;
				assert(
					metadata.summaryFormatVersion === 1,
					"Metadata blob should have summaryFormatVersion 1",
				);
				assert(
					metadata.disableIsolatedChannels === undefined,
					"Unexpected metadata blob disableIsolatedChannels",
				);

				const channelsTree = summary.tree[channelsTreeName];
				assert(
					channelsTree?.type === SummaryType.Tree,
					"Expected .channels tree in summary root.",
				);

				const defaultDataStoreNode = channelsTree.tree[dataObject2.context.id];
				assert(
					defaultDataStoreNode?.type === SummaryType.Tree,
					"Expected default data store tree in summary.",
				);
				assert(
					!defaultDataStoreNode.unreferenced,
					"Default data store should be referenced.",
				);
				assert(
					defaultDataStoreNode.tree[".component"]?.type === SummaryType.Blob,
					"Expected .component blob in default data store summary tree.",
				);
				const dataStoreChannelsTree = defaultDataStoreNode.tree[channelsTreeName];
				const attributes = readBlobContent(
					defaultDataStoreNode.tree[".component"].content,
				) as Record<string, unknown>;
				assert(
					attributes.snapshotFormatVersion === undefined,
					"Unexpected datastore attributes snapshotFormatVersion",
				);
				assert(
					attributes.summaryFormatVersion === 2,
					"Datastore attributes summaryFormatVersion should be 2",
				);
				assert(
					attributes.disableIsolatedChannels === undefined,
					"Unexpected datastore attributes disableIsolatedChannels",
				);
				assert(
					dataStoreChannelsTree?.type === SummaryType.Tree,
					"Expected .channels tree in default data store.",
				);

				const defaultDdsNode = dataStoreChannelsTree.tree.root;
				assert(
					defaultDdsNode?.type === SummaryType.Tree,
					"Expected default root DDS in summary.",
				);
				assert(!defaultDdsNode.unreferenced, "Default root DDS should be referenced.");
				assert(
					defaultDdsNode.tree[".attributes"]?.type === SummaryType.Blob,
					"Expected .attributes blob in default root DDS summary tree.",
				);
			}
		})(),
	);
});
