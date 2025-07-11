/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { compare, gt, gte, lte, valid } from "semver-ts";

import {
	disabledCompressionConfig,
	enabledCompressionConfig,
} from "./compressionDefinitions.js";
import type { ContainerRuntimeOptionsInternal } from "./containerRuntime.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * Our policy is to support N/N-1 compatibility by default, where N is the most
 * recent public major release of the runtime.
 * Therefore, if the customer does not provide a minVersionForCollab, we will
 * default to use N-1.
 *
 * However, this is not consistent with today's behavior. Some options (i.e.
 * batching, compression) are enabled by default despite not being compatible
 * with 1.x clients. Since the policy was introduced during 2.x's lifespan,
 * N/N-1 compatibility by **default** will be in effect starting with 3.0.
 * Importantly though, N/N-2 compatibility is still guaranteed with the proper
 * configurations set.
 *
 * Further to distinguish unspecified `minVersionForCollab` from a specified
 * version and allow `enableExplicitSchemaControl` to default to `true` for
 * any 2.0.0+ version, we will use a special value of `2.0.0-defaults`, which
 * is semantically less than 2.0.0.
 */
export const defaultMinVersionForCollab =
	"2.0.0-defaults" as const satisfies MinimumVersionForCollab;

/**
 * We don't want allow a version before the major public release of the LTS version.
 * Today we use "1.0.0", because our policy supports N/N-1 & N/N-2, which includes
 * all minor versions of N. Though LTS starts at 1.4.0, we should stay consistent
 * with our policy and allow all 1.x versions to be compatible with 2.x.
 */
const lowestMinVersionForCollab = "1.0.0" as const satisfies MinimumVersionForCollab;

/**
 * String in a valid semver format specifying bottom of a minor version
 * or special "defaults" prerelease of a major.
 * @remarks Only 2.0.0-defaults is expected, but index signatures cannot be a
 * literal; so, just allow any major -defaults prerelease.
 */
export type MinimumMinorSemanticVersion = `${bigint}.${bigint}.0` | `${bigint}.0.0-defaults`;

/**
 * String in a valid semver format of a specific version at least specifying minor.
 *
 * @legacy
 * @alpha
 */
export type MinimumVersionForCollab =
	| `${1 | 2}.${bigint}.${bigint}`
	| `${1 | 2}.${bigint}.${bigint}-${string}`;

/**
 * String in a valid semver format of a specific version at least specifying minor.
 * Unlike {@link MinimumVersionForCollab}, this type allows any bigint for the major version.
 * Used as a more generic type that allows major versions other than 1 or 2.
 *
 * @internal
 */
export type SemanticVersion =
	| `${bigint}.${bigint}.${bigint}`
	| `${bigint}.${bigint}.${bigint}-${string}`;

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigMap
 */
export interface ConfigMap<T extends Record<string, unknown>> {
	// 1.0.0 values provide base defaults for all versions.
	"1.0.0": Readonly<T>;
	[version: MinimumMinorSemanticVersion]: Partial<Readonly<T>>;
}

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigValidationMap
 */
export type ConfigValidationMap<T extends Record<string, unknown>> = {
	[K in keyof T]-?: (configValue: T[K]) => SemanticVersion | undefined;
};

/**
 * Subset of the {@link ContainerRuntimeOptionsInternal} properties which
 * affect {@link IDocumentSchemaFeatures}.
 *
 * @remarks
 * When a new option is added to {@link ContainerRuntimeOptionsInternal}, we
 * must consider if it changes the DocumentSchema. If so, then a corresponding
 * entry must be added to {@link runtimeOptionsAffectingDocSchemaConfigMap}
 * below. If not, then it must be omitted from this type.
 *
 * Note: `Omit` is used instead of `Pick` to ensure that all new options are
 * included in this type by default. If any new properties are added to
 * {@link ContainerRuntimeOptionsInternal}, they will be included in this
 * type unless explicitly omitted. This will prevent us from forgetting to
 * account for any new properties in the future.
 */
export type RuntimeOptionsAffectingDocSchema = Omit<
	ContainerRuntimeOptionsInternal,
	| "chunkSizeInBytes"
	| "maxBatchSizeInBytes"
	| "loadSequenceNumberVerification"
	| "summaryOptions"
>;

/**
 * Mapping of RuntimeOptionsAffectingDocSchema to their compatibility related configs.
 *
 * Each key in this map corresponds to a version of the runtime. For each version, it contains values for properties in RuntimeOptionsAffectingDocSchema
 * which should be applied when using minVersionForCollab of that version or later. The "1.0.0" provides the base defaults for all versions.
 *
 * For example if the minVersionForCollab is a 1.x version (i.e. "1.5.0"), then the default value for `enableGroupedBatching` will be false since 1.x
 * clients do not understand the document format when batching is enabled. If the minVersionForCollab is a 2.x client (i.e. "2.0.0" or later), then the
 * default value for `enableGroupedBatching` will be true because clients running 2.0 or later will be able to understand the format changes associated
 * with the batching feature.
 */
