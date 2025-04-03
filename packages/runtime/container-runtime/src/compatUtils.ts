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
 * Our policy is to support N/N-1 compatibility by default, where N is the most recent public major release of the runtime.
 * Therefore, if the customer does not provide a compatibility mode, we will default to use N-1.
 *
 * However, this is not consistent with today's behavior. Some options (i.e. batching, compression) are enabled by default
 * despite not being compatible with 1.x clients. Since the policy was introduced during 2.x's lifespan, N/N-1 compatibility
 * by **default** will be in effect starting with 3.0. Importantly though, N/N-1 compatibility is still guaranteed with the
 * proper configurations set.
 *
 * TODO: This should be updated to "2.0.0" when 3.0 is released.
 */
export const defaultCompatibilityMode = "pre-3.0-default";

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

/**
 * Subset of the IContainerRuntimeOptionsInternal properties which are version-dependent.
 *
 * @remarks
 * When a new option is added to IContainerRuntimeOptionsInternal, we must consider if it's a version-dependent option.
 * If it's considered version-dependent, then a corresponding entry must be added to `versionDependentOptionConfigs`. If not, then
 * it must be omitted from this type.
 *
 * See [TODO: DOC LINK] for more details.
 */
export type IContainerRuntimeOptionsVersionDependent = Required<
	Omit<
		IContainerRuntimeOptionsInternal,
		| "chunkSizeInBytes"
		| "maxBatchSizeInBytes"
		| "loadSequenceNumberVerification"
		| "summaryOptions"
		| "compatibilityMode"
	>
>;

/**
 * Map of version-dependent IContainerRuntimeOptionsInternal keys to their compatibility related information.
 * The key is the option name, and the value is an object containing:
 * - minVersionRequired: The minimum version of the container runtime that is required to use the version-dependent option
 * - legacyConfig: The default config of the option when the runtime does not meets the min version requirement
 * - modernConfig: The default config of the option when the runtime meets the min version requirement
 *
 * TODO: Double check with feature owners that all minVersionRequired are correct
 */
const versionDependentOptionConfigMap: {
	[K in keyof IContainerRuntimeOptionsVersionDependent]: {
		minVersionRequired: string;
		legacyConfig: IContainerRuntimeOptionsVersionDependent[K];
		modernConfig: IContainerRuntimeOptionsVersionDependent[K];
	};
} = {
	enableGroupedBatching: {
		minVersionRequired: "2.0.0-internal.4.1.0",
		legacyConfig: false,
		modernConfig: true,
	},
	compressionOptions: {
		// Note: compression was added earlier, but it should be only enabled by default when clients have access to grouped batching.
		minVersionRequired: "2.0.0-internal.4.1.0",
		legacyConfig: disabledCompressionConfig,
		modernConfig: enabledCompressionConfig,
	},

	enableRuntimeIdCompressor: {
		minVersionRequired: "2.0.0-rc.2.0.0",
		// For IdCompressorMode `undefined` represents a logical state (off). However, to satisfy the Required<>
		// constraint we need to have it defined, so we trick the type checker here.
		legacyConfig: undefined as unknown as "on" | "delayed",
		modernConfig: "on",
	},
	explicitSchemaControl: {
		// This option is unique since it was actually introduced before 2.0.0, but its purpose is to prevent 1.x clients from
		// joining a session. Therefore, we will have it be `true` when the compatibility mode is set to >=2.0.0 and we do not
		// want any 1.x clients to join.
		minVersionRequired: "2.0.0",
		legacyConfig: false,
		modernConfig: true,
	},
	flushMode: {
		// Note: 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
		// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
		// fewer messages will be included per flush.
		minVersionRequired: "2.0.0",
		legacyConfig: FlushMode.Immediate,
		modernConfig: FlushMode.TurnBased,
	},
	gcOptions: {
		// Explicitly disable running Sweep in compat mode "2". Although sweep is supported in 2.x, it is disabled by default.
		// This setting explicitly disables it to be extra safe.
		// TODO: Get actual version this should be enabled by default.
		minVersionRequired: "2.10.0",
		legacyConfig: {},
		modernConfig: { gcSweep: true },
	},
};

/**
 * Returns the default version-dependent configs for a given compatibility mode.
 */
export function getConfigsForCompatMode(
	compatibilityMode: Required<IContainerRuntimeOptionsInternal>["compatibilityMode"],
): IContainerRuntimeOptionsVersionDependent {
	const defaultConfigs = {
		gcOptions: {},
		flushMode: FlushMode.TurnBased,
		compressionOptions: enabledCompressionConfig,
		enableRuntimeIdCompressor: undefined as unknown as "on" | "delayed",
		enableGroupedBatching: true,
		explicitSchemaControl: false,
	};

	// TODO: Remove this block after 3.0 is released.
	// Note: we compare `compatibilityMode` with the exact string "pre-3.0-default" in case we modify `defaultCompatibilityMode` in the future,
	// but forget to remove this block.
	if (compatibilityMode === "pre-3.0-default") {
		return defaultConfigs;
	}

	for (const key of Object.keys(versionDependentOptionConfigMap)) {
		const config =
			versionDependentOptionConfigMap[key as keyof IContainerRuntimeOptionsVersionDependent];
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
		// TODO: We can remove the first condition after 3.0 is released and the defaultCompatibilityMode is set to "2.0.0".
		compatibilityMode === defaultCompatibilityMode ||
		(compatibilityMode !== undefined &&
			semver.valid(compatibilityMode) !== null &&
			semver.lte(compatibilityMode, pkgVersion))
	);
}
