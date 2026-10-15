/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ITreeViewConfigurationAlpha } from "./api/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "./core/index.js";
import type { ImplicitFieldSchema } from "./fieldSchema.js";

/**
 * Computes a hash from a view schema and its enabled staged upgrades.
 *
 * @remarks
 * Import {@link computeSchemaHash} separately to use the standard hashing function.
 *
 * @param schema - the view schema to hash
 * @param stagedSchemaUpgrades - the {@link SchemaUpgrade | staged upgrades} to include,
 * or a {@link (StagedSchemaUpgradePolicy:interface)} that selects them
 *
 * @returns the schema hash
 *
 * @alpha
 */
export type SchemaHasher = (
	schema: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
) => string;

/**
 * Checks a schema hash before initialization or schema upgrade.
 *
 * @param schema - the view schema
 * @param identity - the expected hash and hashing function, or undefined to skip the check
 * @param stagedSchemaUpgrades - the effective staged upgrade policy
 */
export function validateSchemaHash(
	schema: ImplicitFieldSchema,
	identity: ITreeViewConfigurationAlpha["schemaIdentity"],
	stagedSchemaUpgrades: StagedSchemaUpgradePolicy,
): void {
	if (identity === undefined) {
		return;
	}
	const { schemaHash: expectedHash, schemaHasher: hasher } = identity;
	const actualHash = hasher(schema, stagedSchemaUpgrades);
	if (actualHash !== expectedHash) {
		throw new UsageError(
			`Schema hash does not match the effective schema. Expected ${JSON.stringify(expectedHash)}, computed ${JSON.stringify(actualHash)}. Regenerate schemaHash using the same staged upgrade selection.`,
		);
	}
}
