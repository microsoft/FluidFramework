/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { compare, gt, gte, lte, valid } from "semver-ts";

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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
 */
export type ConfigMap<T extends Record<string, unknown>> = {
	[K in keyof T]-?: {
		[version: MinimumMinorSemanticVersion]: T[K];
	};
};

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigValidationMap
 *
 * @internal
 */
export type ConfigValidationMap<T extends Record<string, unknown>> = {
	[K in keyof T]-?: (configValue: T[K]) => SemanticVersion | undefined;
};

/**
 * Returns a default configuration given minVersionForCollab and configuration version map.
 *
 * @internal
 */
export function getConfigsForMinVersionForCollab<T extends Record<SemanticVersion, unknown>>(
	minVersionForCollab: SemanticVersion,
	configMap: ConfigMap<T>,
): Partial<T> {
	const defaultConfigs: Partial<T> = {};
	// Iterate over configMap to get default values for each option.
	for (const key of Object.keys(configMap)) {
		const config = configMap[key as keyof T];
		// Sort the versions in ascending order so we can short circuit the loop.
		const versions = Object.keys(config).sort(compare);
		// For each config, we iterate over the keys and check if minVersionForCollab is greater than or equal to the version.
		// If so, we set it as the default value for the option. At the end of the loop we should have the most recent default
		// value that is compatible with the version specified as the minVersionForCollab.
		for (const version of versions) {
			if (gte(minVersionForCollab, version)) {
				defaultConfigs[key] = config[version as MinimumMinorSemanticVersion];
			} else {
				// If the minVersionForCollab is less than the version, we break out of the loop since we don't need to check
				// any later versions.
				break;
			}
		}
	}
	return defaultConfigs;
}

/**
 * Checks if the minVersionForCollab is valid.
 * A valid minVersionForCollab is a MinimumVersionForCollab that is at least `lowestMinVersionForCollab` and less than or equal to the current package version.
 *
 * @internal
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
 * Generic function to validate runtime options against the minVersionForCollab.
 *
 * @internal
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
 * minVersionForCollab in, e.g., {@link @fluidframework/container-runtime#runtimeOptionsAffectingDocSchemaConfigValidationMap}.
 *
 * @internal
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
