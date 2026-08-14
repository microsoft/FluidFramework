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
 * The pair of stored schemas needed to evaluate a {@link TreeView.upgradeSchema} against a particular document.
 *
 * @remarks
 * Applying a {@link SchemaStaticsAlpha.stagedRequired | staged required} upgrade tightens a stored field from
 * `Optional` to `Required`, which is a *narrowing* change: the resulting stored schema is deliberately not a superset
 * of the document's current stored schema. Every other kind of schema upgrade must remain a superset. Keeping both
 * projections lets callers apply the superset rule to everything except the tightenings the application explicitly
 * opted into.
 */
export interface UpgradeSchemaProjection {
	/**
	 * The stored schema {@link TreeView.upgradeSchema} would apply.
	 */
	readonly target: TreeStoredSchema;

	/**
	 * The same projection as {@link UpgradeSchemaProjection.target}, except that no staged required upgrade is applied
	 * beyond those already applied in the document's stored schema.
	 *
	 * @remarks
	 * `target` differs from this only in the field kinds of staged required fields whose upgrade was explicitly
	 * enabled, so requiring this to be a superset of the stored schema is exactly the "upgrades never narrow"
	 * guarantee, minus the opted-into tightenings.
	 */
	readonly wideningOnly: TreeStoredSchema;
}

/**
 * Computes the {@link TreeStoredSchema} that {@link TreeView.upgradeSchema} would apply to a document which currently
 * uses `stored`.
 *
 * @remarks
 * See {@link computeUpgradeSchemas}. This returns only {@link UpgradeSchemaProjection.target}.
 */
export function computeUpgradeSchema(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return computeUpgradeSchemas(viewSchema, stored, stagedSchemaUpgrades).target;
}

/**
 * Computes the stored schema {@link TreeView.upgradeSchema} would apply to a document which currently uses `stored`,
 * along with the widening-only baseline used to validate it.
 *
 * @remarks
 * The target is {@link toUpgradeSchema} (the maximally restrictive projection of the view schema, which never applies
 * a staged upgrade on its own) except that {@link SchemaStaticsAlpha.stagedRequired | staged required} fields are
 * `Required` when either the application explicitly enabled their upgrade via
 * {@link (StagedSchemaUpgradePolicy:interface).includeStagedRequired}, or `stored` already tightened them (which keeps
 * the tightening monotonic: a staged client must never revert it).
 *
 * @param viewSchema - The view schema to project into a stored schema.
 * @param stored - The stored schema of the document being upgraded.
 * @param stagedSchemaUpgrades - Staged schema upgrades enabled for this view, or explicit stored-schema generation
 * options. Any staged required upgrades already applied in `stored` are enabled in addition to these.
 */
export function computeUpgradeSchemas(
	viewSchema: TreeSchema,
	stored: TreeStoredSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): UpgradeSchemaProjection {
	const applied = getAppliedStagedRequiredUpgrades(viewSchema, stored);
	const base = resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades);
	if (applied.size === 0 && base.includeStagedRequired === undefined) {
		// Common case: no staged required upgrade can apply, so both projections are the same cached schema.
		const schema = toUpgradeSchema(viewSchema.root, base);
		return { target: schema, wideningOnly: schema };
	}
	// These paths deliberately bypass the `toStoredSchema` cache: the options objects are keyed by identity and depend
	// on `stored`, so caching them across different documents would be incorrect.
	const target = toStoredSchema(viewSchema.root, {
		includeStaged: (upgrade) => base.includeStaged(upgrade),
		includeStagedOptional: (upgrade) => base.includeStagedOptional(upgrade),
		includeStagedRequired: (upgrade) =>
			base.includeStagedRequired?.(upgrade) === true || applied.has(upgrade),
	});
	const wideningOnly = toStoredSchema(viewSchema.root, {
		includeStaged: (upgrade) => base.includeStaged(upgrade),
		includeStagedOptional: (upgrade) => base.includeStagedOptional(upgrade),
		includeStagedRequired: (upgrade) => applied.has(upgrade),
	});
	return { target, wideningOnly };
}
