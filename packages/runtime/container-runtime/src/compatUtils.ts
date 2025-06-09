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
 * any 2.0.0+ version, we will use a special value of `1.999.0`, which
 * is semantically less than 2.0.0.
 *
 * @legacy
 * @alpha
 */
export const defaultMinVersionForCollab = "1.999.0" as const satisfies SemanticVersion;

/**
 * The lowest supported value of {@link MinimumVersionForCollab}.
 * @remarks
 * In each new major version, this may be bumped to indicate which version of the Fluid Framework client libraries are no longer supported for collaboration.
 * @privateRemarks
 * At the time this was defined (and also at the time 2.0 was released), all version of 1.x below 1.4 were no longer supported.
 * Therefor it makes sense to not support any version below 1.4.0.
 * Supporting 1.4 is sufficient to support all 1.x versions which are still maintained were maintained when this constant could have been first used.
 *
 * Future major versions will have to decide which versions of 1.x (if any) they want to support:
 * continuing to support what ever version of 1.x is the oldest supported one at the time of the major release, would make sense for 3.0.
 *
 * We don't want allow a version before the major public release of the LTS version.
 * Today we use "1.0.0", because our policy supports N/N-1 & N/N-2, which includes
 * all minor versions of N. Though LTS starts at 1.4.0, we should stay consistent
 * with our policy and allow all 1.x versions to be compatible with 2.x.
 *
 * @legacy
 * @alpha
 */
export const lowestMinVersionForCollab = "1.0.0" as const satisfies MinimumVersionForCollab;

/**
 * String in a valid semver format specifying the a version such that all greater or equal versions support something.
 * @remarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * For example, if a feature is added in 2.1.0, then back ported to 1.5.0, it could be problematic.
 * While the feature might be supported in 1.5.0, setting a `MinimumSemanticVersion` of `1.5.0` would be invalid since incorrectly imply it was supported in `2.0.0`.
 * In this case the `MinimumSemanticVersion` must be set to `2.1.0` to avoid the issue.
 *
 * The same issue can occur with features fixed in patches after the next minor has been released: avoiding this complication is why patch versions are currently forced to 0.
 */
export type MinimumSemanticVersion = `${bigint}.${bigint}.0`;

/**
 * Oldest version of Fluid Framework client packages to support collaborating with.
 * @remarks
 * String in a semver format of indicating a specific version of the Fluid Framework client package, or the special case of {@link defaultMinVersionForCollab}.
 *
 * When specifying a given `MinimumVersionForCollab`, any version which is greater then or equal to the specified version will be considered compatible.
 *
 * Must be at least {@link lowestMinVersionForCollab} and cannot exceed the current version.
 *
 * @privateRemarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * See remarks for {@link MinimumSemanticVersion} for more details.
 *
 * Since this type is marked with `@input`, it can be generalized to allow more cases in the future as a non-breaking change.
 *
 * @input
 * @legacy
 * @alpha
 */
export type MinimumVersionForCollab =
	| `1.0.0`
	| `1.4.0`
	| typeof defaultMinVersionForCollab
	| `2.${bigint}.0`;

/**
 * String in a valid semver format of a specific version at least specifying minor.
 * Unlike {@link MinimumVersionForCollab}, this type allows any bigint for the major version.
 * Used as a more generic type that allows major versions other than 1 or 2.
 */
export type SemanticVersion = `${bigint}.${bigint}.${bigint}`;

/**
 * Converts a record into a configuration map that associates each key with with an instance of its value type that based on a {@link MinimumSemanticVersion}.
 * @remarks
 * For a given input {@link MinimumVersionForCollab},
 * the corresponding configuration values can be found by using the entry in the inner objects with the highest {@link MinimumSemanticVersion}
 * that does not exceed the given {@link MinimumVersionForCollab}.
 *
 * Use {@link getConfigsForCompatMode} to retrieve the configuration for a given a {@link MinimumVersionForCollab}.
 *
 * See the remarks on {@link MinimumSemanticVersion} for some limitation on how ConfigMaps must handle versioning.
 */
export type ConfigMap<T extends Record<string, unknown>> = {
	readonly [K in keyof T]-?: ConfigMapEntry<T[K]>;
};

export interface ConfigMapEntry<T> {
	[version: MinimumSemanticVersion]: T;
	// Require an entry for the defaultMinVersionForCollab:
	// this ensures that all versions of lowestMinVersionForCollab or later have a specified value in the ConfigMap.
	[lowestMinVersionForCollab]: T;
}

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigValidationMap
 */
