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
	type SchemaDiscrepancyLocation,
	type StoredSchemaUpgradeDiscrepancy,
} from "../../feature-libraries/index.js";
import { resolveStoredSchemaGenerationOptions } from "../toStoredSchema.js";
import { getSchemaUpgradeCandidate, toInitialSchema, type TreeSchema } from "../treeSchema.js";

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
 * Checks whether an upgrade candidate would enable the view to access the document.
 *
 * @param viewSchema - The view schema that must be able to use the document after the upgrade.
 * @param storedSchema - The document's stored schema before the upgrade.
 * @param candidate - The proposed stored schema after the upgrade.
 * @returns Whether the candidate passes the default schema upgrade rules and has no viewing blockers.
 */
export function isSchemaUpgradeAllowed(
	viewSchema: TreeSchema,
	storedSchema: TreeStoredSchema,
	candidate: TreeStoredSchema,
): boolean {
	return (
		allowsRepoSuperset(defaultSchemaPolicy, storedSchema, candidate) &&
		getDiscrepanciesInAllowedContent(viewSchema, candidate)[Symbol.iterator]().next().done ===
			true
	);
}

function formatViewIncompatibility(value: Discrepancy): SchemaViewIncompatibility {
	switch (value.mismatch) {
		case "allowedTypes": {
			const view = value.view.map(({ type }) => type.identifier).sort();
			const stored = [...value.stored].sort();
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				view,
				...(value.stagedView === undefined
					? {}
					: {
							stagedView: value.stagedView.map(({ type }) => type.identifier).sort(),
						}),
				stored,
				...(value.viewIsStagedOptional === true
					? { viewIsStagedOptional: value.viewIsStagedOptional }
					: {}),
				reason: `Cannot view ${describeFieldLocation(value)}: ${[
					view.length > 0
						? `the view allows node types ${JSON.stringify(view)} that the stored schema does not allow`
						: undefined,
					stored.length > 0
						? `the stored schema allows node types ${JSON.stringify(stored)} that the view does not allow`
						: undefined,
				]
					.filter((difference) => difference !== undefined)
					.join("; ")}.`,
			};
		}
		case "fieldKind": {
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				view: value.view,
				stored: value.stored,
				...(value.viewIsStagedOptional === true
					? { viewIsStagedOptional: value.viewIsStagedOptional }
					: {}),
				reason: `Cannot view ${describeFieldLocation(value)}: the view permits ${describeFieldKind(value.view)}, but the stored schema permits ${describeFieldKind(value.stored)}.`,
			};
		}
		case "valueSchema": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				view: formatValueSchema(value.view),
				stored: formatValueSchema(value.stored),
				reason: `Cannot view node type ${JSON.stringify(value.identifier)}: the view expects ${describeValueSchema(value.view)}, but the stored schema allows ${describeValueSchema(value.stored)}.`,
			};
		}
		case "nodeKind": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				view: NodeKind[value.view],
				stored: getStoredNodeKind(value.stored),
				reason: `Cannot view node type ${JSON.stringify(value.identifier)}: the stored node structure does not match the view's ${NodeKind[value.view]} definition (stored representation: ${getStoredNodeKind(value.stored)}).`,
			};
		}
		default: {
			return unreachableCase(value);
		}
	}
}

function formatUpgradeIncompatibility(
	value: StoredSchemaUpgradeDiscrepancy,
): SchemaUpgradeIncompatibility {
	switch (value.mismatch) {
		case "allowedTypes": {
			const stored = [...value.stored].filter((type) => !value.proposed.has(type)).sort();
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				proposed: [...value.proposed].filter((type) => !value.stored.has(type)).sort(),
				stored,
				reason: `Cannot upgrade ${describeFieldLocation(value)}: the proposed schema removes allowed node types ${JSON.stringify(stored)}.`,
			};
		}
		case "fieldKind": {
			return {
				mismatch: value.mismatch,
				location: formatDiscrepancyLocation(value),
				proposed: value.proposed,
				stored: value.stored,
				reason: `Cannot upgrade ${describeFieldLocation(value)}: changing from ${describeFieldKind(value.stored)} to ${describeFieldKind(value.proposed)} is not permitted by the schema upgrade rules.`,
			};
		}
		case "valueSchema": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				proposed: formatValueSchema(value.proposed),
				stored: formatValueSchema(value.stored),
				reason: `Cannot upgrade node type ${JSON.stringify(value.identifier)}: changing leaf values from ${describeValueSchema(value.stored)} to ${describeValueSchema(value.proposed)} is not permitted.`,
			};
		}
		case "nodeKind": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				proposed: getStoredNodeKind(value.proposed),
				stored: getStoredNodeKind(value.stored),
				reason: `Cannot upgrade node type ${JSON.stringify(value.identifier)}: changing the stored node representation from ${getStoredNodeKind(value.stored)} to ${getStoredNodeKind(value.proposed)} is not permitted.`,
			};
		}
		case "missingNodeSchema": {
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				reason: `Cannot upgrade node type ${JSON.stringify(value.identifier)}: its stored definition is missing from the proposed schema.`,
			};
		}
		case "nodeSchemaCannotBeSatisfied": {
			const { requirement } = value;
			const cause =
				requirement.kind === "requiredMapEntries"
					? "the proposed map requires an entry for every possible key, which cannot be satisfied by a finite tree"
					: requirement.allowedTypes.size === 0
						? `required field ${JSON.stringify(requirement.fieldKey)} allows no child types`
						: `required field ${JSON.stringify(requirement.fieldKey)} has no child type that can be constructed using the existing stored definitions (allowed types: ${JSON.stringify([...requirement.allowedTypes].sort())})`;
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				reason: `Cannot upgrade node type ${JSON.stringify(value.identifier)}: ${cause}.`,
			};
		}
		default: {
			return unreachableCase(value);
		}
	}
}

