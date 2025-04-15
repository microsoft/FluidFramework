/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlushMode } from "@fluidframework/runtime-definitions/internal";
// The semver package documents and encourages these imports for users that only need some of the semver functionality.
// eslint-disable-next-line import/no-internal-modules
import semverGte from "semver/functions/gte.js";
// eslint-disable-next-line import/no-internal-modules
import semverLte from "semver/functions/lte.js";
// eslint-disable-next-line import/no-internal-modules
import semverValid from "semver/functions/valid.js";

import {
	disabledCompressionConfig,
	enabledCompressionConfig,
} from "./compressionDefinitions.js";
import { type IContainerRuntimeOptionsInternal } from "./containerRuntime.js";
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
 * The current default set of configurations if no compatibility mode is provided.
 * Since both compatibilityMode and the cross-client compat policy was introduced during 2.x's lifespan, we will maintain the
 * set of default configurations that were in place before compatibilityMode and the policy were introduced.
 * TODO: This can be removed after 3.0 is released.
 */
const defaultConfigsForPreFF3: IContainerRuntimeOptionsVersionDependent = {
	gcOptions: {},
	flushMode: FlushMode.TurnBased,
	compressionOptions: enabledCompressionConfig,
	enableRuntimeIdCompressor: undefined as unknown as "on" | "delayed",
	enableGroupedBatching: true,
	explicitSchemaControl: false,
};

/**
 * Subset of the IContainerRuntimeOptionsInternal properties which are version-dependent.
 *
 * @remarks
 * When a new option is added to IContainerRuntimeOptionsInternal, we must consider if it's a version-dependent option.
 * If it's considered version-dependent, then a corresponding entry must be added to `versionDependentOptionConfigs`. If not, then
 * it must be omitted from this type.
 *
 * Note: We use `Omit` instead of `Pick` to ensure that all new options are included in this type by default. If any new properties
 * are added to IContainerRuntimeOptionsInternal, they will be included in this type unless explicitly omitted. This will prevent
 * us from forgetting to account for any new properties in the future.
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
 * Default configurations for version-dependent options based on the compatibilityMode.
 */
interface IVersionDependentOptionConfig<
	K extends keyof IContainerRuntimeOptionsVersionDependent,
> {
	/**
	 * The minimum version of the container runtime that is required to use the modern config for the
	 * option. This will compared with the compatibilityMode to determine if the modern or back-compat config
	 * should be used by default.
	 * This should be undefined if no versions are ready to use the modern config by default. In this case,
	 * we will always default to the back-compat config.
	 */
	minVersionForModernConfig: string | undefined;
	/**
	 * The default config for the version-dependent option that ensures clients that do not understand the
	 * modern config will not break.
	 * This is the config that will be used by default when the compatibilityMode is less than minVersionForModernConfig.
	 */
	backCompatConfig: IContainerRuntimeOptionsVersionDependent[K];
	/**
	 * The default config for the version-dependent option when all clients are expected to understand the modern config.
	 * This is the config that will be used by default when the compatibilityMode is at least minVersionForModernConfig.
	 */
	modernConfig: IContainerRuntimeOptionsVersionDependent[K];
}

/**
 * Mapping of version-dependent options to their compatibility related configs.
 */
const versionDependentOptionConfigMap: {
	[K in keyof IContainerRuntimeOptionsVersionDependent]: IVersionDependentOptionConfig<K>;
} = {
	enableGroupedBatching: {
		minVersionForModernConfig: "2.0.0",
		backCompatConfig: false,
		modernConfig: true,
	},
	compressionOptions: {
		minVersionForModernConfig: "2.0.0",
		backCompatConfig: disabledCompressionConfig,
		modernConfig: enabledCompressionConfig,
	},

	enableRuntimeIdCompressor: {
		// We do not yet want to enable idCompressor by default since it will increase bundle sizes,
		// and not all customers will benefit from it. Therefore, we will require customers to explicitly
		// enable it. We are keeping it as a version-dependent option as this may change in the future.
		minVersionForModernConfig: undefined,
		// For IdCompressorMode, `undefined` represents a logical state (off). However, to satisfy the Required<>
		// constraint we need to have it defined, so we trick the type checker here.
		backCompatConfig: undefined as unknown as "on" | "delayed",
		modernConfig: "on",
	},
	explicitSchemaControl: {
		// This option is unique since it was actually introduced before 2.0.0, but its purpose is to prevent 1.x clients from
		// joining a session. Therefore, we will have it be `true` when the compatibility mode is set to >=2.0.0 and we do not
		// want any 1.x clients to join.
		minVersionForModernConfig: "2.0.0",
		backCompatConfig: false,
		modernConfig: true,
	},
	flushMode: {
		// Note: 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
		// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
		// fewer messages will be included per flush.
		minVersionForModernConfig: "2.0.0",
		backCompatConfig: FlushMode.Immediate,
		modernConfig: FlushMode.TurnBased,
	},
	gcOptions: {
		// Explicitly disable running Sweep in compat mode "2". Although sweep is supported in 2.x, it is disabled by default.
		// This setting explicitly disables it to be extra safe.
		minVersionForModernConfig: "3.0.0",
		backCompatConfig: {},
		modernConfig: { enableGCSweep: true },
	},
};

/**
 * Returns the default version-dependent configs for a given compatibility mode.
 */
export function getConfigsForCompatMode(
	compatibilityMode: Required<IContainerRuntimeOptionsInternal>["compatibilityMode"],
): IContainerRuntimeOptionsVersionDependent {
	// TODO: Remove this block after 3.0 is released.
	// Note: we compare `compatibilityMode` with the exact string "pre-3.0-default" in case we modify `defaultCompatibilityMode` in the future,
	// but forget to remove this block.
	if (compatibilityMode === "pre-3.0-default") {
		return defaultConfigsForPreFF3;
	}

	const defaultConfigs = {};
	for (const key of Object.keys(versionDependentOptionConfigMap)) {
		const config =
			versionDependentOptionConfigMap[key as keyof IContainerRuntimeOptionsVersionDependent];
		// If the compatibility mode is greater than or equal to the minimum version
		// required for this option, use the "modern" config value, otherwise use the "back-compat" config value
		const isModernConfig =
			config.minVersionForModernConfig === undefined
				? false // If the minVersionForModernConfig is undefined, we always use the back-compat config
				: semverGte(compatibilityMode, config.minVersionForModernConfig);
		defaultConfigs[key] = isModernConfig ? config.modernConfig : config.backCompatConfig;
	}
	return defaultConfigs as IContainerRuntimeOptionsVersionDependent;
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
			semverValid(compatibilityMode) !== null &&
			semverLte(compatibilityMode, pkgVersion))
	);
}
