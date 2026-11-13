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
	 * Determines whether to introduce staged allowed types in the resulting stored schema.
	 *
	 * @remarks
	 * This callback controls additions, not removal of types already permitted by the document.
	 * An upgrade therefore preserves an already-allowed staged type even when this callback returns `false`.
	 * If the same token is used elsewhere, those other locations gain the type only when the callback returns `true`.
	 *
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStaged(upgrade: SchemaUpgrade): boolean;

	/**
	 * Determines whether to treat a staged optional field as optional
	 * (rather than required) in the resulting stored schema.
	 *
	 * @remarks
	 * Returning `false` keeps a staged-optional field required in a new document, or in an existing document where it is still required.
	 * Once the stored field is optional, however, an upgrade preserves that optionality regardless of this callback's result.
	 *
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
 * - {@link StagedSchemaUpgradePolicyFactory.restrictive} — no new staged upgrades (default)
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
 * // Use restrictive (default, no new staged upgrades):
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
	 * Restrictive policy — enables no new staged upgrades.
	 *
	 * @remarks
	 * Use this default policy when a client should not introduce any staged changes.
	 * New documents then exclude staged allowed types and require staged-optional fields.
	 * Existing documents may already allow those types or missing fields because another client enabled them.
	 * Already-enabled upgrades are preserved, so selecting this policy does not undo another client's rollout.
	 */
	readonly restrictive: StagedSchemaUpgradePolicy;

	/**
	 * Permissive policy — includes all staged schema upgrades.
	 *
	 * @remarks
	 * Use this for testing, validation, and rollout rehearsal scenarios where you want to exercise
	 * future document shapes before enabling staged upgrades broadly.
	 *
	 * With this policy, a newly initialized document allows every staged type and treats every staged-optional field as optional.
	 * For an existing document, this policy enables any remaining staged upgrades while preserving those already enabled.
	 */
	readonly permissive: StagedSchemaUpgradePolicy;

	/**
	 * Creates options that introduce only the specified staged schema upgrades.
	 *
	 * @remarks
	 * Use the selected tokens to control which parts of a staged rollout this client may enable.
	 * In a new document, the corresponding staged types are included and staged-optional fields become optional; unselected changes remain disabled.
	 *
	 * In an existing document, unselected changes may already be enabled.
	 * Those already-enabled upgrades are preserved while the selected changes are enabled.
	 *
	 * Passing no tokens selects no new staged changes and is equivalent to {@link StagedSchemaUpgradePolicyFactory.restrictive}.
	 *
	 * @param upgrades - The staged schema upgrades to enable.
	 * @returns Options that introduce only the specified upgrades.
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