/**
 * Explains the schema requirements that prevent upgrading `stored` to `proposed`.
 */
function getSchemaUpgradeIncompatibilityDetails(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	proposed: TreeStoredSchema,
): readonly SchemaUpgradeIncompatibility[] | undefined {
	const discrepancies: StoredSchemaUpgradeDiscrepancy[] = [];
	if (!allowsRepoSuperset(defaultSchemaPolicy, stored, proposed, discrepancies)) {
		return discrepancies.map((discrepancy) => formatUpgradeIncompatibility(discrepancy));
	}
	return getPostUpgradeViewIncompatibilities(viewSchema, proposed);
}

/**
 * Explains why an otherwise permitted stored-schema upgrade would still prevent viewing.
 */
function getPostUpgradeViewIncompatibilities(
	viewSchema: TreeSchema,
	candidate: TreeStoredSchema,
): readonly SchemaUpgradeIncompatibility[] | undefined {
	const incompatibilities = [...getDiscrepanciesInAllowedContent(viewSchema, candidate)].map(
		(discrepancy) => formatViewIncompatibility(discrepancy),
	);
	return incompatibilities.length === 0
		? undefined
		: [
				{
					mismatch: "viewIncompatibleAfterUpgrade",
					reason:
						"Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.",
					incompatibilities,
				},
			];
}

function formatDiscrepancyLocation(
	value: SchemaDiscrepancyLocation,
): Extract<SchemaViewIncompatibility, { mismatch: "fieldKind" }>["location"] {
	return value.identifier === undefined
		? "root"
		: { nodeType: value.identifier, fieldKey: value.fieldKey };
}

function formatValueSchema(value: ValueSchema | undefined): string | undefined {
	return value === undefined ? undefined : ValueSchema[value];
}

function describeFieldLocation(value: SchemaDiscrepancyLocation): string {
	return value.identifier === undefined
		? "the root field"
		: value.fieldKey === undefined
			? `map entries of node type ${JSON.stringify(value.identifier)}`
			: `field ${JSON.stringify(value.fieldKey)} of node type ${JSON.stringify(value.identifier)}`;
}

function describeFieldKind(kind: string): string {
	switch (kind) {
		case "Value": {
			return "exactly one child";
		}
		case "Optional": {
			return "zero or one child";
		}
		case "Sequence": {
			return "zero or more children";
		}
		case "Forbidden": {
			return "no children";
		}
		case "Identifier": {
			return "exactly one identifier string";
		}
		default: {
			return `field kind ${JSON.stringify(kind)}`;
		}
	}
}

function describeValueSchema(value: ValueSchema | undefined): string {
	return value === undefined
		? "values without a value-type constraint"
		: value === ValueSchema.FluidHandle
			? "Fluid handle values"
			: `${ValueSchema[value].toLowerCase()} values`;
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
		discrepancies.push(formatViewIncompatibility(discrepancy));
	}
	const canView = discrepancies.length === 0;

	const enabledUpgrades = computeUpgradeStatuses(totalLocations, enabledLocations);
	const wouldUpgradeTo = getSchemaUpgradeCandidate(viewSchema, stored, configuredPolicy);

	const upgradeDiscrepancies: StoredSchemaUpgradeDiscrepancy[] | undefined = canView
		? undefined
		: [];
	// The upgrade must continue to allow all content permitted by the stored schema and let this view read and edit the resulting schema.
	const canUpgradeStored = allowsRepoSuperset(
		policy,
		stored,
		wouldUpgradeTo,
		upgradeDiscrepancies,
	);
	const postUpgradeViewIncompatibilities =
		canUpgradeStored && !canView
			? getPostUpgradeViewIncompatibilities(viewSchema, wouldUpgradeTo)
			: undefined;
	const canUpgrade =
		canUpgradeStored &&
		(canView
			? getDiscrepanciesInAllowedContent(viewSchema, wouldUpgradeTo)[Symbol.iterator]().next()
					.done === true
			: postUpgradeViewIncompatibilities === undefined);

	// `isEquivalent` (deprecated) compares the view's generated schema, independently of upgrades already enabled in this document.
	const viewStoredSchema = toInitialSchema(viewSchema.root, configuredPolicy);
	const isEquivalent =
		canView &&
		allowsRepoSuperset(policy, stored, viewStoredSchema) &&
		allowsRepoSuperset(policy, viewStoredSchema, stored);

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
						viewSchema,
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
		const incompatibilities = canUpgradeStored
			? postUpgradeViewIncompatibilities
			: upgradeDiscrepancies.map((discrepancy) => formatUpgradeIncompatibility(discrepancy));
		assert(
			incompatibilities !== undefined && incompatibilities.length > 0,
			"A blocked upgrade must have incompatibilities.",
		);
		upgradeResult = {
			isCompatible: false,
			incompatibilities,
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
