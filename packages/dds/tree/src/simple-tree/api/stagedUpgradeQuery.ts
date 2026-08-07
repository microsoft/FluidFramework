/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
} from "../../core/index.js";
import { FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	type SchemaUpgrade,
	NodeKind,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type TreeNodeSchema,
} from "../core/index.js";
import {
	createFieldSchema,
	FieldKind,
	type FieldSchema,
	FieldSchemaAlpha,
} from "../fieldSchema.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
	isRecordNodeSchema,
} from "../node-kinds/index.js";
import type { TreeSchema } from "../treeSchema.js";

import { tryStoredSchemaAsArray } from "./customTree.js";

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
 * Computes the enablement status of all {@link SchemaUpgrade} tokens in the given stored schema.
 *
 * For each token, tracks how many locations it guards and how many are enabled,
 * producing a `"disabled"`, `"partial"`, or `"enabled"` status.
 *
 * @remarks
 * This uses a view->stored parallel walk that iterates `viewSchema.definitions` and pairs each
 * element with its corresponding stored schema entry. The same structural pattern exists in
 * `discrepancies.ts` (`getDiscrepanciesInAllowedContent` and helpers). If discrepancies is
 * refactored to use the shared `enumerateNodeFieldPairs` utility, this code could be further
 * consolidated.
 */
