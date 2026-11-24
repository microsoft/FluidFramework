/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	ValueSchema,
} from "../../core/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import { NodeKind } from "../core/index.js";
import {
	allowsRepoSuperset,
	type SchemaIncompatibilityLocation,
	type StoredSchemaUpgradeIncompatibility,
	SchemaComparisonMode,
	compareSchemaVersions,
	SchemaVersionComparison,
	defaultSchemaPolicy,
} from "../../feature-libraries/index.js";
import { resolveStoredSchemaGenerationOptions } from "../toStoredSchema.js";
import { getSchemaUpgradeCandidate, toInitialSchema, type TreeSchema } from "../treeSchema.js";

import { tryStoredSchemaAsArray } from "./customTree.js";
import {
	getIncompatibilitiesInAllowedContent,
	type Incompatibility,
	type UpgradeLocationCollector,
} from "./incompatibilities.js";
import type {
	SchemaCompatibilityStatusBeta,
	CompatibilityResult,
	SchemaViewIncompatibility,
	SchemaUpgradeIncompatibility,
	SchemaUpgradeVersionIncompatibility,
	SchemaDiscrepancyFieldLocation,
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
	const comparisonMode = getSchemaUpgradeComparisonMode(storedSchema, candidate);
	return (
		comparisonMode !== undefined &&
		allowsRepoSuperset(defaultSchemaPolicy, storedSchema, candidate, comparisonMode) &&
		getIncompatibilitiesInAllowedContent(viewSchema, candidate)[Symbol.iterator]().next()
			.done === true
	);
}

function getSchemaUpgradeComparisonMode(
	storedSchema: TreeStoredSchema,
	candidate: TreeStoredSchema,
): SchemaComparisonMode | undefined {
	const comparison = compareSchemaVersions(
		storedSchema.schemaVersion,
		candidate.schemaVersion,
	);
	if (
		comparison === SchemaVersionComparison.Decrease ||
		comparison === SchemaVersionComparison.Incompatible
	) {
		return undefined;
	}

	return comparison === SchemaVersionComparison.Increase &&
		storedSchema.schemaVersion !== undefined &&
		candidate.schemaVersion !== undefined
		? SchemaComparisonMode.ContentOnly
		: SchemaComparisonMode.Monotonic;
}

function formatSchemaVersionIncompatibility(
	storedSchema: TreeStoredSchema,
	candidate: TreeStoredSchema,
): SchemaUpgradeVersionIncompatibility {
	const stored =
		storedSchema.schemaVersion === undefined
			? undefined
			: Object.fromEntries(storedSchema.schemaVersion);
	const proposed =
		candidate.schemaVersion === undefined
			? undefined
			: Object.fromEntries(candidate.schemaVersion);
	return {
		mismatch: "schemaVersion",
		stored,
		proposed,
		reason: `Cannot upgrade: application-defined schema versions must not decrease or be removed (stored: ${JSON.stringify(stored)}; proposed: ${JSON.stringify(proposed)}).`,
	};
}

/**
 * Explains why the view cannot read or write content allowed by the stored schema.
 *
 * @param value - The difference found when comparing the view with the stored schema.
 * @param storedSchema - The schema used in that comparison: the current document schema
 * when checking access now, or the proposed schema when checking access after an upgrade.
 */
function formatViewIncompatibility(
	value: Incompatibility,
	storedSchema: TreeStoredSchema,
): SchemaViewIncompatibility {
	switch (value.mismatch) {
		case "allowedTypes": {
			const view = value.view.map(({ type }) => type.identifier).sort();
			const stored = [...value.stored].sort();
			return {
				mismatch: value.mismatch,
				location: formatIncompatibilityLocation(value),
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
				reason: `Cannot view ${describeFieldLocation(value, storedSchema)}: ${[
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
				location: formatIncompatibilityLocation(value),
				view: value.view,
				stored: value.stored,
				...(value.viewIsStagedOptional === true
					? { viewIsStagedOptional: value.viewIsStagedOptional }
					: {}),
				reason: `Cannot view ${describeFieldLocation(value, storedSchema)}: the view permits ${describeFieldKind(value.view)}, but the stored schema permits ${describeFieldKind(value.stored)}.`,
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
			const view = NodeKind[value.view];
			const stored = getStoredNodeKind(value.stored);
			const representation = describeNodeRepresentation(
				stored,
				storedSchema.nodeSchema.get(value.identifier),
			);
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				view,
				stored,
				reason: `Cannot view node type ${JSON.stringify(value.identifier)}: the stored node structure does not match the view's ${view} definition (stored representation: ${representation}).`,
			};
		}
		default: {
			return unreachableCase(value);
		}
	}
}

