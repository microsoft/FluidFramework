/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	booleanCases,
	generatePairwiseOptions,
	OptionsMatrix,
	numberCases,
} from "@fluid-internal/test-pairwise-generator";
import {
	CompressionAlgorithms,
	IContainerRuntimeOptions,
	IGCRuntimeOptions,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import { ILoaderOptions } from "@fluidframework/container-loader";
import { ConfigTypes, LoggingError } from "@fluidframework/telemetry-utils";

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
	cache: booleanCases,
	provideScopeLoader: booleanCases,
	maxClientLeaveWaitTime: numberCases,
	summarizeProtocolTree: [undefined],
};

export function applyOverrides<T>(
	options: OptionsMatrix<T>,
	optionsOverrides: Partial<OptionsMatrix<T>> | undefined,
) {
	const realOptions: OptionsMatrix<T> = { ...options };
	if (optionsOverrides !== undefined) {
		for (const key of Object.keys(optionsOverrides)) {
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
	sweepAllowed: [false],
	sessionExpiryTimeoutMs: [undefined], // Don't want coverage here
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
