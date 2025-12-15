/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { compare, gt, gte, lte, valid, parse } from "semver-ts";

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
 * Converts a record into a configuration map that associates each key with an instance of its value type that is based on a {@link MinimumMinorSemanticVersion}.
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
 * All entries must at least provide an entry for {@link lowestMinVersionForCollab}.
 * @internal
 */
export interface ConfigMapEntry<T> {
	// This index signature (See https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures) requires all properties on this type to to have keys that are a MinimumMinorSemanticVersion and values of type T.
	// Note that the "version" part of this syntax is really just documentation and has no impact on the type checking (other than some identifier being required to the syntax here to differentiate it from the computed property syntax).
	[version: MinimumMinorSemanticVersion]: T;
	// Require an entry for the defaultMinVersionForCollab:
	// this ensures that all versions of lowestMinVersionForCollab or later have a specified value in the ConfigMap.
	// Note that this is NOT an index signature.
	// This is a regular property with a computed name (See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#computed_property_names).
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
 * @privateRemarks
 * The extra `Record` type for the `configMap` is just used to allow the body of this function to be more type-safe due to limitations of generic types in TypeScript.
 * It should have no impact on the user of this function.
 * @internal
 */
export function getConfigsForMinVersionForCollab<T extends Record<SemanticVersion, unknown>>(
	minVersionForCollab: MinimumVersionForCollab,
	configMap: ConfigMap<T> & Record<keyof T, unknown>,
): T {
	validateMinimumVersionForCollab(minVersionForCollab);
	const defaultConfigs: Partial<T> = {};
	// Iterate over configMap to get default values for each option.
	for (const [key, config] of Object.entries(configMap)) {
		defaultConfigs[key] = getConfigForMinVersionForCollab(
			minVersionForCollab,
			config as ConfigMapEntry<unknown>,
		);
	}
	// We have populated every key, so casting away the Partial is now safe:
	return defaultConfigs as T;
}

/**
 * Returns a default configuration given minVersionForCollab and {@link ConfigMapEntry}.
 *
 * @internal
 */
export function getConfigForMinVersionForCollab<T>(
	minVersionForCollab: MinimumVersionForCollab,
	config: ConfigMapEntry<T>,
): T {
	const entries: [string, unknown][] = Object.entries(config); // Assigning this to a typed variable to convert the "any" into unknown.
	// Validate and strongly type the versions from the configMap.
	const versions: [MinimumVersionForCollab, unknown][] = entries.map(([version, value]) => {
		validateMinimumVersionForCollab(version);
		return [version, value];
	});
	// Sort the versions in descending order to find the largest compatible entry.
	// TODO: Enforcing a sorted order might be a good idea. For now tolerates any order.
	versions.sort((a, b) => compare(b[0], a[0]));
	// For each config, we iterate over the keys and check if minVersionForCollab is greater than or equal to the version.
	// If so, we set it as the default value for the option.
	for (const [version, value] of versions) {
		if (gte(minVersionForCollab, version)) {
			return value as T;
		}
	}
	fail("No config map entry for version");
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
		isLtePkgVersion: isValidSemver && lte(minVersionForCollab, cleanedPackageVersion),
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

const parsedPackageVersion = parse(pkgVersion) ?? fail("Invalid package version");

/**
 * `pkgVersion` version without pre-release.
 * @remarks
 * This is the version that the code in the current version of the codebase will have when officially released.
 * Generally, compatibility of prerelease builds is not guaranteed (especially for how they interact with future releases).
 * So while technically a prerelease build is less (older) than the released version which follows it and thus supports less features,
 * it makes sense for them to claim to support the same features as the following release so they can be used to test how the release would actually behave.
 *
 * To accomplish this, the version the next release will have is provided here as `cleanedPackageVersion` while `pkgVersion` may be a prerelease in some cases,
 * like when running tests on CI, or in an actual prerelease published package.
 * This is then used in {@link validateMinimumVersionForCollab} to allow the version shown on main to be usable as a `minVersionForCollab`, even in CI and prerelease packages.
 *
 * This is of particular note in two cases:
 * 1. When landing a new feature, and setting the minVersionForCollab which enables it to be the version that the next release will have.
 * Having that version be valid on main, pass tests locally, then fail on CI and when using published prerelease packages would be confusing, and probably undesired.
 * 2. Setting the minVersionForCollab to the current version for scenarios that do no involve collab with other package versions seems like it should be valid.
 * This is useful for testing new features, and also non collaborative scenarios where the latest features are desired.
 *
 * To accommodate some uses of the second case, it might be useful to package export this in the future.
 *
 * @privateRemarks
 * Since this is used by validateMinimumVersionForCollab, the type case to MinimumVersionForCollab can not use it directly.
 * Thus this is just `as` cast here, and a test confirms it is valid according to validateMinimumVersionForCollab.
 *
 * @internal
 */
export const cleanedPackageVersion =
	`${parsedPackageVersion.major}.${parsedPackageVersion.minor}.${parsedPackageVersion.patch}` as MinimumVersionForCollab;

/**
 * Narrows the type of the provided {@link SemanticVersion} to a {@link @fluidframework/runtime-definitions#MinimumVersionForCollab}, throwing a UsageError if it is not valid.
 * @remarks
 * This is more strict than the type constraints imposed by `MinimumVersionForCollab`.
 * Currently there is no type which is used to separate semantically valid and typescript allowed MinimumVersionForCollab values:
 * thus users that care about strict validation may want to call this on un-validated `MinimumVersionForCollab` values.
 * @param semanticVersion - The version to check.
 * @throws UsageError if the version is not a valid MinimumVersionForCollab.
 *
 * @internal
 */
export function validateMinimumVersionForCollab(
	semanticVersion: string,
): asserts semanticVersion is MinimumVersionForCollab {
	const minVersionForCollab = semanticVersion as MinimumVersionForCollab;
	const { isValidSemver, isGteLowestMinVersion, isLtePkgVersion } =
		checkValidMinVersionForCollabVerbose(minVersionForCollab);
	if (!(isValidSemver && isGteLowestMinVersion && isLtePkgVersion)) {
		throw new UsageError(
			`Version ${minVersionForCollab} is not a valid MinimumVersionForCollab. ` +
				`It must be in a valid semver format, at least ${lowestMinVersionForCollab}, ` +
				`and less than or equal to the current package version ${cleanedPackageVersion}. ` +
				`Details: { isValidSemver: ${isValidSemver}, isGteLowestMinVersion: ${isGteLowestMinVersion}, isLtePkgVersion: ${isLtePkgVersion} }`,
		);
	}
}

/**
 * Validates the given `overrides`.
 *
 * No-op when minVersionForCollab is set to defaultMinVersionForCollab.
 *
 * Otherwise this checks that for keys which are in both the `validationMap` and the `overrides`,
 * that the `validationMap` function for that key either returns undefined or a version less than or equal to `minVersionForCollab`.
 * @privateRemarks
 * This design seems odd, and might want to be revisited.
 * Currently it only permits opting out of features, not into them (unless validationMap returns undefined),
 * and the handling of defaultMinVersionForCollab and undefined versions seems questionable.
 * Also ignoring of extra keys in overrides might be bad since it seems like overrides is supposed to be validated.
 * @internal
 */
export function validateConfigMapOverrides<T extends Record<string, unknown>>(
	minVersionForCollab: SemanticVersion,
	overrides: Partial<T>,
	validationMap: ConfigValidationMap<T>,
): void {
	if (minVersionForCollab === defaultMinVersionForCollab) {
		// If the minVersionForCollab is set to the default value, then we will not validate the runtime options
		// This is to avoid disruption to users who have not yet set the minVersionForCollab value explicitly.
		// TODO: This also skips validation for users which explicitly request defaultMinVersionForCollab which seems like a bug.
		return;
	}
	// Iterate through each runtime option passed in by the user
	// Type assertion is safe as entries come from runtimeOptions object
	for (const [passedRuntimeOption, passedRuntimeOptionValue] of Object.entries(overrides) as [
		keyof T & string,
		T[keyof T & string],
	][]) {
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
