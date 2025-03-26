/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	type ICompressionRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "./containerRuntime.js";

// TODO: CompressionAlgorithms and disabledCompressionConfig are copied here to avoid weird circular dependency issue

/**
 * Available compression algorithms for op compression.
 * @legacy
 * @alpha
 */
export enum CompressionAlgorithms {
	lz4 = "lz4",
}

/**
 * @legacy
 * @alpha
 */
export const disabledCompressionConfig: ICompressionRuntimeOptions = {
	minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
	compressionAlgorithm: CompressionAlgorithms.lz4,
};

export const enabledCompressionConfig = {
	// Batches with content size exceeding this value will be compressed
	minimumBatchSizeInBytes: 614400,
	compressionAlgorithm: CompressionAlgorithms.lz4,
};

const defaultFlushMode = FlushMode.TurnBased;

/**
 * Subset of the IContainerRuntimeOptionsInternal properties which are version-dependent.
 */
type IContainerRuntimeOptionsVersionDependent = Pick<
	IContainerRuntimeOptionsInternal,
	| "flushMode"
	| "enableGroupedBatching"
	| "explicitSchemaControl"
	| "enableRuntimeIdCompressor"
	| "compressionOptions"
	| "gcOptions"
>;

/**
 * Map of IContainerRuntimeOptionsInternal to compat related information.
 * The key is the option name, and the value is an object containing:
 * - minVersionRequired: The minimum version of the container runtime that supports the version-dependent option
 * - backwardsCompatConfig: The default config of the option when the runtime does not meets the min version requirement
 * - modernConfig: The default config of the option when the runtime meets the min version requirement
 *
 * TODO: Get the exact versions that each option was added in.
 */
const runtimeOptionConfigs: {
	[K in keyof IContainerRuntimeOptionsVersionDependent]: {
		minVersionRequired: string;
		backwardsCompatConfig: IContainerRuntimeOptionsVersionDependent[K];
		modernConfig: IContainerRuntimeOptionsVersionDependent[K];
	};
} = {
	flushMode: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: FlushMode.Immediate,
		modernConfig: defaultFlushMode,
	},
	enableGroupedBatching: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: false,
		modernConfig: true,
	},
	explicitSchemaControl: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: false,
		modernConfig: true,
	},
	enableRuntimeIdCompressor: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: undefined,
		modernConfig: "on",
	},
	compressionOptions: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: disabledCompressionConfig,
		modernConfig: enabledCompressionConfig,
	},
	gcOptions: {
		minVersionRequired: "2.0.0",
		backwardsCompatConfig: { gcSweep: undefined },
		modernConfig: { gcSweep: true },
	},
};

/**
 * Returns the default configs for a given compatibility mode.
 */
export function getConfigsForCompatMode(
	compatibilityMode: Required<IContainerRuntimeOptionsInternal>["compatibilityMode"],
): IContainerRuntimeOptionsInternal {
	const defaultConfigs: {
		[K in keyof IContainerRuntimeOptionsVersionDependent]: IContainerRuntimeOptionsVersionDependent[K];
	} = {};
	for (const key of Object.keys(runtimeOptionConfigs)) {
		const config = runtimeOptionConfigs[key as keyof IContainerRuntimeOptionsVersionDependent];
		assert(config !== undefined, "config should be defined");
		// If the compatibility mode is greater than or equal to the minimum version
		// required for this option, use the "enabled" value, otherwise use the "disabled" value
		// TODO: Hack for now, use regex or semver later
		const isModernConfig = config.minVersionRequired.startsWith(compatibilityMode);
		defaultConfigs[key] = isModernConfig ? config.modernConfig : config.backwardsCompatConfig;
	}
	return defaultConfigs;
}

/**
 * Returns the disallowed versions for a given compatibility mode.
 */
export function getDisallowedVersions(
	compatibilityMode: IContainerRuntimeOptionsInternal["compatibilityMode"],
): string[] {
	assert(compatibilityMode !== undefined, "compatibilityMode should be defined");
	return compatibilityMode === "1" ? [] : [`<${compatibilityMode}.0.0`];
}
