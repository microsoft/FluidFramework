/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import * as semver from "semver";

import {
	type ICompressionRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "./containerRuntime.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * List of all 2.x versions where the FF runtime's disallowedVersions implementation uses exact versions.
 * TODO: How do we maintain this list when patches are published? We don't want to fetch these versions from the registry since that will be slow.
 */
const packages2x = [
	"2.0.0",
	"2.0.1",
	"2.0.2",
	"2.0.3",
	"2.0.4",
	"2.0.5",
	"2.1.0",
	"2.0.6",
	"2.2.0",
	"2.3.0",
	"2.0.7",
	"2.1.1",
	"2.2.1",
	"2.0.8",
	"2.0.9",
	"2.1.2",
	"2.2.2",
	"2.3.1",
	"2.4.0",
	"2.5.0",
	"2.10.0",
	"2.11.0",
	"2.12.0",
	"2.13.0",
	"2.20.0",
	"2.21.0",
	"2.22.0",
	"2.22.1",
	"2.23.0",
	"2.30.0",
];

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
 * - legacyConfig: The default config of the option when the runtime does not meets the min version requirement
 * - modernConfig: The default config of the option when the runtime meets the min version requirement
 *
 * TODO: Get the exact versions that each option was added in.
 */
const runtimeOptionConfigs: {
	[K in keyof IContainerRuntimeOptionsVersionDependent]: {
		minVersionRequired: string;
		legacyConfig: IContainerRuntimeOptionsVersionDependent[K];
		modernConfig: IContainerRuntimeOptionsVersionDependent[K];
	};
} = {
	flushMode: {
		minVersionRequired: "2.0.0",
		legacyConfig: FlushMode.Immediate,
		modernConfig: defaultFlushMode,
	},
	enableGroupedBatching: {
		minVersionRequired: "2.0.0",
		legacyConfig: false,
		modernConfig: true,
	},
	explicitSchemaControl: {
		minVersionRequired: "2.0.0",
		legacyConfig: false,
		modernConfig: true,
	},
	enableRuntimeIdCompressor: {
		minVersionRequired: "2.0.0",
		legacyConfig: undefined,
		modernConfig: "on",
	},
	compressionOptions: {
		minVersionRequired: "2.0.0",
		legacyConfig: disabledCompressionConfig,
		modernConfig: enabledCompressionConfig,
	},
	gcOptions: {
		minVersionRequired: "2.0.0",
		legacyConfig: { gcSweep: undefined },
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
		// required for this option, use the "modern" config value, otherwise use the "legacy" config value
		const isModernConfig = semver.gte(compatibilityMode, config.minVersionRequired);
		defaultConfigs[key] = isModernConfig ? config.modernConfig : config.legacyConfig;
	}
	return defaultConfigs;
}

/**
 * Checks if the compatibility mode is valid.
 * A valid compatibility mode is a string that is a valid semver version and is less than or equal to the current package version.
 */
export function isValidCompatMode(
	compatibilityMode: Required<IContainerRuntimeOptionsInternal["compatibilityMode"]>,
): boolean {
	return (
		compatibilityMode !== undefined &&
		semver.valid(compatibilityMode) !== null &&
		semver.lte(compatibilityMode, pkgVersion)
	);
}

/**
 * Returns the disallowed versions for a given compatibility mode.
 */
export function getDisallowedVersions(
	compatibilityMode: IContainerRuntimeOptionsInternal["compatibilityMode"],
): string[] {
	assert(compatibilityMode !== undefined, "compatibilityMode should be defined");

	// If the compatibility mode is less than "2.0.0", then we don't need to disallow any versions.
	// This is because any version less than 2.x will not have the disallowedVersions mechanism, and
	// will instead by disallowed by explicitSchemaControl.
	if (semver.lte(compatibilityMode, "2.0.0")) {
		return [];
	}

	// If the compatibility mode is greater than "2.0.0", then we need to start disallowing 2.x versions.
	// However, this is a bit tricky since some 2.x versions's implementation of disallowedVersions uses exact version
	// matchings (rather than semver comparisons).
	// As a workaround, we need to add all exact versions of 2.x (up until the compatibilityMode version) that use exact
	// version matching to disallow themselves.
	// Then we add the compatibilityMode version itself to disallowedVersions array, to ensure that clients that use
	// semver comparison will disallow themselves if their version is less than the compatibilityMode version.
	return [
		...packages2x.filter((version: string) => {
			return semver.lt(version, compatibilityMode);
		}),
		compatibilityMode,
	];
}
