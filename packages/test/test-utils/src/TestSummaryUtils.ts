/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IHostLoader,
	IRuntimeFactory,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	type IContainerRuntimeOptions,
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	IOnDemandSummarizeOptions,
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	ISummarizer,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import {
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";

import { createTestConfigProvider } from "./TestConfigs.js";
// eslint-disable-next-line import-x/no-deprecated
import { ContainerRuntimeFactoryWithDefaultDataStore } from "./containerRuntimeFactories.js";
import { waitForContainerConnection } from "./containerUtils.js";
import { defaultTestOldestSupportedClient } from "./testCompatibility.js";
import { ITestContainerConfig, ITestObjectProvider } from "./testObjectProvider.js";
import { timeoutAwait } from "./timeoutUtils.js";

const summarizerClientType = "summarizer";

/**
 * @internal
 */
export async function createSummarizerCore(
	container: IContainer,
	loader: IHostLoader,
	summaryVersion?: string,
): Promise<{
	container: IContainer;
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	summarizer: ISummarizer;
}> {
	const absoluteUrl = await container.getAbsoluteUrl("");
	if (absoluteUrl === undefined) {
		throw new Error("URL could not be resolved");
	}

	const request: IRequest = {
		headers: {
			[LoaderHeader.cache]: false,
			[LoaderHeader.clientDetails]: {
				capabilities: { interactive: false },
				type: summarizerClientType,
			},
			[DriverHeader.summarizingClient]: true,
			[LoaderHeader.version]: summaryVersion,
		},
		url: absoluteUrl,
	};
	const summarizerContainer = await loader.resolve(request);
	await waitForContainerConnection(summarizerContainer);

	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	const fluidObject = (await summarizerContainer.getEntryPoint()) as ISummarizer;
	if (fluidObject.ISummarizer === undefined) {
		throw new Error("Fluid object does not implement ISummarizer");
	}

	return {
		container: summarizerContainer,
		summarizer: fluidObject.ISummarizer,
	};
}

const defaultSummaryOptions: ISummaryRuntimeOptions = {
	summaryConfigOverrides: {
		state: "disableHeuristics",
		maxAckWaitTime: 20000, // Some of the AFR tests take a long time to ack.
		maxOpsSinceLastSummary: 7000,
		initialSummarizerDelayMs: 0,
	},
};

/**
 * Creates a summarizer client from the given container and data store factory, and returns the summarizer client's
 * IContainer and ISummarizer.
 * The ISummarizer can be used to generate on-demand summaries. The IContainer can be used to fetch data stores, etc.
 * @internal
 */
export async function createSummarizerFromFactory(
	provider: ITestObjectProvider,
	container: IContainer,
	dataStoreFactory: IFluidDataStoreFactory,
	summaryVersion?: string,
	containerRuntimeFactoryType?: new (props: {
		defaultFactory: IFluidDataStoreFactory;
		oldestSupportedClient: typeof defaultTestOldestSupportedClient;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		runtimeOptions?: IContainerRuntimeOptions;
	}) => IRuntimeFactory,
	registryEntries?: NamedFluidDataStoreRegistryEntries,
	logger?: ITelemetryBaseLogger,
	configProvider: IConfigProviderBase = createTestConfigProvider(),
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const RuntimeFactory =
		// eslint-disable-next-line import-x/no-deprecated
		containerRuntimeFactoryType ?? ContainerRuntimeFactoryWithDefaultDataStore;
	const runtimeFactory = new RuntimeFactory({
		defaultFactory: dataStoreFactory,
		oldestSupportedClient: defaultTestOldestSupportedClient,
		registryEntries: registryEntries ?? [
			[dataStoreFactory.type, Promise.resolve(dataStoreFactory)],
		],
		runtimeOptions: { summaryOptions: defaultSummaryOptions },
	});

	const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]], {
		configProvider,
		logger,
	});
	return createSummarizerCore(container, loader, summaryVersion);
}

/**
 * Creates a summarizer client from the given container and returns the summarizer client's IContainer and ISummarizer.
 * The ISummarizer can be used to generate on-demand summaries. The IContainer can be used to fetch data stores, etc.
 *
 * Can pass in a test config provider to enable/disable features.
 * @internal
 */
export async function createSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	config?: ITestContainerConfig,
	summaryVersion?: string,
	logger?: ITelemetryBaseLogger,
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const testContainerConfig: ITestContainerConfig = {
		...config,
		runtimeOptions: {
			...config?.runtimeOptions,
			summaryOptions: config?.runtimeOptions?.summaryOptions ?? defaultSummaryOptions,
		},
		loaderProps: {
			...config?.loaderProps,
			configProvider: config?.loaderProps?.configProvider ?? createTestConfigProvider(),
			logger,
		},
	};
	const loader = provider.makeTestLoader(testContainerConfig);
	return createSummarizerCore(container, loader, summaryVersion);
}

/**
 * Summarizes on demand and returns the summary tree, the version number and the reference sequence number of the
 * submitted summary.
 *
 * @param summarizer - The ISummarizer to use to summarize on demand
 * @param inputs - Either the reason string or the full IOnDemandSummarizeOptions.
 * Defaults to the reason "end-to-end test".
 * @internal
 */
export async function summarizeNow(
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	summarizer: ISummarizer,
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	inputs: string | IOnDemandSummarizeOptions = "end-to-end test",
): Promise<SummaryInfo> {
	// eslint-disable-next-line import-x/no-deprecated -- Internal test helpers retain summarizer implementation access (AB#88250).
	const options: IOnDemandSummarizeOptions =
		typeof inputs === "string" ? { reason: inputs } : inputs;
	const result = summarizer.summarizeOnDemand(options);

	const submitResult = await timeoutAwait(result.summarySubmitted, {
		errorMsg: "Promise timed out: summarySubmitted",
	});
	if (!submitResult.success) {
		throw submitResult.error;
	}
	assert(
		submitResult.data.stage === "submit",
		"on-demand summary submitted data stage should be submit",
	);
	assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

	const broadcastResult = await timeoutAwait(result.summaryOpBroadcasted, {
		errorMsg: "Promise timed out: summaryOpBroadcasted",
	});
	if (!broadcastResult.success) {
		throw broadcastResult.error;
	}

	const ackNackResult = await timeoutAwait(result.receivedSummaryAckOrNack, {
		errorMsg: "Promise timed out: receivedSummaryAckOrNack",
	});
	if (!ackNackResult.success) {
		throw ackNackResult.error;
	}

	await new Promise((resolve) => process.nextTick(resolve));

	return {
		summaryTree: submitResult.data.summaryTree,
		summaryVersion: ackNackResult.data.summaryAckOp.contents.handle,
		summaryRefSeq: submitResult.data.referenceSequenceNumber,
	};
}

/**
 * Summary information containing the summary tree, summary version, and summary sequence number.
 * @internal
 */
export interface SummaryInfo {
	/**
	 * The summary tree generated
	 */
	summaryTree: ISummaryTree;
	/**
	 * Handle of the completed summary
	 */
	summaryVersion: string;
	/**
	 * Reference sequence number of the current summary generation
	 */
	summaryRefSeq: number;
}