const runtimeOptionsAffectingDocSchemaConfigMap = {
	"1.0.0": {
		enableGroupedBatching: false,
		compressionOptions: disabledCompressionConfig,
		enableRuntimeIdCompressor: undefined,
		explicitSchemaControl: false,
		flushMode: FlushMode.Immediate,
		gcOptions: {},
		createBlobPayloadPending: undefined,
	},
	"2.0.0-defaults": {
		enableGroupedBatching: true,
		compressionOptions: enabledCompressionConfig,
		flushMode: FlushMode.TurnBased,
	},
	"2.0.0": {
		explicitSchemaControl: true,
	},
	"3.0.0": {
		gcOptions: { enableGCSweep: true },
	},
} as const satisfies ConfigMap<RuntimeOptionsAffectingDocSchema>;

/**
 * Mapping of RuntimeOptionsAffectingDocSchema config values to functions that return the minimum minVersionForCollab
 * that a config value is considered "valid".
 * A config value is "valid" with a minVersionForCollab if clients running that version or later can understand the
 * format change that is introduced when using that config value.
 *
 * For example, if `true` is passed into the function for `createBlobPayloadPending`, then it will return "2.40.0", since
 * only clients running 2.40.0 or later can understand the format change when `createBlobPayloadPending` is enabled.
 * This is used to ensure that the runtime options passed in by the user are compatible with the minVersionForCollab.
 */
const runtimeOptionsAffectingDocSchemaConfigValidationMap = {
	enableGroupedBatching: configValueToMinVersionForCollab([
		[false, "1.0.0"],
		[true, "2.0.0-defaults"],
	]),
	compressionOptions: configValueToMinVersionForCollab([
		[{ ...disabledCompressionConfig }, "1.0.0"],
		[{ ...enabledCompressionConfig }, "2.0.0-defaults"],
	]),
	enableRuntimeIdCompressor: configValueToMinVersionForCollab([
		[undefined, "1.0.0"],
		["on", "2.0.0-defaults"],
		["delayed", "2.0.0-defaults"],
	]),
	explicitSchemaControl: configValueToMinVersionForCollab([
		[false, "1.0.0"],
		[true, "2.0.0-defaults"],
	]),
	flushMode: configValueToMinVersionForCollab([
		[FlushMode.Immediate, "1.0.0"],
		[FlushMode.TurnBased, "2.0.0-defaults"],
	]),
	gcOptions: configValueToMinVersionForCollab([
		[{ enableGCSweep: undefined }, "1.0.0"],
		[{ enableGCSweep: true }, "2.0.0-defaults"],
	]),
	createBlobPayloadPending: configValueToMinVersionForCollab([
		[undefined, "1.0.0"],
		[true, "2.40.0"],
	]),
} as const satisfies ConfigValidationMap<RuntimeOptionsAffectingDocSchema>;

/**
 * Returns the default RuntimeOptionsAffectingDocSchema configuration for a given minVersionForCollab.
 */
export function getMinVersionForCollabDefaults(
	minVersionForCollab: MinimumVersionForCollab,
): RuntimeOptionsAffectingDocSchema {
	return getConfigsForMinVersionForCollab<RuntimeOptionsAffectingDocSchema>(
		minVersionForCollab,
		runtimeOptionsAffectingDocSchemaConfigMap,
	);
}

/**
 * Returns a default configuration given minVersionForCollab and configuration version map.
 */
export function getConfigsForMinVersionForCollab<T extends Record<string, unknown>>(
	minVersionForCollab: SemanticVersion,
	configMap: ConfigMap<T>,
): T {
	const defaultConfigs: T = { ...configMap["1.0.0"] };
	// Ensure the versions are in ascending order so the latest version is applied last.
	const versions = Object.keys(configMap).sort((a, b) =>
		compare(a, b),
	) as (keyof ConfigMap<T>)[];
	for (const version of versions) {
		if (version === "1.0.0") {
			// Skip the base defaults, as they are already included in defaultConfigs.
			continue;
		}
		if (gte(minVersionForCollab, version)) {
			// If the minVersionForCollab is greater than or equal to the version, then we can apply the defaults for that version.
			for (const [key, value] of Object.entries(configMap[version]) as [
				keyof T,
				T[keyof T],
			][]) {
				defaultConfigs[key] = value;
			}
		}
	}
	return defaultConfigs;
}