/**
 * Converts an internal upgrade incompatibility into a public incompatibility with a human-readable reason.
 *
 * @param value - The failed stored-schema upgrade requirement to describe.
 * @param storedSchema - The document's stored schema before the upgrade.
 * @param proposedSchema - The candidate stored schema after the upgrade.
 */
function formatUpgradeIncompatibility(
	value: StoredSchemaUpgradeIncompatibility,
	storedSchema: TreeStoredSchema,
	proposedSchema: TreeStoredSchema,
): SchemaUpgradeIncompatibility {
	switch (value.mismatch) {
		case "allowedTypes": {
			const stored = [...value.stored].filter((type) => !value.proposed.has(type)).sort();
			return {
				mismatch: value.mismatch,
				location: formatIncompatibilityLocation(value),
				proposed: [...value.proposed].filter((type) => !value.stored.has(type)).sort(),
				stored,
				reason:
					describeRemovedArrayOrObjectField(value, stored, storedSchema, proposedSchema) ??
					`Cannot upgrade ${describeFieldLocation(value, storedSchema, proposedSchema)}: the proposed schema removes allowed node types ${JSON.stringify(stored)}.`,
			};
		}
		case "fieldKind": {
			return {
				mismatch: value.mismatch,
				location: formatIncompatibilityLocation(value),
				proposed: value.proposed,
				stored: value.stored,
				reason: `Cannot upgrade ${describeFieldLocation(value, storedSchema, proposedSchema)}: changing from ${describeFieldKind(value.stored)} to ${describeFieldKind(value.proposed)} is not permitted by the schema upgrade rules.`,
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
			const stored = getStoredNodeKind(value.stored);
			const proposed = getStoredNodeKind(value.proposed);
			const from = describeNodeRepresentation(stored, value.stored);
			const to = describeNodeRepresentation(proposed, value.proposed);
			return {
				mismatch: value.mismatch,
				nodeType: value.identifier,
				proposed,
				stored,
				reason: `Cannot upgrade node type ${JSON.stringify(value.identifier)}: changing the stored node representation from ${from} to ${to} is not permitted.`,
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
 *
 * @param viewSchema - The view that must be able to read and write the document after the upgrade.
 * @param stored - The document schema before the upgrade.
 * @param proposed - The candidate schema to check against the upgrade rules and the view.
 * @returns The reasons the upgrade is blocked, or `undefined` if it is allowed.
 */
function getSchemaUpgradeIncompatibilityDetails(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	proposed: TreeStoredSchema,
): readonly SchemaUpgradeIncompatibility[] | undefined {
	const comparisonMode = getSchemaUpgradeComparisonMode(stored, proposed);
	if (comparisonMode === undefined) {
		return [formatSchemaVersionIncompatibility(stored, proposed)];
	}
	const incompatibilities: StoredSchemaUpgradeIncompatibility[] = [];
	if (
		!allowsRepoSuperset(
			defaultSchemaPolicy,
			stored,
			proposed,
			comparisonMode,
			incompatibilities,
		)
	) {
		return incompatibilities.map((incompatibility) =>
			formatUpgradeIncompatibility(incompatibility, stored, proposed),
		);
	}
	return getPostUpgradeViewIncompatibilities(viewSchema, proposed);
}

/**
 * Explains why an otherwise permitted stored-schema upgrade would still prevent viewing.
 *
 * @param viewSchema - The view that requested the upgrade.
 * @param candidate - The stored schema the view would use after the upgrade.
 * @returns An upgrade incompatibility that lists the viewing failures, or `undefined` if the view can use the candidate.
 */
function getPostUpgradeViewIncompatibilities(
	viewSchema: TreeSchema,
	candidate: TreeStoredSchema,
): readonly SchemaUpgradeIncompatibility[] | undefined {
	const incompatibilities = [
		...getIncompatibilitiesInAllowedContent(viewSchema, candidate),
	].map((incompatibility) => formatViewIncompatibility(incompatibility, candidate));
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

function formatIncompatibilityLocation(
	value: SchemaIncompatibilityLocation,
): SchemaDiscrepancyFieldLocation {
	return value.identifier === undefined
		? "root"
		: { nodeType: value.identifier, fieldKey: value.fieldKey };
}

function formatValueSchema(value: ValueSchema | undefined): string | undefined {
	return value === undefined ? undefined : ValueSchema[value];
}

/**
 * Names the field in a viewing or upgrade reason.
 * An object field can also have an empty key, so the key identifies array elements
 * only if the stored or proposed node has array structure.
 *
 * @param value - The location of the field, including its containing node type if it is not the root.
 * @param storedSchema - The schema checked for viewing, or the document schema before an upgrade.
 * @param proposedSchema - The candidate schema for an upgrade. Omit it for a viewing reason.
 */
function describeFieldLocation(
	value: SchemaIncompatibilityLocation,
	storedSchema: TreeStoredSchema,
	proposedSchema?: TreeStoredSchema,
): string {
	if (value.identifier === undefined) {
		return "the root field";
	}
	const storedIsArray = hasArrayStructure(storedSchema.nodeSchema.get(value.identifier));
	const proposedIsArray = hasArrayStructure(proposedSchema?.nodeSchema.get(value.identifier));
	const location =
		value.fieldKey === undefined
			? `map entries of node type ${JSON.stringify(value.identifier)}`
			: value.fieldKey === EmptyKey && (storedIsArray || proposedIsArray)
				? `array elements of node type ${JSON.stringify(value.identifier)} (stored key "")`
				: `field ${JSON.stringify(value.fieldKey)} of node type ${JSON.stringify(value.identifier)}`;
	return proposedSchema !== undefined && storedIsArray !== proposedIsArray
		? `${location} (${storedIsArray ? "stored" : "proposed"} schema has array structure)`
		: location;
}

/**
 * Describes the content lost when a change between an array and an object removes a field.
 *
 * @param location - The node type and field key where the allowed types differ.
 * @param removedTypes - The child types the stored field allows but the proposed schema no longer allows at that key.
 * @param storedSchema - The document schema that defines the field and its allowed child types.
 * @param proposedSchema - The candidate schema that may omit the field.
 * @returns A reason that names the lost array elements or object field,
 * or `undefined` for other changes so the caller can report the removed types directly.
 */
function describeRemovedArrayOrObjectField(
	location: SchemaIncompatibilityLocation,
	removedTypes: readonly TreeNodeSchemaIdentifier[],
	storedSchema: TreeStoredSchema,
	proposedSchema: TreeStoredSchema,
): string | undefined {
	const { identifier, fieldKey } = location;
	if (identifier === undefined || fieldKey === undefined) {
		return undefined;
	}
	const stored = storedSchema.nodeSchema.get(identifier);
	const proposed = proposedSchema.nodeSchema.get(identifier);
	if (
		!(stored instanceof ObjectNodeStoredSchema) ||
		!(proposed instanceof ObjectNodeStoredSchema) ||
		proposed.objectNodeFields.has(fieldKey)
	) {
		return undefined;
	}
	const storedIsArray = hasArrayStructure(stored);
	const proposedIsArray = hasArrayStructure(proposed);
	if (storedIsArray === proposedIsArray) {
		return undefined;
	}

	const types = removedTypes
		.map((type) => describeAllowedNodeType(type, storedSchema))
		.join(", ");
	const node = JSON.stringify(identifier);
	const field = JSON.stringify(fieldKey);
	return storedIsArray
		? `Cannot upgrade node type ${node}: the stored array allows ${types} as elements, but the proposed object has no array elements.`
		: `Cannot upgrade node type ${node}: the stored object allows ${types} in field ${field}, but the proposed array has no field ${field}.`;
}

/**
 * Names the values a removed child type allowed. For leaves, the name describes the values
 * rather than the schema identifier, for example, "strings". Other types keep their identifier.
 *
 * @param type - The identifier of a child type allowed by the stored field.
 * @param storedSchema - The schema before the upgrade, where the child type's definition is looked up.
 */
function describeAllowedNodeType(
	type: TreeNodeSchemaIdentifier,
	storedSchema: TreeStoredSchema,
): string {
	const schema = storedSchema.nodeSchema.get(type);
	if (!(schema instanceof LeafNodeStoredSchema)) {
		return `nodes of type ${JSON.stringify(type)}`;
	}
	switch (schema.leafValue) {
		case ValueSchema.Boolean: {
			return "booleans";
		}
		case ValueSchema.FluidHandle: {
			return "Fluid handles";
		}
		case ValueSchema.Null: {
			return "null";
		}
		case ValueSchema.Number: {
			return "numbers";
		}
		case ValueSchema.String: {
			return "strings";
		}
		default: {
			return unreachableCase(schema.leafValue);
		}
	}
}

/**
 * Describes a stored node kind in a reason. Arrays have the stored kind `Object`,
 * so the reason also identifies their array structure.
 *
 * @param kind - The stored kind reported in the structured incompatibility.
 * @param schema - The node definition used to identify array structure. If absent, only the kind is reported.
 */
function describeNodeRepresentation(
	kind: ReturnType<typeof getStoredNodeKind>,
	schema: TreeNodeStoredSchema | undefined,
): string {
	return hasArrayStructure(schema) ? `${kind} (array structure)` : kind;
}

/**
 * Tests whether a stored node has the shape of a simple-tree array:
 * an object with a single sequence field at the empty key.
 *
 * @param schema - The stored node definition to check, or `undefined` if the schema has no definition for the node.
 */
function hasArrayStructure(schema: TreeNodeStoredSchema | undefined): boolean {
	return (
		schema instanceof ObjectNodeStoredSchema &&
		schema.objectNodeFields.size === 1 &&
		tryStoredSchemaAsArray(schema) !== undefined
	);
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
	schema: TreeNodeStoredSchema | Extract<Incompatibility, { mismatch: "nodeKind" }>["stored"],
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

	// Collect upgrade locations during the incompatibility walk (single pass).
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

	// View schema allows a subset of documents that stored schema does, and the incompatibilities are allowed by policy
	// determined by the view schema (i.e. objects with extra optional fields in the stored schema have opted into allowing this.
	// In the future, this would also include things like:
	// - fields with more allowed types in the stored schema than in the view schema have out-of-schema "unknown content" adapters
	// Complete the full walk even after finding an incompatibility so incompatibility details and
	// staged-upgrade status contain all available information for debugging.
	const viewIncompatibilities: SchemaViewIncompatibility[] = [];
	for (const incompatibility of getIncompatibilitiesInAllowedContent(
		viewSchema,
		stored,
		upgradeCollector,
	)) {
		viewIncompatibilities.push(formatViewIncompatibility(incompatibility, stored));
	}
	const canView = viewIncompatibilities.length === 0;

	const enabledUpgrades = computeUpgradeStatuses(totalLocations, enabledLocations);
	const wouldUpgradeTo = getSchemaUpgradeCandidate(viewSchema, stored, configuredPolicy);

	const upgradeIncompatibilities: StoredSchemaUpgradeIncompatibility[] | undefined = canView
		? undefined
		: [];
	const comparisonMode = getSchemaUpgradeComparisonMode(stored, wouldUpgradeTo);
	// The upgrade must continue to allow all content permitted by the stored schema and let this view read and edit the resulting schema.
	const canUpgradeStored =
		comparisonMode !== undefined &&
		allowsRepoSuperset(
			policy,
			stored,
			wouldUpgradeTo,
			comparisonMode,
			upgradeIncompatibilities,
		);
	const postUpgradeViewIncompatibilities =
		canUpgradeStored && !canView
			? getPostUpgradeViewIncompatibilities(viewSchema, wouldUpgradeTo)
			: undefined;
	const canUpgrade =
		canUpgradeStored &&
		(canView
			? getIncompatibilitiesInAllowedContent(viewSchema, wouldUpgradeTo)
					[Symbol.iterator]()
					.next().done === true
			: postUpgradeViewIncompatibilities === undefined);

	// `isEquivalent` (deprecated) compares the view's generated schema, independently of upgrades already enabled in this document.
	const viewStoredSchema = toInitialSchema(
		viewSchema.root,
		configuredPolicy,
		viewSchema.schemaVersion,
	);
	const isEquivalent =
		canView &&
		allowsRepoSuperset(policy, stored, viewStoredSchema) &&
		allowsRepoSuperset(policy, viewStoredSchema, stored) &&
		compareSchemaVersions(stored.schemaVersion, viewStoredSchema.schemaVersion) ===
			SchemaVersionComparison.Equal;

	const view: CompatibilityResult<SchemaViewIncompatibility> = canView
		? { isCompatible: true }
		: { isCompatible: false, incompatibilities: viewIncompatibilities };
	let upgradeResult: CompatibilityResult<SchemaUpgradeIncompatibility>;
	if (canUpgrade) {
		upgradeResult = { isCompatible: true };
	} else if (upgradeIncompatibilities === undefined) {
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
						0xe1d /* A blocked upgrade must have incompatibilities. */,
					);
				}
				return incompatibilities;
			},
		};
	} else {
		const incompatibilities =
			comparisonMode === undefined
				? [formatSchemaVersionIncompatibility(stored, wouldUpgradeTo)]
				: canUpgradeStored
					? postUpgradeViewIncompatibilities
					: upgradeIncompatibilities.map((incompatibility) =>
							formatUpgradeIncompatibility(incompatibility, stored, wouldUpgradeTo),
						);
		assert(
			incompatibilities !== undefined && incompatibilities.length > 0,
			0xe1e /* A blocked upgrade must have incompatibilities. */,
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
