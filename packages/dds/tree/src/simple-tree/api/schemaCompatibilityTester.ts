/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeStoredSchema,
	type TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	ValueSchema,
} from "../../core/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import { NodeKind } from "../core/index.js";
import {
	allowsRepoSuperset,
	defaultSchemaPolicy,
	type StoredSchemaDiscrepancyLocation,
	type StoredSchemaUpgradeDiscrepancy,
} from "../../feature-libraries/index.js";
import { resolveStoredSchemaGenerationOptions } from "../toStoredSchema.js";
import { toUpgradeSchema, type TreeSchema } from "../treeSchema.js";

import {
	getDiscrepanciesInAllowedContent,
	type Discrepancy,
	type UpgradeLocationCollector,
} from "./discrepancies.js";
import type {
	SchemaCompatibilityStatusBeta,
	CompatibilityResult,
	SchemaViewIncompatibility,
	SchemaUpgradeIncompatibility,
} from "./tree.js";

/**
 * Describes the discrepancies that prevent a view schema from viewing a stored schema as a
 * readonly array.
 */
export function getSchemaIncompatibilityDetails(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
): readonly SchemaViewIncompatibility[] | undefined {
	const discrepancies = [...getDiscrepanciesInAllowedContent(viewSchema, stored)];
	if (discrepancies.length === 0) {
		return undefined;
	}

	return discrepancies.map((discrepancy) => formatSchemaDiscrepancy(discrepancy));
}

function formatSchemaDiscrepancy(value: Discrepancy): SchemaViewIncompatibility;
function formatSchemaDiscrepancy(
	value: StoredSchemaUpgradeDiscrepancy,
): SchemaUpgradeIncompatibility;
function formatSchemaDiscrepancy(
	value: Discrepancy | StoredSchemaUpgradeDiscrepancy,
): SchemaViewIncompatibility | SchemaUpgradeIncompatibility {
	switch (value.mismatch) {
		case "allowedTypes": {
			const comparison =
				"proposed" in value
					? {
							proposed: [...value.proposed].filter((type) => !value.stored.has(type)).sort(),
							stored: [...value.stored].filter((type) => !value.proposed.has(type)).sort(),
						}
					: {
							view: value.view.map(({ type }) => type.identifier).sort(),
							...(value.stagedView === undefined
								? {}
								: {
										stagedView: value.stagedView.map(({ type }) => type.identifier).sort(),
									}),
							stored: [...value.stored].sort(),
							...(value.viewIsStagedOptional === true
								? { viewIsStagedOptional: value.viewIsStagedOptional }
								: {}),
						};
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				...comparison,
			};
		}
		case "fieldKind": {
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				...("proposed" in value
					? { proposed: value.proposed, stored: value.stored }
					: {
							view: value.view,
							stored: value.stored,
							...(value.viewIsStagedOptional === true
								? { viewIsStagedOptional: value.viewIsStagedOptional }
								: {}),
						}),
			};
		}
		case "valueSchema": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				...("proposed" in value
					? { proposed: formatValueSchema(value.proposed) }
					: { view: formatValueSchema(value.view) }),
				stored: formatValueSchema(value.stored),
			};
		}
		case "nodeKind": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				...("proposed" in value
					? { proposed: getStoredNodeKind(value.proposed) }
					: { view: NodeKind[value.view] }),
				stored: getStoredNodeKind(value.stored),
			};
		}
		case "missingNodeSchema":
		case "uninhabitableNodeSchema": {
			return { mismatch: value.mismatch, nodeType: value.identifier };
		}
		default: {
			return unreachableCase(value);
		}
	}
}

/**
 * Reports every constraint that prevents upgrading `stored` to `proposed`.
 */
export function getSchemaUpgradeIncompatibilityDetails(
	stored: TreeStoredSchema,
	proposed: TreeStoredSchema,
): readonly SchemaUpgradeIncompatibility[] | undefined {
	const discrepancies: StoredSchemaUpgradeDiscrepancy[] = [];
	allowsRepoSuperset(defaultSchemaPolicy, stored, proposed, discrepancies);
	return discrepancies.length === 0
		? undefined
		: discrepancies.map((discrepancy) => formatSchemaDiscrepancy(discrepancy));
}

