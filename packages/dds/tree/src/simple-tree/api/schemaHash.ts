/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { fail } from "@fluidframework/core-utils/internal";
import { sha256 } from "sha.js";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
} from "../../core/index.js";
import {
	compareStrings,
	isReadonlyArray,
	type JsonCompatibleReadOnly,
} from "../../util/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { toInitialSchema } from "../toStoredSchema.js";

/**
 * Computes a hash from a view schema.
 *
 * @remarks
 * The hash includes the schema structure and persisted metadata, with the provided
 * enabled staged upgrades.
 * Object key order and allowed-type order do not affect the hash, but metadata array order does.
 *
 * @param schema - the view schema to hash
 * @param stagedSchemaUpgrades - the {@link SchemaUpgrade | staged upgrades} to include,
 * or a {@link (StagedSchemaUpgradePolicy:interface)} that selects them
 * If not provided, no staged upgrades are included.
 *
 * @returns the SHA-256 hash of the schema, in hexadecimal
 *
 * @alpha
 */
export function computeSchemaHash(
	schema: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): string {
	const normalized = toInitialSchema(schema, stagedSchemaUpgrades);
	const serialized = JSON.stringify({
		root: serializeField(normalized.rootFieldSchema),
		nodes: Object.fromEntries(
			[...normalized.nodeSchema].map(([identifier, node]) => [
				identifier,
				serializeNode(node),
			]),
		),
	});
	// Normalize metadata to its JSON representation before sorting object keys.
	const persisted = JSON.parse(serialized) as JsonCompatibleReadOnly;
	return new sha256().update(canonicalize(persisted)).digest("hex");
}

function serializeField(schema: TreeFieldStoredSchema): JsonCompatibleReadOnly {
	return {
		kind: schema.kind,
		types: [...schema.types].sort(compareStrings),
		metadata: schema.persistedMetadata,
	};
}

function serializeNode(schema: TreeNodeStoredSchema): JsonCompatibleReadOnly {
	if (schema instanceof LeafNodeStoredSchema) {
		return { leaf: schema.leafValue };
	}
	if (schema instanceof MapNodeStoredSchema) {
		return { map: serializeField(schema.mapFields), metadata: schema.metadata };
	}
	if (schema instanceof ObjectNodeStoredSchema) {
		return {
			object: Object.fromEntries(
				[...schema.objectNodeFields].map(([key, field]) => [key, serializeField(field)]),
			),
			metadata: schema.metadata,
		};
	}
	fail("Unsupported schema node kind.");
}

/**
 * Serializes JSON with sorted object keys so key order does not affect the hash.
 */
function canonicalize(value: JsonCompatibleReadOnly | undefined): string {
	if (value === undefined) {
		throw new UsageError("Canonical schema hash input cannot contain undefined.");
	}
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (isReadonlyArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(",")}]`;
	}
	return `{${Object.entries(value)
		.sort(([a], [b]) => compareStrings(a, b))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
		.join(",")}}`;
}
