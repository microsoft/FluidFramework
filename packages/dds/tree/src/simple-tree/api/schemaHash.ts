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
	type TreeStoredSchema,
} from "../../core/index.js";
import {
	compareStrings,
	isReadonlyArray,
	type JsonCompatibleReadOnly,
} from "../../util/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { toInitialSchema } from "../treeSchema.js";

import {
	SchemaIdentityInternal,
	type IdentifySchemaOptions,
	type SchemaIdentity,
} from "./schemaIdentity.js";

/**
 * Configures hashing and application-defined versions for {@link identifySchemaWithHash}.
 *
 * @remarks
 * Inherits version configuration from {@link IdentifySchemaOptions} and adds an optional expected hash for schema checks.
 *
 * @alpha @input
 */
export interface IdentifySchemaWithHashOptions extends IdentifySchemaOptions {
	/**
	 * An optional hash used to detect unintended schema changes.
	 *
	 * @remarks
	 * When provided, view construction compares this value with a hash of the view schema and configured staged upgrade policy,
	 * independent of the document, and throws a UsageError with both hashes if they differ.
	 * If the change is intentional, this value can be updated with the actual hash from the error;
	 * when versions are configured, the error also suggests considering an increase to the relevant version.
	 *
	 * Omitting this value skips the construction check but still enables hash telemetry.
	 */
	readonly expectedHash?: string;
}

/**
 * Enables schema hash telemetry and optional checks when constructing a view.
 *
 * @remarks
 * Assigning the result to {@link ITreeViewConfigurationAlpha.schemaIdentity} enables runtime hash logging during initialization and schema upgrades.
 * Telemetry identifies the stored schema applied by initialization or upgrade, including schema retained from the existing document.
 * The optional {@link IdentifySchemaWithHashOptions.expectedHash} enables checks for unintended schema changes when constructing a view.
 *
 * The {@link IdentifySchemaOptions.schemaVersion} option combines hashing with application-defined versions.
 * Those versions follow the rules in {@link SchemaIdentity.schemaVersion} but do not affect the runtime hash,
 * so a version-only change does not require updating the expected hash.
 *
 * For versioning without hashing, {@link identifySchema} avoids the bundle-size cost of schema hashing.
 *
 * @param options - Optional expected hash and application-defined versions.
 *
 * @returns An immutable schema identity with hashing enabled.
 *
 * @see {@link identifySchema} to use application versions without hashing.
 *
 * @alpha
 */
export function identifySchemaWithHash(
	options: IdentifySchemaWithHashOptions = {},
): SchemaIdentity {
	return new SchemaIdentityInternal(
		options.expectedHash,
		computeStoredSchemaHash,
		options.schemaVersion,
	);
}

/**
 * Computes a hash from a view schema.
 *
 * @remarks
 * The hash includes schema structure and persisted metadata after applying the provided staged upgrade policy.
 * It excludes application-defined versions, so version-only updates leave the hash unchanged.
 * To keep the result stable across equivalent schema definitions, object keys and allowed types are sorted before hashing;
 * metadata array order is preserved and therefore does affect the hash.
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
	return computeStoredSchemaHash(toInitialSchema(schema, stagedSchemaUpgrades));
}

/**
 * Hashes a stored schema using the canonical representation shared with {@link computeSchemaHash}.
 */
function computeStoredSchemaHash(schema: TreeStoredSchema): string {
	const serialized = JSON.stringify({
		root: serializeField(schema.rootFieldSchema),
		nodes: Object.fromEntries(
			[...schema.nodeSchema].map(([identifier, node]) => [identifier, serializeNode(node)]),
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