function formatDiscrepancyLocation(
	value: StoredSchemaDiscrepancyLocation,
): Extract<SchemaViewIncompatibility, { mismatch: "fieldKind" }>["location"] {
	return value.identifier === undefined
		? "root"
		: { nodeType: value.identifier, fieldKey: value.fieldKey };
}

function formatValueSchema(value: ValueSchema | undefined): string | undefined {
	return value === undefined ? undefined : ValueSchema[value];
}

function getStoredNodeKind(
	schema: TreeNodeStoredSchema | Extract<Discrepancy, { mismatch: "nodeKind" }>["stored"],
): "Object" | "Map" | "Leaf" {
	return schema === ObjectNodeStoredSchema || schema instanceof ObjectNodeStoredSchema
		? "Object"
		: schema === MapNodeStoredSchema || schema instanceof MapNodeStoredSchema
			? "Map"
			: "Leaf";
}

/**
 * The enablement status of a staged schema upgrade in a document's stored schema.
 *
 * @remarks
 * - `"disabled"` — no locations guarded by the upgrade are enabled in stored schema.
 * - `"partial"` — at least one location is enabled but not all of them.
 * - `"enabled"` — all locations guarded by the upgrade are enabled in stored schema.
 *
 * @alpha
 */
export type StagedUpgradeStatus = "disabled" | "partial" | "enabled";

/**
 * Determines the compatibility of a stored document (based on its stored schema) with a viewer (based on its view schema).
 *
 * Adapters can be provided to handle differences between the two schemas.
 * Adapters should only use to types in the `view` SchemaRepository.
 *
 * TODO: this API violates the parse don't validate design philosophy.
 * It should be wrapped with (or replaced by) a parse style API.
 *
 * @param viewSchema - Schema for the view
 * @param stored - The stored schema to check compatibility against
 * @param stagedSchemaUpgrades - Staged schema upgrades enabled for this view, or explicit stored-schema generation options
 *
 */