export type ConfigValidationMap<T extends Record<string, unknown>> = {
	readonly [K in keyof T]-?: (configValue: T[K]) => SemanticVersion | undefined;
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
 * Each key in this map corresponds to a property in RuntimeOptionsAffectingDocSchema. The value is an object that maps MinimumVersionForCollab
 * to the appropriate default value for that property to supporting that MinimumVersionForCollab. If clients running MinimumVersionForCollab X are able to understand
 * the format changes introduced by the property, then the default value for that MinimumVersionForCollab will enable the feature associated with the property.
 * Otherwise, the feature will be disabled.
 *
 * For example if the minVersionForCollab is a 1.x version (i.e. "1.5.0"), then the default value for `enableGroupedBatching` will be false since 1.x
 * clients do not understand the document format when batching is enabled. If the minVersionForCollab is a 2.x client (i.e. "2.0.0" or later), then the
 * default value for `enableGroupedBatching` will be true because clients running 2.0 or later will be able to understand the format changes associated
 * with the batching feature.
 */
const runtimeOptionsAffectingDocSchemaConfigMap: ConfigMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: {
			"1.0.0": false,
			[defaultMinVersionForCollab]: true,
		},
		compressionOptions: {
			"1.0.0": disabledCompressionConfig,
			[defaultMinVersionForCollab]: enabledCompressionConfig,
		},
		enableRuntimeIdCompressor: {
			// For IdCompressorMode, `undefined` represents a logical state (off).
			// However, to satisfy the Required<> constraint while
			// `exactOptionalPropertyTypes` is `false` (TODO: AB#8215), we need
			// to have it defined, so we trick the type checker here.
			"1.0.0": undefined,
			// We do not yet want to enable idCompressor by default since it will
			// increase bundle sizes, and not all customers will benefit from it.
			// Therefore, we will require customers to explicitly enable it. We
			// are keeping it as a DocSchema affecting option for now as this may
			// change in the future.
		},
		explicitSchemaControl: {
			"1.0.0": false,
			// This option's intention is to prevent 1.x clients from joining sessions
			// when enabled. This is set to true when the minVersionForCollab is set
			// to >=2.0.0 (explicitly). This is different than other 2.0 defaults
			// because it was not enabled by default prior to the implementation of
			// `minVersionForCollab`.
			// `defaultMinVersionForCollab` is set to defaultMinVersionForCollab which "2.0.0"
			// does not satisfy to avoiding enabling this option by default as of
			// `minVersionForCollab` introduction, which could be unexpected.
			// Only enable as a default when `minVersionForCollab` is specified at
			// 2.0.0+.
			"2.0.0": true,
		},
		flushMode: {
			// Note: 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
			// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
			// fewer messages will be included per flush.
			"1.0.0": FlushMode.Immediate,
			[defaultMinVersionForCollab]: FlushMode.TurnBased,
		},
		gcOptions: {
			"1.0.0": {},
			// Although sweep is supported in 2.x, it is disabled by default until minVersionForCollab>=3.0.0 to be extra safe.
			"3.0.0": { enableGCSweep: true },
		},
		createBlobPayloadPending: {
			// This feature is new and disabled by default. In the future we will enable it by default, but we have not
			// closed on the version where that will happen yet.  Probably a .10 release since blob functionality is not
			// exposed on the `@public` API surface.
			"1.0.0": undefined,
		},
	};

// A lot of the information in this seems redundant with whats defined above. Might be nice to combine them somehow.
const runtimeOptionsAffectingDocSchemaConfigValidationMap: ConfigValidationMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: configValueToMinVersionForCollab([
			[false, "1.0.0"],
			[true, defaultMinVersionForCollab],
		]),
		compressionOptions: configValueToMinVersionForCollab([
			[disabledCompressionConfig, "1.0.0"],
			[enabledCompressionConfig, defaultMinVersionForCollab],
		]),
		enableRuntimeIdCompressor: configValueToMinVersionForCollab([
			[undefined, "1.0.0"],
			["on", defaultMinVersionForCollab],
			["delayed", defaultMinVersionForCollab],
		]),
		explicitSchemaControl: configValueToMinVersionForCollab([
			[false, "1.0.0"],
			[true, defaultMinVersionForCollab],
		]),
		flushMode: configValueToMinVersionForCollab([
			[FlushMode.Immediate, "1.0.0"],
			[FlushMode.TurnBased, defaultMinVersionForCollab],
		]),
		gcOptions: configValueToMinVersionForCollab([
			[{ enableGCSweep: undefined }, "1.0.0"],
			[{ enableGCSweep: true }, defaultMinVersionForCollab],
		]),
		createBlobPayloadPending: configValueToMinVersionForCollab([
			[undefined, "1.0.0"],
			[true, "2.40.0"],
		]),
	};

/**
 * Returns the default RuntimeOptionsAffectingDocSchema configuration for a given minVersionForCollab.
 */
export function getMinVersionForCollabDefaults(
	minVersionForCollab: MinimumVersionForCollab,
): RuntimeOptionsAffectingDocSchema {
	return getConfigsForMinVersionForCollab(
		minVersionForCollab,
		runtimeOptionsAffectingDocSchemaConfigMap,
		// This is a bad cast away from Partial that getConfigsForCompatMode provides.
		// ConfigMap should be restructured to provide RuntimeOptionsAffectingDocSchema guarantee.
	) as RuntimeOptionsAffectingDocSchema;
}

/**
 * Returns a default configuration given minVersionForCollab and configuration version map.
 */
export function getConfigsForMinVersionForCollab<T extends Record<SemanticVersion, unknown>>(
	minVersionForCollab: SemanticVersion,
	configMap: ConfigMap<T> & Record<string, ConfigMapEntry<T[keyof T]>>,
): Partial<T> {
	const defaultConfigs: Partial<T> = {};
	// Iterate over configMap to get default values for each option.
	for (const [key, config] of Object.entries(configMap)) {
		// Sort the versions in descending order to find the largest compatible entry.
		const versions = (Object.entries(config) as [MinimumSemanticVersion, unknown][]).sort(
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
				"possibleConfigValue should be an object",
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
