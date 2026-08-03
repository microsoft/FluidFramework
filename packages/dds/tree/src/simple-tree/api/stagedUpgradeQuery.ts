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
 * Computes the set of all {@link SchemaUpgrade} tokens that are enabled in the given stored schema.
 *
 * A token is considered enabled if at least one staged member guarded by it in the view schema
 * has its corresponding upgrade present in the stored schema. This covers both staged allowed types
 * (type identifier present in stored allowed types) and staged optional fields (stored field kind
 * is optional).
 *
 * @remarks
 * This uses a view→stored parallel walk that iterates `viewSchema.definitions` and pairs each
 * element with its corresponding stored schema entry. The same structural pattern exists in
 * `discrepancies.ts` (`getDiscrepanciesInAllowedContent` and helpers). If discrepancies is
 * refactored to use the shared `enumerateNodeFieldPairs` utility, this code could be further
 * consolidated.
 */
export function findEnabledUpgrades(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
): ReadonlySet<SchemaUpgrade> {
	const enabled = new Set<SchemaUpgrade>();

	// Check root field.
	collectEnabledUpgradesFromField(viewSchema.root, stored.rootFieldSchema, enabled);

	// Check each view node definition paired with its stored counterpart.
	for (const [identifier, viewNode] of viewSchema.definitions) {
		const storedNode = stored.nodeSchema.get(brand(identifier));
		if (storedNode === undefined) {
			continue;
		}

		collectEnabledUpgradesFromNode(viewNode, storedNode, enabled);
	}

	return enabled;
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

function collectEnabledUpgradesFromNode(
	viewNode: TreeNodeSchema,
	storedNode: TreeNodeStoredSchema,
	enabled: Set<SchemaUpgrade>,
): void {
	for (const pair of enumerateNodeFieldPairs(viewNode, storedNode)) {
		if (pair.kind === "field") {
			collectEnabledUpgradesFromField(pair.viewField, pair.storedField, enabled);
		} else {
			// Arrays: check allowed types directly (no field-level structure).
			collectEnabledUpgradesFromAllowedTypes(
				pair.viewAllowedTypes,
				pair.storedAllowedTypes,
				enabled,
			);
		}
	}
}

function collectEnabledUpgradesFromField(
	viewField: FieldSchema,
	storedField: TreeFieldStoredSchema,
	enabled: Set<SchemaUpgrade>,
): void {
	assert(
		viewField instanceof FieldSchemaAlpha,
		"all field schema should be FieldSchemaAlpha",
	);

	// Staged-optional enablement: the view field is staged-optional and stored field is optional.
	if (
		viewField.isStagedOptional !== false &&
		storedField.kind === FieldKinds.optional.identifier
	) {
		enabled.add(viewField.isStagedOptional);
	}

	if (storedField.types !== undefined) {
		collectEnabledUpgradesFromAllowedTypes(
			viewField.allowedTypesFull.evaluate().types,
			storedField.types,
			enabled,
		);
	}
}

function collectEnabledUpgradesFromAllowedTypes(
	viewAllowedTypes: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	storedAllowedTypes: TreeTypeSet,
	enabled: Set<SchemaUpgrade>,
): void {
	for (const allowedType of viewAllowedTypes) {
		if (
			allowedType.metadata.stagedSchemaUpgrade !== undefined &&
			storedAllowedTypes.has(brand(allowedType.type.identifier))
		) {
			enabled.add(allowedType.metadata.stagedSchemaUpgrade);
		}
	}
}

// #endregion
