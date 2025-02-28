/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import {
	OptionsMatrix,
	booleanCases,
	generatePairwiseOptions,
	numberCases,
} from "@fluid-private/test-pairwise-generator";
import { ILoaderOptions } from "@fluidframework/container-definitions/internal";
import {
	CompressionAlgorithms,
	disabledCompressionConfig,
	IGCRuntimeOptions,
	ISummaryRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import { ConfigTypes } from "@fluidframework/core-interfaces";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import type { OptionOverride, TestConfiguration } from "./testConfigFile.js";

interface ILoaderOptionsExperimental extends ILoaderOptions {
	enableOfflineSnapshotRefresh?: boolean;
	snapshotRefreshTimeoutMs?: number;
}

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptionsExperimental> = {
	cache: booleanCases,
	client: [undefined],
	provideScopeLoader: booleanCases,
	maxClientLeaveWaitTime: numberCases,
	enableOfflineLoad: booleanCases,
	enableOfflineSnapshotRefresh: booleanCases,
	snapshotRefreshTimeoutMs: [undefined, 60 * 5 * 1000 /* 5min */],
};

export function applyOverrides<T extends Record<string, any>>(
	options: OptionsMatrix<T>,
	optionsOverrides: Partial<OptionsMatrix<T>> | undefined,
) {
	const realOptions: OptionsMatrix<T> = { ...options };
	if (optionsOverrides !== undefined) {
		// The cast is required because TS5 infers that 'key' must be in the set 'keyof T' and
		// notes that the type 'Partial<OptionsMatrix<T>>' may contain additional keys not in T.
		for (const key of Object.keys(optionsOverrides) as (string & keyof T)[]) {
			const override = optionsOverrides[key];
			if (override !== undefined) {
				if (Array.isArray(override)) {
					realOptions[key] = override;
				} else {
					throw new LoggingError(
						`Override for ${key} is not array: ${JSON.stringify(optionsOverrides)}`,
					);
				}
			}
		}
	}
	return realOptions;
}

export const generateLoaderOptions = (
	seed: number,
	overrides: Partial<OptionsMatrix<ILoaderOptionsExperimental>> | undefined,
): ILoaderOptionsExperimental[] => {
	return generatePairwiseOptions<ILoaderOptionsExperimental>(
		applyOverrides(loaderOptionsMatrix, overrides),
		seed,
	);
};

const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
	runFullGC: booleanCases,
	sessionExpiryTimeoutMs: [undefined], // Don't want sessions to expire at a fixed time
	enableGCSweep: [undefined], // Don't need coverage here, GC sweep is tested separately
	sweepGracePeriodMs: [undefined], // Don't need coverage here, GC sweep is tested separately
};

const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
	initialSummarizerDelayMs: numberCases,
	summaryConfigOverrides: [undefined],
};

export function generateRuntimeOptions(
	seed: number,
	overrides: Partial<OptionsMatrix<IContainerRuntimeOptionsInternal>> | undefined,
) {
	const gcOptions = generatePairwiseOptions(
		applyOverrides(gcOptionsMatrix, overrides?.gcOptions as any),
		seed,
	);

	const summaryOptions = generatePairwiseOptions(
		applyOverrides(summaryOptionsMatrix, overrides?.summaryOptions as any),
		seed,
	);

	const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptionsInternal> = {
		gcOptions: [undefined, ...gcOptions],
		summaryOptions: [undefined, ...summaryOptions],
		loadSequenceNumberVerification: [undefined],
		flushMode: [undefined],
		compressionOptions: [
			{ minimumBatchSizeInBytes: 500, compressionAlgorithm: CompressionAlgorithms.lz4 },
		],
		maxBatchSizeInBytes: [716800],
		// Compressed payloads exceeding this size will be chunked into messages of exactly this size
		chunkSizeInBytes: [204800],
		enableRuntimeIdCompressor: ["on", undefined, "delayed"],
		enableGroupedBatching: [true, false],
		explicitSchemaControl: [true, false],
		protocolOptions: [undefined, {}], // TODO: This will change in the future
		compatibilityMode: ["1", "2"],
	};

	const pairwiseOptions = generatePairwiseOptions<IContainerRuntimeOptionsInternal>(
		applyOverrides(runtimeOptionsMatrix, {
			...overrides,
			gcOptions: undefined,
			summaryOptions: undefined,
		}),
		seed,
	);

	// Override compressionOptions to disable it if Grouped Batching is disabled
	pairwiseOptions.map((options) => {
		if (options.enableGroupedBatching === false) {
			(
				options as {
					// Remove readonly modifier to allow overriding
					-readonly [P in keyof IContainerRuntimeOptionsInternal]: IContainerRuntimeOptionsInternal[P];
				}
			).compressionOptions = disabledCompressionConfig;
		}
	});

	return pairwiseOptions;
}

export function generateConfigurations(
	seed: number,
	overrides: OptionsMatrix<Record<string, ConfigTypes>> | undefined,
): Record<string, ConfigTypes>[] {
	if (overrides === undefined) {
		return [{}];
	}
	return generatePairwiseOptions<Record<string, ConfigTypes>>(overrides, seed);
}

/**
 *
 * @param testConfig - the ILoadTestConfig to extract the Option Override from
 * @param driverType - the DriverType being used in the test, used to determine which option override to pick
 * @param endpoint - the Endpoint being used in the test, used to determine which option override to pick
 * @returns an option override
 */
export function getOptionOverride(
	testConfig: TestConfiguration | undefined,
	driverType: TestDriverTypes,
	endpoint: string | undefined,
): OptionOverride | undefined {
	// Specifically using an all or nothing strategy as that's how our current test config options are written today
	// We first search for the key driverType-endpoint, if that doesn't exist then we just key on the driverType
	const driverEndpointOverride = `${driverType}-${endpoint}`;
	return (
		testConfig?.optionOverrides?.[driverEndpointOverride] ??
		testConfig?.optionOverrides?.[driverType]
	);
}