export function findEnabledUpgrades(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
): ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus> {
	// Track total locations and enabled locations per upgrade token.
	const totalLocations = new Map<SchemaUpgrade, number>();
	const enabledLocations = new Map<SchemaUpgrade, number>();

	// Check root field.
	collectUpgradeLocationsFromField(viewSchema.root, stored.rootFieldSchema, totalLocations, enabledLocations);

	// Check each view node definition paired with its stored counterpart.
	for (const [identifier, viewNode] of viewSchema.definitions) {
		const storedNode = stored.nodeSchema.get(brand(identifier));
		if (storedNode === undefined) {
			continue;
		}

		collectUpgradeLocationsFromNode(viewNode, storedNode, totalLocations, enabledLocations);
	}

	// Compute status from counts. Only include non-disabled entries.
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

// #region Node field pair traversal

/**
 * Result of enumerating view/stored field pairs from a node.
 * Either a field pair (for objects, maps, records) or an allowed-types pair (for arrays).
 */
type NodeFieldPair =
	| { kind: "field"; viewField: FieldSchema; storedField: TreeFieldStoredSchema; fieldKey: FieldKey }
	| { kind: "allowedTypes"; viewAllowedTypes: readonly AnnotatedAllowedType<TreeNodeSchema>[]; storedAllowedTypes: TreeTypeSet };

/**
 * Enumerates the view/stored field pairs for a given node, handling the dispatch by node kind.
 *
 * @remarks
 * For object nodes, yields each view field paired with its stored counterpart.
 * For array nodes, yields the allowed types pair directly (arrays have no field-level structure).
 * For map/record nodes, yields the synthetic optional field paired with stored map fields.
 * For leaf nodes, yields nothing.
 *
 * Returns nothing if the stored node kind doesn't match the view node kind in a way that
 * prevents field-level comparison (caller should handle this case).
 */
function* enumerateNodeFieldPairs(
	viewNode: TreeNodeSchema,
	storedNode: TreeNodeStoredSchema,
): Iterable<NodeFieldPair> {
	switch (viewNode.kind) {
		case NodeKind.Object: {
			assert(
				isObjectNodeSchema(viewNode),
				"schema with node kind of object must implement ObjectNodeSchema",
			);
			if (!(storedNode instanceof ObjectNodeStoredSchema)) {
				return;
			}
			for (const [_, { storedKey, schema }] of viewNode.flexKeyMap) {
				const storedField =
					storedNode.objectNodeFields.get(storedKey) ?? storedEmptyFieldSchema;
				yield { kind: "field", viewField: schema, storedField, fieldKey: storedKey };
			}
			return;
		}
		case NodeKind.Array: {
			assert(
				isArrayNodeSchema(viewNode),
				"schema with node kind of array must implement ArrayNodeSchema",
			);
			const storedTypes = tryStoredSchemaAsArray(storedNode);
			if (storedTypes === undefined) {
				return;
			}
			yield {
				kind: "allowedTypes",
				viewAllowedTypes: normalizeAndEvaluateAnnotatedAllowedTypes(viewNode.info).types,
				storedAllowedTypes: storedTypes,
			};
			return;
		}
		case NodeKind.Map: {
			assert(
				isMapNodeSchema(viewNode),
				"schema with node kind of map must implement MapNodeSchema",
			);
			if (!(storedNode instanceof MapNodeStoredSchema)) {
				return;
			}
			yield {
				kind: "field",
				viewField: createFieldSchema(FieldKind.Optional, viewNode.info),
				storedField: storedNode.mapFields,
				fieldKey: EmptyKey,
			};
			return;
		}
		case NodeKind.Record: {
			assert(
				isRecordNodeSchema(viewNode),
				"schema with node kind of record must implement RecordNodeSchema",
			);
			if (!(storedNode instanceof MapNodeStoredSchema)) {
				return;
			}
			yield {
				kind: "field",
				viewField: createFieldSchema(FieldKind.Optional, viewNode.info),
				storedField: storedNode.mapFields,
				fieldKey: EmptyKey,
			};
			return;
		}
		case NodeKind.Leaf: {
			return;
		}
		default: {
			unreachableCase(viewNode.kind);
		}
	}
}

// #endregion

// #region Upgrade collection helpers

function collectUpgradeLocationsFromNode(
	viewNode: TreeNodeSchema,
	storedNode: TreeNodeStoredSchema,
	totalLocations: Map<SchemaUpgrade, number>,
	enabledLocations: Map<SchemaUpgrade, number>,
): void {
	for (const pair of enumerateNodeFieldPairs(viewNode, storedNode)) {
		if (pair.kind === "field") {
			collectUpgradeLocationsFromField(pair.viewField, pair.storedField, totalLocations, enabledLocations);
		} else {
			// Arrays: check allowed types directly (no field-level structure).
			collectUpgradeLocationsFromAllowedTypes(
				pair.viewAllowedTypes,
				pair.storedAllowedTypes,
				totalLocations,
				enabledLocations,
			);
		}
	}
}

function collectUpgradeLocationsFromField(
	viewField: FieldSchema,
	storedField: TreeFieldStoredSchema,
	totalLocations: Map<SchemaUpgrade, number>,
	enabledLocations: Map<SchemaUpgrade, number>,
): void {
	assert(
		viewField instanceof FieldSchemaAlpha,
		"all field schema should be FieldSchemaAlpha",
	);

	// Staged-optional: count this location.
	if (viewField.isStagedOptional !== false) {
		const upgrade = viewField.isStagedOptional;
		totalLocations.set(upgrade, (totalLocations.get(upgrade) ?? 0) + 1);
		if (storedField.kind === FieldKinds.optional.identifier) {
			enabledLocations.set(upgrade, (enabledLocations.get(upgrade) ?? 0) + 1);
		}
	}

	if (storedField.types !== undefined) {
		collectUpgradeLocationsFromAllowedTypes(
			viewField.allowedTypesFull.evaluate().types,
			storedField.types,
			totalLocations,
			enabledLocations,
		);
	}
}

function collectUpgradeLocationsFromAllowedTypes(
	viewAllowedTypes: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	storedAllowedTypes: TreeTypeSet,
	totalLocations: Map<SchemaUpgrade, number>,
	enabledLocations: Map<SchemaUpgrade, number>,
): void {
	for (const allowedType of viewAllowedTypes) {
		if (allowedType.metadata.stagedSchemaUpgrade !== undefined) {
			const upgrade = allowedType.metadata.stagedSchemaUpgrade;
			totalLocations.set(upgrade, (totalLocations.get(upgrade) ?? 0) + 1);
			if (storedAllowedTypes.has(brand(allowedType.type.identifier))) {
				enabledLocations.set(upgrade, (enabledLocations.get(upgrade) ?? 0) + 1);
			}
		}
	}
}

// #endregion
