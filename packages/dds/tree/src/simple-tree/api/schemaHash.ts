/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { fail } from "@fluidframework/core-utils/internal";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

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
import { toInitialSchema } from "../treeSchema.js";

import { SchemaIdentityInternal, type SchemaIdentity } from "./schemaIdentity.js";

/**
 * Enables schema hash telemetry and optional checks when constructing a view.
 * @remarks
 * Pass the result as {@link ITreeViewConfigurationAlpha.schemaIdentity}.
 * Import this function only when hashing is needed so the hash algorithm can be removed from other bundles.
 * @param options - Options for checking the schema hash.
 * @returns An immutable schema identity that uses SHA-256 hashing.
 * @alpha
 */
export function identifySchemaAlpha(
	options: {
		/**
		 * An optional hash used to detect unintended schema changes.
		 * @remarks
		 * The hash uses the view schema and configured staged upgrade policy, independent of the document.
		 * View construction throws a UsageError containing the expected and actual hashes if they differ.
		 * If the schema change is intentional, update this value with the actual hash from the error.
		 * Omit this value to enable telemetry without a construction check.
		 */
		readonly expectedHash?: string;
	} = {},
): SchemaIdentity {
	return new SchemaIdentityInternal(options.expectedHash, computeSchemaHash);
}

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
 * @returns the first 128 bits of the schema's SHA-256 hash, as 32 hexadecimal characters
 *
 * @internal
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
	return bytesToHex(sha256(utf8ToBytes(canonicalize(persisted))).subarray(0, 16));
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
	fail(0xd7b /* Unsupported schema node kind. */);
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
