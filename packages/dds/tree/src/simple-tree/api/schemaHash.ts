/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { sha256 } from "sha.js";

import {
	compareStrings,
	isReadonlyArray,
	type JsonCompatibleReadOnly,
} from "../../util/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { getSchemaHashInput, type SchemaHasher } from "../schemaHash.js";
import { toInitialSchema } from "../toStoredSchema.js";

/**
 * Computes a deterministic hash of the effective schema.
 *
 * @remarks
 * Store the expected result in application source and update it when the effective schema changes.
 * The application must account for upgrades already enabled in the document when selecting the effective schema.
 *
 * @param schema - The view schema to convert to an effective stored schema.
 * @param stagedSchemaUpgrades - The staged upgrades to include, using the same flags as initialization or upgrade.
 * Defaults to the restrictive policy.
 *
 * @returns A hexadecimal SHA-256 fingerprint including persisted metadata, but excluding application versions.
 *
 * @alpha
 */
export function computeSchemaHash(
	schema: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): string {
	return schemaHasher(getSchemaHashInput(toInitialSchema(schema, stagedSchemaUpgrades)));
}

/**
 * The synchronous schema hasher to supply with {@link ITreeViewConfigurationAlpha.schemaHash}.
 *
 * @remarks
 * This implementation is imported separately from the configuration so applications without schema versions
 * can omit it from their bundles.
 * Hashes use sorted object keys, sorted allowed-type sets, and ordered metadata arrays.
 * Non-persisted metadata and application-defined versions do not affect the hash.
 *
 * @alpha
 */
export const schemaHasher: SchemaHasher = (schema) => {
	const serialized = JSON.stringify(schema);
	if (serialized === undefined) {
		throw new UsageError("Schema hash input must be JSON-serializable.");
	}
	// Match the persisted JSON representation before sorting object keys.
	const persisted = JSON.parse(serialized) as JsonCompatibleReadOnly;
	return new sha256().update(canonicalize(persisted)).digest("hex");
};

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
