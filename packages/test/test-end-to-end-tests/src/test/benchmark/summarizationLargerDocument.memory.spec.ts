/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { DefaultSummaryConfiguration, ISummarizer } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
	ChannelFactoryRegistry,
	createSummarizer,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { bufferToString } from "@fluidframework/common-utils";
import { SharedMap } from "@fluidframework/map";
import { IRequest } from "@fluidframework/core-interfaces";
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
	let loader: IHostLoader;
	let summaryVersion: string;

	async function waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	const maxMessageSizeInBytes = 5 * 1024 * 1024; // 1MB
	const messageCount = 2; // Will result in a 10 MB payload

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

		const { summarizer: summarizerClient } = await createSummarizer(provider, mainContainer);
		await provider.ensureSynchronized();
		summaryVersion = await waitForSummary(summarizerClient);
		assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
		summarizerClient.close();
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Generate summary tree 10Mb document";
			dataObject2map: SharedMap | undefined;
			container2: IContainer | undefined;
			summarizerClient2: { container: IContainer; summarizer: ISummarizer } | undefined;
			key: string[] = ["", ""];
			async run() {
				const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
				const testRequest: IRequest = { url: requestUrl };
				this.container2 = await loader.resolve(testRequest);
				const dataObject2 = await requestFluidObject<ITestFluidObject>(
					this.container2,
					defaultDataStoreId,
				);
				this.dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);
				this.dataObject2map.set("setup", "done");
				validateMapKeys(this.dataObject2map, messageCount, maxMessageSizeInBytes);

				for (let i = 0; i < messageCount; i++) {
					this.key[i] = this.dataObject2map.get(`key${i}`) ?? "";
					assert(this.key[i] !== "");
					assert(this.key[i].length === maxMessageSizeInBytes);
				}
				await provider.ensureSynchronized();

				const { summarizer: summarizerClient } = await createSummarizer(
					provider,
					mainContainer,
				);
				summaryVersion = await waitForSummary(summarizerClient);
				assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
				summarizerClient.close();
			}
			beforeIteration() {
				this.dataObject2map = undefined;
				this.container2 = undefined;
				this.summarizerClient2 = undefined;
				this.key = ["", ""];
			}
		})(),
	);
});
