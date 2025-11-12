/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { compare, gt, gte, lte, valid } from "semver-ts";

import { pkgVersion } from "./packageVersion.js";

/**
 * Our policy is to support major versions N and N-1, where N is most
 * recent public major release of the Fluid Framework Client.
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
 *
 * @privateRemarks
 * Exported for use in tests.
 *
 * @internal
 */
export const lowestMinVersionForCollab = "1.0.0" as const satisfies MinimumVersionForCollab;

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
 * Unlike {@link @fluidframework/runtime-definitions#MinimumVersionForCollab}, this type allows any bigint for the major version.
 * Used as a more generic type that allows major versions other than 1 or 2.
 *
 * @internal
 */
export type SemanticVersion =
	| `${bigint}.${bigint}.${bigint}`
	| `${bigint}.${bigint}.${bigint}-${string}`;

/**
 * Converts a record into a configuration map that associates each key with with an instance of its value type that based on a {@link MinimumMinorSemanticVersion}.
 * @remarks
 * For a given input {@link @fluidframework/runtime-definitions#MinimumVersionForCollab},
 * the corresponding configuration values can be found by using the entry in the inner objects with the highest {@link MinimumMinorSemanticVersion}
 * that does not exceed the given {@link @fluidframework/runtime-definitions#MinimumVersionForCollab}.
 *
 * Use {@link getConfigsForMinVersionForCollab} to retrieve the configuration for a given a {@link @fluidframework/runtime-definitions#MinimumVersionForCollab}.
 *
 * See the remarks on {@link MinimumMinorSemanticVersion} for some limitation on how ConfigMaps must handle versioning.
 * @internal
 */
export type ConfigMap<T extends Record<string, unknown>> = {
	readonly [K in keyof T]-?: ConfigMapEntry<T[K]>;
};

/**
 * Entry in {@link ConfigMap} associating {@link MinimumMinorSemanticVersion} with configuration values that became supported in that version.
 * @remarks
 * All entries must at least provide an entry for {@link lowestMinVersionForCollab}
 * @internal
 */
export interface ConfigMapEntry<T> {
	[version: MinimumMinorSemanticVersion]: T;
	// Require an entry for the defaultMinVersionForCollab:
	// this ensures that all versions of lowestMinVersionForCollab or later have a specified value in the ConfigMap.
	[lowestMinVersionForCollab]: T;
}

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigValidationMap
 *
 * @internal
 */
export type ConfigValidationMap<T extends Record<string, unknown>> = {
	readonly [K in keyof T]-?: (configValue: T[K]) => SemanticVersion | undefined;
};

/**
 * Returns a default configuration given minVersionForCollab and configuration version map.
 *
 * @internal
 */
export function getConfigsForMinVersionForCollab<T extends Record<SemanticVersion, unknown>>(
	minVersionForCollab: SemanticVersion,
	configMap: ConfigMap<T> & Record<string, ConfigMapEntry<T[keyof T]>>,
): Partial<T> {
	semanticVersionToMinimumVersionForCollab(minVersionForCollab);
	const defaultConfigs: Partial<T> = {};
	// Iterate over configMap to get default values for each option.
	for (const [key, config] of Object.entries(configMap)) {
		// Sort the versions in descending order to find the largest compatible entry.
		const versions = (Object.entries(config) as [MinimumMinorSemanticVersion, unknown][]).sort(
			(a, b) => compare(b[0], a[0]),
		);
		// For each config, we iterate over the keys and check if minVersionForCollab is greater than or equal to the version.
		// If so, we set it as the default value for the option.
		for (const [version, value] of versions) {
			if (gte(minVersionForCollab, version)) {
				defaultConfigs[key] = value;
				break;
			}
		}
		assert(key in defaultConfigs, "missing config map entry");
	}
	return defaultConfigs as T;
}

/**
 * Returns detailed information about the validity of a minVersionForCollab.
 * @param minVersionForCollab - The minVersionForCollab to validate.
 * @returns An object containing the validity information.
 *
 * @internal
 */
export function checkValidMinVersionForCollabVerbose(minVersionForCollab: SemanticVersion): {
	isValidSemver: boolean;
	isGteLowestMinVersion: boolean;
	isLtePkgVersion: boolean;
} {
	const isValidSemver = valid(minVersionForCollab) !== null;
	return {
		isValidSemver,

		// We have to check if the value is a valid semver before calling gte/lte, otherwise they will throw when parsing the version.
		isGteLowestMinVersion:
			isValidSemver && gte(minVersionForCollab, lowestMinVersionForCollab),
		isLtePkgVersion: isValidSemver && lte(minVersionForCollab, pkgVersion),
	};
}

/**
 * Checks if the minVersionForCollab is valid.
 * A valid minVersionForCollab is a MinimumVersionForCollab that is at least `lowestMinVersionForCollab` and less than or equal to the current package version.
 *
 * @internal
 */
export function isValidMinVersionForCollab(
	minVersionForCollab: SemanticVersion,
): minVersionForCollab is MinimumVersionForCollab {
	const { isValidSemver, isGteLowestMinVersion, isLtePkgVersion } =
		checkValidMinVersionForCollabVerbose(minVersionForCollab);
	return isValidSemver && isGteLowestMinVersion && isLtePkgVersion;
}

/**
 * Converts a SemanticVersion to a MinimumVersionForCollab.
 * @param semanticVersion - The version to convert.
 * @returns The version as a MinimumVersionForCollab.
 * @throws UsageError if the version is not a valid MinimumVersionForCollab.
 *
 * @internal
 */
export function semanticVersionToMinimumVersionForCollab(
	semanticVersion: SemanticVersion,
): asserts semanticVersion is MinimumVersionForCollab {
	const minVersionForCollab = semanticVersion as MinimumVersionForCollab;
	const { isValidSemver, isGteLowestMinVersion, isLtePkgVersion } =
		checkValidMinVersionForCollabVerbose(minVersionForCollab);
	if (!(isValidSemver && isGteLowestMinVersion && isLtePkgVersion)) {
		throw new UsageError(
			`Version ${minVersionForCollab} is not a valid MinimumVersionForCollab. ` +
				`It must be in a valid semver format, at least ${lowestMinVersionForCollab}, ` +
				`and less than or equal to the current package version ${pkgVersion}. ` +
				`Details: { isValidSemver: ${isValidSemver}, isGteLowestMinVersion: ${isGteLowestMinVersion}, isLtePkgVersion: ${isLtePkgVersion} }`,
		);
	}
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
	// Type assertion is safe as entries come from runtimeOptions object
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
