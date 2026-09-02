/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../core/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import { NodeKind } from "../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../feature-libraries/index.js";
import { toUpgradeSchema } from "../toStoredSchema.js";
import type { TreeSchema } from "../treeSchema.js";

import {
	getDiscrepanciesInAllowedContent,
	type Discrepancy,
	type UpgradeLocationCollector,
} from "./discrepancies.js";
import type { SchemaCompatibilityStatusBeta, SchemaDiscrepancy } from "./tree.js";

/**
 * Describes the discrepancies that prevent a view schema from viewing a stored schema as a
 * readonly array.
 */
export function getSchemaIncompatibilityDetails(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
): readonly SchemaDiscrepancy[] | undefined {
	const discrepancies = [...getDiscrepanciesInAllowedContent(viewSchema, stored)];
	if (discrepancies.length === 0) {
		return undefined;
	}

	return discrepancies.map(formatSchemaDiscrepancy);
}

function formatSchemaDiscrepancy(value: Discrepancy): SchemaDiscrepancy {
	switch (value.mismatch) {
		case "allowedTypes": {
			return {
				mismatch: value.mismatch,
				location:
					value.identifier === undefined
						? "root"
						: {
								nodeType: value.identifier,
								fieldKey: value.fieldKey ?? null,
							},
				view: value.view.map(({ type }) => type.identifier).sort(),
				...(value.stagedView === undefined
					? {}
					: {
							stagedView: value.stagedView.map(({ type }) => type.identifier).sort(),
						}),
				stored: [...value.stored].sort(),
				...(value.viewIsStagedOptional === true ? { viewIsStagedOptional: true } : {}),
			};
		}
		case "fieldKind": {
			return {
				mismatch: value.mismatch,
				location:
					value.identifier === undefined
						? "root"
						: {
								nodeType: value.identifier,
								fieldKey: value.fieldKey ?? null,
							},
				view: value.view,
				stored: value.stored,
				...(value.viewIsStagedOptional === true ? { viewIsStagedOptional: true } : {}),
			};
		}
		case "valueSchema": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				view: value.view === undefined ? null : ValueSchema[value.view],
				stored: value.stored === undefined ? null : ValueSchema[value.stored],
			};
		}
		case "nodeKind": {
			const storedNodeKind =
				value.stored === ObjectNodeStoredSchema
					? "Object"
					: value.stored === MapNodeStoredSchema
						? "Map"
						: "Leaf";
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				view: NodeKind[value.view],
				stored: storedNodeKind,
			};
		}
		default: {
			return unreachableCase(value);
		}
	}
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
 * Adapters can be provided to handle differences between the two schema.
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
	const discrepancies: SchemaDiscrepancy[] = [];
	for (const discrepancy of getDiscrepanciesInAllowedContent(
		viewSchema,
		stored,
		upgradeCollector,
	)) {
		discrepancies.push(formatSchemaDiscrepancy(discrepancy));
	}
	const canView = discrepancies.length === 0;

	const wouldUpgradeTo = toUpgradeSchema(viewSchema.root, stagedSchemaUpgrades);

	const canUpgrade = allowsRepoSuperset(policy, stored, wouldUpgradeTo);

	// If true, then upgrading has no effect on what can be stored in the document.
	// TODO: This should likely be changed to indicate up a schema upgrade would be a no-op, including stored schema metadata.
	const isEquivalent =
		canView && canUpgrade && allowsRepoSuperset(policy, wouldUpgradeTo, stored);

	const enabledUpgrades = computeUpgradeStatuses(totalLocations, enabledLocations);

	return {
		canView,
		canUpgrade,
		isEquivalent,
		discrepancies: canView ? undefined : discrepancies,
		enabledUpgrades,
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
