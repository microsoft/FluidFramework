/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/core-utils";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import {
	IOnDemandSummarizeOptions,
	ISummarizer,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import {
	ITelemetryBaseLogger,
	FluidObject,
	IRequest,
	IConfigProviderBase,
} from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { ITestContainerConfig, ITestObjectProvider } from "./testObjectProvider";
import { mockConfigProvider } from "./TestConfigs";
import { waitForContainerConnection } from "./containerUtils";
import { timeoutAwait } from "./timeoutUtils";
import { createContainerRuntimeFactoryWithDefaultDataStore } from "./testContainerRuntimeFactoryWithDefaultDataStore";

const summarizerClientType = "summarizer";

async function createSummarizerCore(
	container: IContainer,
	loader: IHostLoader,
	summaryVersion?: string,
) {
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

	const fluidObject: FluidObject<ISummarizer> | undefined =
		await summarizerContainer.getEntryPoint();
	if (fluidObject?.ISummarizer === undefined) {
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
	containerRuntimeFactoryType = ContainerRuntimeFactoryWithDefaultDataStore,
	registryEntries?: NamedFluidDataStoreRegistryEntries,
	logger?: ITelemetryBaseLogger,
	configProvider: IConfigProviderBase = mockConfigProvider(),
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		containerRuntimeFactoryType,
		{
			defaultFactory: dataStoreFactory,
			registryEntries: registryEntries ?? [
				[dataStoreFactory.type, Promise.resolve(dataStoreFactory)],
			],
			runtimeOptions: { summaryOptions: defaultSummaryOptions },
		},
	);

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
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const testContainerConfig: ITestContainerConfig = {
		...config,
		runtimeOptions: {
			...config?.runtimeOptions,
			summaryOptions: config?.runtimeOptions?.summaryOptions ?? defaultSummaryOptions,
		},
		loaderProps: {
			...config?.loaderProps,
			configProvider: config?.loaderProps?.configProvider ?? mockConfigProvider(),
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
	summarizer: ISummarizer,
	inputs: string | IOnDemandSummarizeOptions = "end-to-end test",
) {
	const options: IOnDemandSummarizeOptions =
		typeof inputs === "string" ? { reason: inputs } : inputs;
	const result = summarizer.summarizeOnDemand(options);

	const submitResult = await timeoutAwait(result.summarySubmitted);
	if (!submitResult.success) {
		if (typeof submitResult.error !== "string") {
			submitResult.error.data = submitResult.data;
		}
		throw submitResult.error;
	}
	assert(
		submitResult.data.stage === "submit",
		"on-demand summary submitted data stage should be submit",
	);
	assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

	const broadcastResult = await timeoutAwait(result.summaryOpBroadcasted);
	if (!broadcastResult.success) {
		throw broadcastResult.error;
	}

	const ackNackResult = await timeoutAwait(result.receivedSummaryAckOrNack);
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
