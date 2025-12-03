/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../feature-libraries/index.js";

import type { SchemaCompatibilityStatus } from "./tree.js";
import { getDiscrepanciesInAllowedContent } from "./discrepancies.js";
import { toUpgradeSchema } from "../toStoredSchema.js";
import type { TreeSchema } from "./configuration.js";

/**
 * A collection of View information for schema
 * @remarks
 * This contains everything needed to determine compatibility with a given stored schema.
 */
export class SchemaCompatibilityTester {
	public constructor(
		/**
		 * Schema for the view
		 */
		public readonly viewSchema: TreeSchema,
	) {}

	/**
	 * Determines the compatibility of a stored document
	 * (based on its stored schema) with a viewer (based on its view schema).
	 *
	 * Adapters can be provided to handle differences between the two schema.
	 * Adapters should only use to types in the `view` SchemaRepository.
	 *
	 * TODO: this API violates the parse don't validate design philosophy.
	 * It should be wrapped with (or replaced by) a parse style API.
	 */
	public checkCompatibility(
		stored: TreeStoredSchema,
	): Omit<SchemaCompatibilityStatus, "canInitialize"> {
		// The public API surface assumes defaultSchemaPolicy
		const policy = defaultSchemaPolicy;

		// View schema allows a subset of documents that stored schema does, and the discrepancies are allowed by policy
		// determined by the view schema (i.e. objects with extra optional fields in the stored schema have opted into allowing this.
		// In the future, this would also include things like:
		// - fields with more allowed types in the stored schema than in the view schema have out-of-schema "unknown content" adapters
		let canView = true;

		for (const _discrepancy of getDiscrepanciesInAllowedContent(this.viewSchema, stored)) {
			canView = false;
			break;
		}

		const wouldUpgradeTo = toUpgradeSchema(this.viewSchema.root);

		const canUpgrade = allowsRepoSuperset(policy, stored, wouldUpgradeTo);

		// If true, then upgrading has no effect on what can be stored in the document.
		// TODO: This should likely be changed to indicate up a schema upgrade would be a no-op, including stored schema metadata.
		const isEquivalent =
			canView && canUpgrade && allowsRepoSuperset(policy, wouldUpgradeTo, stored);

		return {
			canView,
			canUpgrade,
			isEquivalent,
		};
	}
}
