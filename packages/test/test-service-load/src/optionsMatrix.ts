/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	booleanCases,
	generatePairwiseOptions,
	OptionsMatrix,
	numberCases,
} from "@fluid-private/test-pairwise-generator";
import {
	CompressionAlgorithms,
	IContainerRuntimeOptions,
	IGCRuntimeOptions,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import { ILoaderOptions } from "@fluidframework/container-loader";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ConfigTypes } from "@fluidframework/core-interfaces";
import { ILoadTestConfig, OptionOverride } from "./testConfigFile";

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
	cache: booleanCases,
	provideScopeLoader: booleanCases,
	maxClientLeaveWaitTime: numberCases,
	summarizeProtocolTree: [undefined],
	enableOfflineLoad: booleanCases,
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
	overrides: Partial<OptionsMatrix<ILoaderOptions>> | undefined,
): ILoaderOptions[] => {
	return generatePairwiseOptions<ILoaderOptions>(
		applyOverrides(loaderOptionsMatrix, overrides),
		seed,
	);
};

const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
	disableGC: booleanCases,
	gcAllowed: booleanCases,
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
	overrides: Partial<OptionsMatrix<IContainerRuntimeOptions>> | undefined,
) {
	const gcOptions = generatePairwiseOptions(
		applyOverrides(gcOptionsMatrix, overrides?.gcOptions as any),
		seed,
	);

	const summaryOptions = generatePairwiseOptions(
		applyOverrides(summaryOptionsMatrix, overrides?.summaryOptions as any),
		seed,
	);

	const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
		gcOptions: [undefined, ...gcOptions],
		summaryOptions: [undefined, ...summaryOptions],
		loadSequenceNumberVerification: [undefined],
		flushMode: [undefined],
		compressionOptions: [
			{ minimumBatchSizeInBytes: 500, compressionAlgorithm: CompressionAlgorithms.lz4 },
		],
		maxBatchSizeInBytes: [716800],
		enableOpReentryCheck: [true],
		// Compressed payloads exceeding this size will be chunked into messages of exactly this size
		chunkSizeInBytes: [204800],
		enableRuntimeIdCompressor: [undefined, true],
		enableGroupedBatching: [true, false],
	};

	return generatePairwiseOptions<IContainerRuntimeOptions>(
		applyOverrides(runtimeOptionsMatrix, {
			...overrides,
			gcOptions: undefined,
			summaryOptions: undefined,
		}),
		seed,
	);
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
	testConfig: ILoadTestConfig | undefined,
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