export function checkSchemaCompatibility(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): Omit<SchemaCompatibilityStatusBeta, "canInitialize"> & {
	enabledUpgrades: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>;
} {
	// The public API surface assumes defaultSchemaPolicy
	const policy = defaultSchemaPolicy;
	const configuredPolicy = resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades);
	const includeAlreadyEnabledUpgrades =
		configuredPolicy.includeAlreadyEnabledUpgrades ?? false;

	// Collect upgrade locations during the discrepancy walk (single pass).
	const totalLocations = new Map<SchemaUpgrade, number>();
	const enabledLocations = new Map<SchemaUpgrade, number>();
	const upgradeCollector: UpgradeLocationCollector = {
		allowedType(upgrade, isEnabled) {
			totalLocations.set(upgrade, (totalLocations.get(upgrade) ?? 0) + 1);
			if (isEnabled) {
				enabledLocations.set(upgrade, (enabledLocations.get(upgrade) ?? 0) + 1);
			}
		},
		optionalField(upgrade, isEnabled) {
			totalLocations.set(upgrade, (totalLocations.get(upgrade) ?? 0) + 1);
			if (isEnabled) {
				enabledLocations.set(upgrade, (enabledLocations.get(upgrade) ?? 0) + 1);
			}
		},
	};

	// View schema allows a subset of documents that stored schema does, and the discrepancies are allowed by policy
	// determined by the view schema (i.e. objects with extra optional fields in the stored schema have opted into allowing this.
	// In the future, this would also include things like:
	// - fields with more allowed types in the stored schema than in the view schema have out-of-schema "unknown content" adapters
	// Complete the full walk even after finding an incompatibility so discrepancy details and
	// staged-upgrade status contain all available information for debugging.
	const discrepancies: SchemaViewIncompatibility[] = [];
	for (const discrepancy of getDiscrepanciesInAllowedContent(
		viewSchema,
		stored,
		upgradeCollector,
	)) {
		discrepancies.push(formatSchemaDiscrepancy(discrepancy));
	}
	const canView = discrepancies.length === 0;

	const enabledUpgrades = computeUpgradeStatuses(totalLocations, enabledLocations);
	const upgradePolicy = includeAlreadyEnabledUpgrades
		? includeEnabledUpgrades(configuredPolicy, enabledUpgrades)
		: configuredPolicy;
	const wouldUpgradeTo = toUpgradeSchema(viewSchema.root, upgradePolicy);

	const upgradeDiscrepancies: StoredSchemaUpgradeDiscrepancy[] | undefined = canView
		? undefined
		: [];
	const canUpgrade = allowsRepoSuperset(policy, stored, wouldUpgradeTo, upgradeDiscrepancies);

	// If true, then upgrading has no effect on what can be stored in the document.
	// TODO: This should likely be changed to indicate up a schema upgrade would be a no-op, including stored schema metadata.
	const isEquivalent =
		canView && canUpgrade && allowsRepoSuperset(policy, wouldUpgradeTo, stored);

	const view: CompatibilityResult<SchemaViewIncompatibility> = canView
		? { isCompatible: true }
		: { isCompatible: false, incompatibilities: discrepancies };
	let upgradeResult: CompatibilityResult<SchemaUpgradeIncompatibility>;
	if (canUpgrade) {
		upgradeResult = { isCompatible: true };
	} else if (upgradeDiscrepancies === undefined) {
		// Repository snapshots use copy-on-write cloning so diagnostics can safely outlive this schema version.
		const storedSnapshot = new TreeStoredSchemaRepository(stored);
		let incompatibilities: readonly SchemaUpgradeIncompatibility[] | undefined;
		upgradeResult = {
			isCompatible: false,
			get incompatibilities() {
				if (incompatibilities === undefined) {
					incompatibilities = getSchemaUpgradeIncompatibilityDetails(
						storedSnapshot,
						wouldUpgradeTo,
					);
					assert(
						incompatibilities !== undefined,
						"A blocked upgrade must have incompatibilities.",
					);
				}
				return incompatibilities;
			},
		};
	} else {
		assert(upgradeDiscrepancies.length > 0, "A blocked upgrade must have incompatibilities.");
		upgradeResult = {
			isCompatible: false,
			incompatibilities: upgradeDiscrepancies.map((discrepancy) =>
				formatSchemaDiscrepancy(discrepancy),
			),
		};
	}

	return {
		view,
		upgrade: upgradeResult,
		canView: view.isCompatible,
		canUpgrade: upgradeResult.isCompatible,
		isEquivalent,
		discrepancies: view.isCompatible ? undefined : view.incompatibilities,
		enabledUpgrades,
	};
}

function includeEnabledUpgrades(
	configuredPolicy: StagedSchemaUpgradePolicy,
	enabledUpgrades: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>,
): StagedSchemaUpgradePolicy {
	if (enabledUpgrades.size === 0) {
		return configuredPolicy;
	}
	return {
		includeStaged: (upgrade) =>
			configuredPolicy.includeStaged(upgrade) || enabledUpgrades.has(upgrade),
		includeStagedOptional: (upgrade) =>
			configuredPolicy.includeStagedOptional(upgrade) || enabledUpgrades.has(upgrade),
	};
}

/**
 * Computes the {@link StagedUpgradeStatus} for each upgrade token from total and enabled location counts.
 * Only tokens with at least one enabled location are included in the returned map.
 */
function computeUpgradeStatuses(
	totalLocations: ReadonlyMap<SchemaUpgrade, number>,
	enabledLocations: ReadonlyMap<SchemaUpgrade, number>,
): ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus> {
	const result = new Map<SchemaUpgrade, StagedUpgradeStatus>();
	for (const [upgrade, total] of totalLocations) {
		const enabled = enabledLocations.get(upgrade) ?? 0;
		if (enabled > 0 && enabled < total) {
			result.set(upgrade, "partial");
		} else if (enabled >= total && enabled > 0) {
			result.set(upgrade, "enabled");
		}
	}
	return result;
}
