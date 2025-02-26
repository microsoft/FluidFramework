/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IHostLoader,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	// eslint-disable-next-line import/no-deprecated
	IOnDemandSummarizeOptions,
	ISummarizer,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import {
	IConfigProviderBase,
	IRequest,
	IResponse,
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
// eslint-disable-next-line import/no-deprecated
import { ContainerRuntimeFactoryWithDefaultDataStore } from "./containerRuntimeFactories.js";
import { waitForContainerConnection } from "./containerUtils.js";
import {
	type ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "./testContainerRuntimeFactoryWithDefaultDataStore.js";
import { ITestContainerConfig, ITestObjectProvider } from "./testObjectProvider.js";
import { timeoutAwait } from "./timeoutUtils.js";

const summarizerClientType = "summarizer";

/**
 * This function should ONLY be used for back compat purposes
 * LTS versions of the Loader/Container will not have the "getEntryPoint" method, so we need to fallback to "request"
 * This function can be removed once LTS version of Loader moves to 2.0.0-internal.7.0.0
 * @internal
 */
async function getSummarizerBackCompat(container: IContainer): Promise<ISummarizer> {
	if (container.getEntryPoint !== undefined) {
		const entryPoint = await container.getEntryPoint();
		// Note: We need to also check if the result of `getEntryPoint()` is defined. This is because when running
		// cross version compat testing scenarios, if we create with 1.X container and load with 2.X then the
		// function container.getEntryPoint will be defined for the 2.X container. However, it will not return undefined
		// since the container's runtime will be on version 1.X, which does not have an entry point defined.
		if (entryPoint !== undefined) {
			return entryPoint as ISummarizer;
		}
	}
	const response: IResponse = await (container as any).request({ url: "_summarizer" });
	assert(response.status === 200, "requesting '/' should return default data object");
	return response.value as ISummarizer;
}

/** @internal */
export async function createSummarizerCore(
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

	// Old loaders will not have getEntryPoint API on the container. So, use getSummarizerBackCompat which
	// will use request pattern to get the summarizer in these old loaders.
	const fluidObject = await getSummarizerBackCompat(summarizerContainer);
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
	containerRuntimeFactoryType?: ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	registryEntries?: NamedFluidDataStoreRegistryEntries,
	logger?: ITelemetryBaseLogger,
	configProvider: IConfigProviderBase = createTestConfigProvider(),
): Promise<{ container: IContainer; summarizer: ISummarizer }> {
	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		// eslint-disable-next-line import/no-deprecated
		containerRuntimeFactoryType ?? ContainerRuntimeFactoryWithDefaultDataStore,
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
	summarizer: ISummarizer,
	inputs: string | IOnDemandSummarizeOptions = "end-to-end test",
): Promise<SummaryInfo> {
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
