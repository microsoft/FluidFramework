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
 */
export const defaultCompatibilityMode = "2.0.0" as const;

/**
 * String in a valid semver format.
 */
export type SemanticVersion =
	| `${number}.${number}.${number}`
	| `${number}.${number}.${number}-${string}`;

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigMap
 */
export type ConfigMap<T extends Record<string, unknown>> = {
	[K in keyof T]: {
		[version: SemanticVersion]: T[K];
	};
};

/**
 * Subset of the IContainerRuntimeOptionsInternal properties which affect the DocumentSchema.
 *
 * @remarks
 * When a new option is added to IContainerRuntimeOptionsInternal, we must consider if it changes the DocumentSchema.
 * If so, then a corresponding entry must be added to `runtimeOptionsAffectingDocSchemaConfigMap` below. If not, then
 * it must be omitted from this type.
 *
 * Note: We use `Omit` instead of `Pick` to ensure that all new options are included in this type by default. If any new properties
 * are added to IContainerRuntimeOptionsInternal, they will be included in this type unless explicitly omitted. This will prevent
 * us from forgetting to account for any new properties in the future.
 */
export type RuntimeOptionsAffectingDocSchema = Required<
	Omit<
		IContainerRuntimeOptionsInternal,
		| "chunkSizeInBytes"
		| "maxBatchSizeInBytes"
		| "loadSequenceNumberVerification"
		| "summaryOptions"
	>
>;

/**
 * Mapping of RuntimeOptionsAffectingDocSchema to their compatibility related configs.
 *
 * Each key in this map corresponds to a property in RuntimeOptionsAffectingDocSchema. The value is an object that maps SemanticVersions
 * to the appropriate default value for that property to supporting that SemanticVersion. If clients running SemanticVersion X are able to understand
 * the format changes introduced by the property, then the default value for that SemanticVersion will enable the feature associated with the property.
 * Otherwise, the feature will be disabled.
 *
 * For example if the compatibilityMode is a 1.x version (i.e. "1.5.0"), then the default value for `enableGroupedBatching` will be false since 1.x
 * clients do not understand the document format when batching is enabled. If the compatibilityMode is a 2.x client (i.e. "2.0.0" or later), then the
 * default value for `enableGroupedBatching` will be true because clients running 2.0 or later will be able to understand the format changes associated
 * with the batching feature.
 */
const runtimeOptionsAffectingDocSchemaConfigMap: ConfigMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: {
			"1.0.0": false,
			"2.0.0": true,
		},
		compressionOptions: {
			"1.0.0": disabledCompressionConfig,
			"2.0.0": enabledCompressionConfig,
		},
		enableRuntimeIdCompressor: {
			// For IdCompressorMode, `undefined` represents a logical state (off). However, to satisfy the Required<>
			// constraint we need to have it defined, so we trick the type checker here.
			"1.0.0": undefined as unknown as "on" | "delayed",
			// We do not yet want to enable idCompressor by default since it will increase bundle sizes,
			// and not all customers will benefit from it. Therefore, we will require customers to explicitly
			// enable it. We are keeping it as a DocSchema affecting option for now as this may change in the future.
		},
		explicitSchemaControl: {
			"1.0.0": false,
			// This option's intention is to prevent 1.x clients from joining sessions when enabled. Ideally, we would set this to true
			// when the compatibility mode is set to >=2.0.0. However, this option is unique because it was not enabled by default prior
			// to the implementation of compatibilityMode. Because `defaultCompatibilityMode` is set to "2.0.0", we need to ensure this option
			// is not suddenly enabled by default unexpectedly. Therefore, we will set it to true starting at compatibilityMode>="2.0.1" to
			// ensure that customers who do not provide compatibilityMode will not see any behavior change.
			"2.0.1": true,
		},
		flushMode: {
			// Note: 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
			// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
			// fewer messages will be included per flush.
			"1.0.0": FlushMode.Immediate,
			"2.0.0": FlushMode.TurnBased,
		},
		gcOptions: {
			"1.0.0": {},
			// Although sweep is supported in 2.x, it is disabled by default until compatibilityMode>=3.0.0 to be extra safe.
			"3.0.0": { enableGCSweep: true },
		},
	};

/**
 * Returns the default RuntimeOptionsAffectingDocSchema configuration for a given compatibility mode.
 */
export function getConfigsForCompatMode<
	T extends Record<string, unknown> = RuntimeOptionsAffectingDocSchema,
>(
	compatibilityMode: SemanticVersion,
	// We allow passing in a custom configMap for unit tests. Otherwise, we should never need to pass in a configMap.
	configMap: ConfigMap<T> = runtimeOptionsAffectingDocSchemaConfigMap as ConfigMap<T>,
): T {
	const defaultConfigs = {};
	// Iterate over runtimeOptionsAffectingDocSchemaConfigMap to get default values for each option.
	for (const key of Object.keys(configMap)) {
		const config = configMap[key as keyof T];
		// Sort the versions in ascending order so we can short circuit the loop.
		const versions = Object.keys(config).sort((a, b) => (semverGte(b, a) ? -1 : 1));
		// For each config, we iterate over the keys and check if compatibilityMode is greater than or equal to the version.
		// If so, we set it as the default value for the option. At the end of the loop we should have the most recent default
		// value that is compatible with the version specified as the compatibilityMode.
		for (const version of versions) {
			if (semverGte(compatibilityMode, version)) {
				defaultConfigs[key] = config[version as SemanticVersion];
			} else {
				// If the compatibility mode is less than the version, we break out of the loop since we don't need to check
				// any later versions.
				break;
			}
		}
	}
	return defaultConfigs as T;
}

/**
 * Checks if the compatibility mode is valid.
 * A valid compatibility mode is a string that is a valid semver version and is less than or equal to the current package version.
 */
export function isValidCompatMode(compatibilityMode: SemanticVersion): boolean {
	return (
		compatibilityMode !== undefined &&
		semverValid(compatibilityMode) !== null &&
		semverLte(compatibilityMode, pkgVersion)
	);
}
