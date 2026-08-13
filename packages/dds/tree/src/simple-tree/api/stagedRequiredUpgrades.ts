/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectNodeStoredSchema, type TreeStoredSchema } from "../../core/index.js";
import { FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { SchemaUpgrade, type StagedSchemaUpgradePolicy } from "../core/index.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";
import {
	resolveStoredSchemaGenerationOptions,
	toStoredSchema,
	toUpgradeSchema,
} from "../toStoredSchema.js";
import type { TreeSchema } from "../treeSchema.js";

/**
 * Collects the {@link SchemaUpgrade} tokens of {@link SchemaStaticsAlpha.stagedRequired | staged required} fields in
 * `viewSchema` whose corresponding field in `stored` has already been tightened to `Required`.
 *
 * @remarks
 * This makes the staged required upgrade monotonic: once an application has explicitly tightened a staged required
 * field in the stored schema, a client running the staged view schema must not propose an "upgrade" which loosens it
 * back to `Optional`. Without this, {@link TreeView.upgradeSchema} would revert the tightening.
 *
 * Only fields which are actually reachable and present in the stored schema are considered, so this is safe to call
 * with a stored schema which is unrelated to the view schema.
 */
export function getAppliedStagedRequiredUpgrades(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
): ReadonlySet<SchemaUpgrade> {
	const applied = new Set<SchemaUpgrade>();

	const rootUpgrade = viewSchema.root.isStagedRequired;
	if (
		rootUpgrade instanceof SchemaUpgrade &&
		stored.rootFieldSchema.kind === FieldKinds.required.identifier
	) {
		applied.add(rootUpgrade);
	}

	for (const [identifier, nodeSchema] of viewSchema.definitions) {
		if (!isObjectNodeSchema(nodeSchema)) {
			continue;
		}
		const storedNode = stored.nodeSchema.get(brand(identifier));
		if (!(storedNode instanceof ObjectNodeStoredSchema)) {
			continue;
		}
		for (const fieldSchema of nodeSchema.fields.values()) {
			const upgrade = fieldSchema.isStagedRequired;
			if (
				upgrade instanceof SchemaUpgrade &&
				storedNode.getFieldSchema(brand(fieldSchema.storedKey)).kind ===
					FieldKinds.required.identifier
			) {
				applied.add(upgrade);
			}
		}
	}

	return applied;
}

/**
 * Computes the {@link TreeStoredSchema} that {@link TreeView.upgradeSchema} would apply to a document which currently
 * uses `stored`.
 *
 * @remarks
 * This is {@link toUpgradeSchema} (the maximally restrictive projection of the view schema, which never applies a
 * staged upgrade on its own) except that {@link SchemaStaticsAlpha.stagedRequired | staged required} fields which have
 * already been tightened in `stored` stay tightened.
 *
 * Note that this never *applies* a staged required upgrade on its own: tightening a stored field from `Optional` to
 * `Required` is a narrowing change and must always be opted into explicitly by the application
 * (see {@link StagedSchemaUpgradePolicy.includeStagedRequired}).
 *
 * @param viewSchema - The view schema to project into a stored schema.
 * @param stored - The stored schema of the document being upgraded.
 * @param stagedSchemaUpgrades - Staged schema upgrades enabled for this view, or explicit stored-schema generation
 * options. Any staged required upgrades already applied in `stored` are enabled in addition to these.
 */
export function computeUpgradeSchema(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	const applied = getAppliedStagedRequiredUpgrades(viewSchema, stored);
	if (applied.size === 0) {
		// Common case: use the cached, allocation-free path.
		return toUpgradeSchema(viewSchema.root, stagedSchemaUpgrades);
	}
	// This path deliberately bypasses the `toStoredSchema` cache: the options object is keyed by identity and depends
	// on `stored`, so caching it across different documents would be incorrect.
	const base = resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades);
	return toStoredSchema(viewSchema.root, {
		includeStaged: (upgrade) => base.includeStaged(upgrade),
		includeStagedOptional: (upgrade) => base.includeStagedOptional(upgrade),
		includeStagedRequired: (upgrade) =>
			base.includeStagedRequired?.(upgrade) === true || applied.has(upgrade),
	});
}
