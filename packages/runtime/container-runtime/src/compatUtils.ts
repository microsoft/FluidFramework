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
enum CompressionAlgorithms {
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
 * Map of IContainerRuntimeOptionsInternal to compat related information.
 * The key is the option name, and the value is an object containing:
 * - minVersionRequired: The minimum version of the container runtime that supports this option being enabled
 * - disabledConfig: The default config of the option when it is disabled
 * - enabledConfig: he default config of the option when it is disabled
 *
 * TODO: Get the exact versions that each option was added in.
 */
const runtimeOptionConfigs: {
	[K in keyof IContainerRuntimeOptionsInternal]?: {
		minVersionRequired: string;
		disabledConfig: IContainerRuntimeOptionsInternal[K];
		enabledConfig: IContainerRuntimeOptionsInternal[K];
	};
} = {
	flushMode: {
		minVersionRequired: "2.0.0",
		disabledConfig: FlushMode.Immediate,
		enabledConfig: defaultFlushMode,
	},
	enableGroupedBatching: {
		minVersionRequired: "2.0.0",
		disabledConfig: false,
		enabledConfig: true,
	},
	explicitSchemaControl: {
		minVersionRequired: "2.0.0",
		disabledConfig: false,
		enabledConfig: true,
	},
	enableRuntimeIdCompressor: {
		minVersionRequired: "2.0.0",
		disabledConfig: undefined,
		enabledConfig: "on",
	},
	compressionOptions: {
		minVersionRequired: "2.0.0",
		disabledConfig: disabledCompressionConfig,
		enabledConfig: enabledCompressionConfig,
	},
	gcOptions: {
		minVersionRequired: "2.0.0",
		disabledConfig: { gcSweep: undefined },
		enabledConfig: { gcSweep: true },
	},
};

/**
 * Returns the default configs for a given compatibility mode.
 */
export function getConfigsForCompatMode(
	compatibilityMode: IContainerRuntimeOptionsInternal["compatibilityMode"],
): {
	[K in keyof IContainerRuntimeOptionsInternal]: IContainerRuntimeOptionsInternal[K];
} {
	assert(compatibilityMode !== undefined, "compatibilityMode should be defined");
	let defaultConfigs: {
		[K in keyof IContainerRuntimeOptionsInternal]: IContainerRuntimeOptionsInternal[K];
	} = {};
	for (const key of Object.keys(runtimeOptionConfigs)) {
		const config = runtimeOptionConfigs[key as keyof IContainerRuntimeOptionsInternal];
		assert(config !== undefined, "config should be defined");
		// If the compatibility mode is greater than or equal to the minimum version
		// required for this option, use the "enabled" value, otherwise use the "disabled" value
		// TODO: Hack for now, use regex or semver later
		const isEnabled = config.minVersionRequired.startsWith(compatibilityMode);
		defaultConfigs = {
			...defaultConfigs,
			[key]: isEnabled ? config.enabledConfig : config.disabledConfig,
		};
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
