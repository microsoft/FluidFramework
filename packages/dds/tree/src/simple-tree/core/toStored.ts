/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SchemaUpgrade } from "./allowedTypes.js";

/**
 * Policy controlling which staged schema upgrades are included when generating stored schema from a view schema.
 * @input
 * @alpha
 */
export interface StagedSchemaUpgradePolicy {
	/**
	 * Determines whether to include staged allowed types in the resulting stored schema.
	 * @remarks
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStaged(upgrade: SchemaUpgrade): boolean;

	/**
	 * Determines whether to treat a staged optional field as optional
	 * (rather than required) in the resulting stored schema.
	 * @remarks
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStagedOptional(upgrade: SchemaUpgrade): boolean;
}

/**
 * Provides factory methods for creating {@link (StagedSchemaUpgradePolicy:interface)} instances.
 *
 * @remarks
 * Use the properties and methods on this object to obtain staged-schema generation options
 * for different scenarios:
 *
 * - {@link StagedSchemaUpgradePolicyFactory.restrictive} — no staged upgrades (default)
 *
 * - {@link StagedSchemaUpgradePolicyFactory.permissive} — all staged upgrades enabled
 *
 * - {@link StagedSchemaUpgradePolicyFactory.enabledStagedUpgrades} — only specific upgrades enabled
 *
 * @example
 * ```typescript
 * // Enable specific upgrades:
 * const options = StagedSchemaUpgradePolicy.enabledStagedUpgrades(myUpgrade);
 *
 * // Use restrictive (default, no staged upgrades):
 * const options = StagedSchemaUpgradePolicy.restrictive;
 *
 * // Use permissive (all staged upgrades, useful for testing):
 * const options = StagedSchemaUpgradePolicy.permissive;
 * ```
 *
 * @sealed
 * @alpha
 */
export interface StagedSchemaUpgradePolicyFactory {
	/**
	 * Restrictive policy — excludes all staged schema members.
	 *
	 * @remarks
	 * Use this when you want the most conservative stored schema for compatibility-sensitive
	 * scenarios, or when staged schema upgrades should remain disabled.
	 *
	 * This is the default behavior when no staged upgrades are enabled.
	 */
	readonly restrictive: StagedSchemaUpgradePolicy;
	/**
	 * Permissive policy — includes all staged schema upgrades.
	 *
	 * @remarks
	 * Use this for testing, validation, and rollout rehearsal scenarios where you want to exercise
	 * future document shapes before enabling staged upgrades broadly.
	 */
	readonly permissive: StagedSchemaUpgradePolicy;
	/**
	 * Creates options that include only the specified staged schema upgrades.
	 *
	 * @param upgrades - The staged schema upgrades to enable.
	 * @returns Options that include only the specified upgrades.
	 *
	 * @remarks
	 * If an empty set of upgrades is passed, the result is equivalent to
	 * `StagedSchemaUpgradePolicy.restrictive`.
	 */
	enabledStagedUpgrades(...upgrades: SchemaUpgrade[]): StagedSchemaUpgradePolicy;
}

/**
 * {@inheritDoc (StagedSchemaUpgradePolicyFactory:interface)}
 * @alpha
 */
export const StagedSchemaUpgradePolicy: StagedSchemaUpgradePolicyFactory = {
	restrictive: {
		includeStaged: () => false,
		includeStagedOptional: () => false,
	},

	permissive: {
		includeStaged: () => true,
		includeStagedOptional: () => true,
	},

	enabledStagedUpgrades(...upgrades: SchemaUpgrade[]): StagedSchemaUpgradePolicy {
		if (upgrades.length === 0) {
			return StagedSchemaUpgradePolicy.restrictive;
		}
		const enabledUpgradeSet = new Set(upgrades);
		return {
			includeStaged: (upgrade) => enabledUpgradeSet.has(upgrade),
			includeStagedOptional: (upgrade) => enabledUpgradeSet.has(upgrade),
		};
	},
};

/**
 * Marker type indicating that the input schema is already a stored schema.
 */
export const ExpectStored = Symbol("ExpectStored");
export type ExpectStored = typeof ExpectStored;

/**
 * Marker type indicating that the input schema should not be transformed: data accessible from the simple schema API surface should be copied as is.
 * @remarks
 * The only real use-cases for this are deep-copying simple schema, and copying objects that implement more than just simple schema (such as {@link TreeSchema}) into simple object without extra prototypes and properties.
 */
export const Unchanged = Symbol("Unchanged");
export type Unchanged = typeof Unchanged;

/**
 * Subset of {@link SimpleSchemaTransformationOptions} for when the output is a known to be a stored schema.
 */
export type StoredSchemaGenerationOptions = StagedSchemaUpgradePolicy | ExpectStored;

/**
 * Options for transforming a schema.
 * @remarks
 * See also {@link generateSchemaFromSimpleSchema} for a different schema transformation.
 * Note that if we want to make `generateSchemaFromSimpleSchema` consume view simple-schema, and use these transformation APIs to generate that view simple-schema from a stored simple-schema,
 * we will need to add a "ToView" option here.
 */
export type SimpleSchemaTransformationOptions =
	| StagedSchemaUpgradePolicy
	| ExpectStored
	| Unchanged;