/**
 * Checks if the minVersionForCollab is valid.
 * A valid minVersionForCollab is a MinimumVersionForCollab that is at least `lowestMinVersionForCollab` and less than or equal to the current package version.
 */
export function isValidMinVersionForCollab(
	minVersionForCollab: MinimumVersionForCollab,
): boolean {
	return (
		valid(minVersionForCollab) !== null &&
		gte(minVersionForCollab, lowestMinVersionForCollab) &&
		lte(minVersionForCollab, pkgVersion)
	);
}

/**
 * Validates if the runtime options passed in from the user are compatible with the minVersionForCollab.
 * For example, if a user sets the `enableGroupedBatching` option to true, but the minVersionForCollab
 * is set to "1.0.0", then we should throw a UsageError since 1.x clients do not support batching.
 * */
export function validateRuntimeOptions(
	minVersionForCollab: MinimumVersionForCollab,
	runtimeOptions: Partial<ContainerRuntimeOptionsInternal>,
): void {
	getValidationForRuntimeOptions<RuntimeOptionsAffectingDocSchema>(
		minVersionForCollab,
		runtimeOptions as Partial<RuntimeOptionsAffectingDocSchema>,
		runtimeOptionsAffectingDocSchemaConfigValidationMap,
	);
}

/**
 * Generic function to validate runtime options against the minVersionForCollab.
 */
export function getValidationForRuntimeOptions<T extends Record<string, unknown>>(
	minVersionForCollab: SemanticVersion,
	runtimeOptions: Partial<T>,
	validationMap: ConfigValidationMap<T>,
): void {
	if (minVersionForCollab === defaultMinVersionForCollab) {
		// If the minVersionForCollab is set to the default value, then we will not validate the runtime options
		// This is to avoid disruption to users who have not yet set the minVersionForCollab value explicitly.
		return;
	}
	// Iterate through each runtime option passed in by the user
	for (const [passedRuntimeOption, passedRuntimeOptionValue] of Object.entries(
		runtimeOptions,
	) as [keyof T & string, T[keyof T & string]][]) {
		// Skip if passedRuntimeOption is not in validation map
		if (!(passedRuntimeOption in validationMap)) {
			continue;
		}

		const requiredVersion = validationMap[passedRuntimeOption](passedRuntimeOptionValue);
		if (requiredVersion !== undefined && gt(requiredVersion, minVersionForCollab)) {
			throw new UsageError(
				`Runtime option ${passedRuntimeOption}:${JSON.stringify(passedRuntimeOptionValue)} requires ` +
					`runtime version ${requiredVersion}. Please update minVersionForCollab ` +
					`(currently ${minVersionForCollab}) to ${requiredVersion} or later to proceed.`,
			);
		}
	}
}

/**
 * Helper function to map ContainerRuntimeOptionsInternal config values to
 * minVersionForCollab in {@link runtimeOptionsAffectingDocSchemaConfigValidationMap}.
 */
export function configValueToMinVersionForCollab<
	T extends string | number | boolean | undefined | object,
	Arr extends readonly [T, SemanticVersion][],
>(configToMinVer: Arr): (configValue: T) => SemanticVersion | undefined {
	const configValueToRequiredVersionMap = new Map(configToMinVer);
	return (configValue: T) => {
		// If the configValue is not an object then we can get the version required directly from the map.
		if (typeof configValue !== "object") {
			return configValueToRequiredVersionMap.get(configValue);
		}
		// When the input `configValue` is an object, this logic determines the minimum runtime version it requires.
		// It iterates through each entry in `configValueToRequiredVersionMap`. If `possibleConfigValue` shares at
		// least one key-value pair with the input `configValue`, its associated `versionRequired` is collected into
		// `matchingVersions`. After checking all entries, the highest among the collected versions is returned.
		// This represents the overall minimum version required to support the features implied by the input `configValue`.
		const matchingVersions: SemanticVersion[] = [];
		for (const [
			possibleConfigValue,
			versionRequired,
		] of configValueToRequiredVersionMap.entries()) {
			assert(
				typeof possibleConfigValue == "object",
				0xbb9 /* possibleConfigValue should be an object */,
			);
			// Check if `possibleConfigValue` and the input `configValue` share at least one
			// common key-value pair. If they do, the `versionRequired` for this `possibleConfigValue`
			// is added to `matchingVersions`.
			if (Object.entries(possibleConfigValue).some(([k, v]) => configValue[k] === v)) {
				matchingVersions.push(versionRequired);
			}
		}
		if (matchingVersions.length > 0) {
			// Return the latest minVersionForCollab among all matches.
			return matchingVersions.sort((a, b) => compare(b, a))[0];
		}
		// If no matches then we return undefined. This means that the config value passed in
		// does not require a specific minVersionForCollab to be valid.
		return undefined;
	};
}
