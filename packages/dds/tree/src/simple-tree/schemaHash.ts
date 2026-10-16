/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { encodeFieldSchemaV2, type TreeStoredSchema } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

/**
 * Computes a fingerprint from the effective stored-schema representation supplied by SharedTree.
 *
 * @remarks
 * Use {@link schemaHasher} for the supported hash algorithm and canonicalization.
 * Importing the implementation separately keeps hashing out of applications that do not use schema versions.
 *
 * @alpha
 */
export type SchemaHasher = (schema: JsonCompatibleReadOnly) => string;

/**
 * Produces the hash input independently of the selected storage codec.
 * Versions and hashes are intentionally excluded.
 */
export function getSchemaHashInput(schema: TreeStoredSchema): JsonCompatibleReadOnly {
	return {
		root: encodeFieldSchemaV2(schema.rootFieldSchema),
		nodes: Object.fromEntries(
			[...schema.nodeSchema].map(([identifier, node]) => [identifier, node.encodeV2()]),
		),
	};
}

/**
 * Checks an application-supplied hash before a schema that requires hashing is written.
 */
export function validateSchemaHash(
	schema: TreeStoredSchema,
	expectedHash: string | undefined,
	hasher: SchemaHasher | undefined,
	requireHash = false,
): TreeStoredSchema {
	if (
		!requireHash &&
		schema.schemaVersion === undefined &&
		expectedHash === undefined &&
		hasher === undefined
	) {
		return schema;
	}
	if (expectedHash === undefined || hasher === undefined) {
		throw new UsageError(
			"Schema versions or opted-in schema hashing require schemaHash and schemaHasher when initializing or upgrading a tree.",
		);
	}
	const actualHash = hasher(getSchemaHashInput(schema));
	if (actualHash !== expectedHash) {
		throw new UsageError(
			`Schema hash does not match the effective schema. Expected ${JSON.stringify(expectedHash)}, computed ${JSON.stringify(actualHash)}. Regenerate schemaHash using the same staged upgrade flags.`,
		);
	}
	return { ...schema, schemaHash: actualHash };
}
