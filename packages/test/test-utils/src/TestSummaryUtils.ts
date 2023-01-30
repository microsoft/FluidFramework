/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import {
	IGCRuntimeOptions,
	ISummarizer,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import {
	IContainerRuntimeBase,
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ITestContainerConfig, ITestObjectProvider } from "./testObjectProvider";
import { mockConfigProvider } from "./TestConfigs";
import { waitForContainerConnection } from "./containerUtils";
import { timeoutAwait } from "./timeoutUtils";

const summarizerClientType = "summarizer";

async function createSummarizerCore(
	absoluteUrl: string | undefined,
	loader: IHostLoader,
	summaryVersion?: string,
) {
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

	const fluidObject = await requestFluidObject<FluidObject<ISummarizer>>(summarizerContainer, {
		url: "_summarizer",
	});
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
		maxAckWaitTime: 10000,
		maxOpsSinceLastSummary: 7000,
		initialSummarizerDelayMs: 0,
	},
};

export async function createSummarizerFromFactory(
	provider: ITestObjectProvider,
	container: IContainer,
	dataStoreFactory: IFluidDataStoreFactory,
	summaryVersion?: string,
	containerRuntimeFactoryType = ContainerRuntimeFactoryWithDefaultDataStore,
	registryEntries?: NamedFluidDataStoreRegistryEntries,
): Promise<ISummarizer> {
	const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
		runtime.IFluidHandleContext.resolveHandle(request);
	const runtimeFactory = new containerRuntimeFactoryType(
		dataStoreFactory,
		registryEntries ?? [[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]],
		undefined,
		[innerRequestHandler],
		{ summaryOptions: defaultSummaryOptions },
	);

	const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]], {
		configProvider: mockConfigProvider(),
	});
	const absoluteUrl = await container.getAbsoluteUrl("");
	return (await createSummarizerCore(absoluteUrl, loader, summaryVersion)).summarizer;
}

export async function createSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	summaryVersion?: string,
	gcOptions?: IGCRuntimeOptions,
	configProvider: IConfigProviderBase = mockConfigProvider(),
	logger?: ITelemetryBaseLogger,
): Promise<ISummarizer> {
	const absoluteUrl = await container.getAbsoluteUrl("");
	return (
		await createSummarizerWithContainer(
			provider,
			absoluteUrl,
			summaryVersion,
			gcOptions,
			configProvider,
			logger,
		)
	).summarizer;
}

export async function createSummarizerWithContainer(
	provider: ITestObjectProvider,
	absoluteUrl: string | undefined,
	summaryVersion?: string,
	gcOptions?: IGCRuntimeOptions,
	configProvider: IConfigProviderBase = mockConfigProvider(),
	logger?: ITelemetryBaseLogger,
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: defaultSummaryOptions,
			gcOptions,
		},
		loaderProps: { configProvider, logger },
	};
	const loader = provider.makeTestLoader(testContainerConfig);
	return createSummarizerCore(absoluteUrl, loader, summaryVersion);
}
/**
 * Summarizes on demand and returns the summary tree, the version number and the reference sequence number of the
 * submitted summary.
 */
export async function summarizeNow(summarizer: ISummarizer, reason: string = "end-to-end test") {
	const result = summarizer.summarizeOnDemand({ reason });

	const submitResult = await timeoutAwait(result.summarySubmitted);
	assert(submitResult.success, "on-demand summary should submit");
	assert(
		submitResult.data.stage === "submit",
		"on-demand summary submitted data stage should be submit",
	);
	assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

	const broadcastResult = await timeoutAwait(result.summaryOpBroadcasted);
	assert(broadcastResult.success, "summary op should be broadcast");

	const ackNackResult = await timeoutAwait(result.receivedSummaryAckOrNack);
	assert(ackNackResult.success, "summary op should be acked");

	await new Promise((resolve) => process.nextTick(resolve));

	return {
		summaryTree: submitResult.data.summaryTree,
		summaryVersion: ackNackResult.data.summaryAckOp.contents.handle,
		summaryRefSeq: submitResult.data.referenceSequenceNumber,
	};
}
