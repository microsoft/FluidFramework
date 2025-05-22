/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 */
export type SemanticVersion =
	| `${bigint}.${bigint}.${bigint}`
	| `${bigint}.${bigint}.${bigint}-${string}`;

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigMap
 */
export type ConfigMap<T extends Record<string, unknown>> = {
	[K in keyof T]-?: {
		[version: MinimumMinorSemanticVersion]: T[K];
	};
};

/**
 * Generic type for runtimeOptionsAffectingDocSchemaConfigValidationMap
 */
export type ConfigValidationMap<T extends Record<string, unknown>> = {
	[K in keyof T]-?: (value: T[K]) => SemanticVersion | undefined;
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
const runtimeOptionsAffectingDocSchemaConfigMap = {
	enableGroupedBatching: {
		"1.0.0": false,
		"2.0.0-defaults": true,
	},
	compressionOptions: {
		"1.0.0": disabledCompressionConfig,
		"2.0.0-defaults": enabledCompressionConfig,
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
		// `defaultMinVersionForCollab` is set to "2.0.0-defaults" which "2.0.0"
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
		"2.0.0-defaults": FlushMode.TurnBased,
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
} as const satisfies ConfigMap<RuntimeOptionsAffectingDocSchema>;

const runtimeOptionsAffectingDocSchemaConfigValidationMap = {
	enableGroupedBatching: configValueToMinVersionForCollab([
		[false, "1.0.0"],
		[true, "2.0.0-defaults"],
	]),
	compressionOptions: configObjectToMinVersionForCollab([
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
	gcOptions: configObjectToMinVersionForCollab([
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
				`Runtime option ${passedRuntimeOption}:${JSON.stringify(passedRuntimeOptionValue)} is not compatible with minVersionForCollab: ${minVersionForCollab}.`,
			);
		}
	}
}

/**
 * Helper function to map ContainerRuntimeOptionsInternal config values to
 * minVersionForCollab in {@link runtimeOptionsAffectingDocSchemaConfigValidationMap}.
 * Used for configs values that are not objects.
 */
export function configValueToMinVersionForCollab<
	T extends string | number | boolean | undefined,
	Arr extends readonly [T, SemanticVersion][],
>(configToMinVer: Arr): (value: T) => SemanticVersion | undefined {
	const map = new Map(configToMinVer);
	return (value: T) => map.get(value);
}

/**
 * Helper function to map ContainerRuntimeOptionsInternal config values to
 * minVersionForCollab in {@link runtimeOptionsAffectingDocSchemaConfigValidationMap}.
 * Used for configs values that are objects.
 */
export function configObjectToMinVersionForCollab<
	T extends object,
	Arr extends readonly [T, SemanticVersion][],
>(configToMinVer: Arr): (value: T) => SemanticVersion | undefined {
	const map = new Map(configToMinVer);
	return (value: T) => {
		if (typeof value === "object" && value !== null) {
			// Collect all versions for which the config entry is a subset of the value
			const matchingVersions: SemanticVersion[] = [];
			for (const [key, version] of map.entries()) {
				if (
					typeof key === "object" &&
					key !== undefined &&
					Object.entries(key as Record<string, unknown>).every(
						([k, v]) => (value as Record<string, unknown>)[k] === v,
					)
				) {
					matchingVersions.push(version);
				}
			}
			if (matchingVersions.length > 0) {
				// Return the maximum (latest) version among all matches
				return matchingVersions.sort((a, b) => (compare(a, b) > 0 ? 1 : -1))[
					matchingVersions.length - 1
				];
			}
		}
		return undefined;
	};
}
