/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../core/index.js";

import type { SchemaUpgrade } from "./core/index.js";
import { StagedSchemaUpgradePolicy } from "./core/index.js";
import type { ImplicitFieldSchema } from "./fieldSchema.js";
import {
	getRootSchemaDerivedData,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	type RootSchemaDerivedData,
} from "./treeSchema.js";

// TODO: schemaConversion.ts, src/simple-tree/api/storedSchema.ts and src/simple-tree/core/toStored.ts should be refactored to group the logic more logically.
// The content of src/simple-tree/api/storedSchema.ts should probably removed from the API surface, replaced by simple schema snapshotting APIs.
// The simple-schema related logic from schemaConversion.ts and src/simple-tree/core/toStored.ts can be unified and `toStoredSchema` and its other ImplicitFieldSchema consuming variants should probably be removed in favor of acting on TreeSchema and SimpleTreeSchema directly.

function isStagedSchemaUpgradePolicy(
	stagedSchemaUpgrades: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): stagedSchemaUpgrades is StagedSchemaUpgradePolicy {
	return (
		typeof stagedSchemaUpgrades === "object" &&
		"includeStaged" in stagedSchemaUpgrades &&
		"includeStagedOptional" in stagedSchemaUpgrades
	);
}

/**
 * Resolves a collection of staged schema upgrades into stored-schema generation options.
 * @remarks
 * If `stagedSchemaUpgrades` is omitted, returns restrictive options.
 */
export function resolveStoredSchemaGenerationOptions(
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): StagedSchemaUpgradePolicy {
	if (stagedSchemaUpgrades === undefined) {
		return StagedSchemaUpgradePolicy.restrictive;
	}

	if (isStagedSchemaUpgradePolicy(stagedSchemaUpgrades)) {
		return stagedSchemaUpgrades;
	}

	return StagedSchemaUpgradePolicy.enabledStagedUpgrades(...stagedSchemaUpgrades);
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use in schema upgrades.
 */
export function toUpgradeSchema(
	root: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return toStoredSchema(root, resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades));
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use as initial document schema.
 */
export function toInitialSchema(
	root: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return toStoredSchema(root, resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades));
}

/**
 * Permissive staged schema upgrade policy used for unhydrated node schema generation.
 * @remarks
 * This allows as much as possible, relying on further validation when inserting the content.
 *
 * TODO: this should get additional options to enable support for unknown optional fields.
 */
export const toUnhydratedSchema: StagedSchemaUpgradePolicy =
	StagedSchemaUpgradePolicy.permissive;

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 *
 * @remarks
 * Results are shared by root and {@link (StagedSchemaUpgradePolicy:interface)} identity.
 * Roots without {@link RootSchemaDerivedData.hasStagedSchema | reachable staging} share one result across all staged-upgrade policies,
 * including {@link toUnhydratedSchema} for unhydrated contexts.
 * Different roots can share converted nodes; roots in the same policy-filtered component also share a node-definition map.
 * Root fields remain separate because their allowed types, kind, and metadata can differ.
 * Treat the returned schema as immutable.
 *
 * @privateRemarks
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 *
 * Even if this took in a SimpleTreeSchema,
 * it would still need to walk the schema to avoid including schemas that become unreachable due to filtered out staged schema.
 *
 * @throws
 * Throws a `UsageError` if multiple schemas are encountered with the same identifier.
 */
export function toStoredSchema(
	root: ImplicitFieldSchema,
	options: StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return getRootSchemaDerivedData(root).getStoredSchema(options);
}
